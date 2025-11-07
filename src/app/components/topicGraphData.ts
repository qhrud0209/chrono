import * as d3 from 'd3';

export type RelatedKeyword = {
  keywordName?: string | null;
  keywordId?: number | string | null;
  relatedness?: number | null;
};

export type BaseNode = {
  id: string;
  label: string;
  isCentral: boolean;
  relatedness?: number;
  radius: number;
  color: string;
  initialX: number;
  initialY: number;
  depth: number;
  targetRadius: number;
};

export type BaseLink = {
  source: string;
  target: string;
  weight: number;
  width: number;
  color: string;
};

export type NodeDatum = d3.SimulationNodeDatum &
  BaseNode & {
    fx?: number;
    fy?: number;
  };

export type LinkDatum = d3.SimulationLinkDatum<NodeDatum> &
  Omit<BaseLink, 'source' | 'target'> & {
    source: NodeDatum;
    target: NodeDatum;
  };

export type GraphTemplate = {
  centerId: string;
  centerLabel: string;
  nodes: BaseNode[];
  links: BaseLink[];
  adjacency: Map<string, Set<string>>;
  orderedRelated: Array<{
    id: string;
    label: string;
    relatedness: number;
  }>;
};

export type FilteredGraph = {
  centerId: string;
  nodes: NodeDatum[];
  links: LinkDatum[];
  adjacency: Map<string, Set<string>>;
};

export const JITTER_STRENGTH = 0.032;

const clampRelatedness = (value: number) => Math.max(-1, Math.min(1, value));

const toHsl = (hex: string) => {
  try {
    return d3.hsl(hex);
  } catch {
    const fallback = d3.color(hex);
    return fallback ? d3.hsl(fallback) : null;
  }
};

const saturate = (hex: string, factor: number) => {
  const color = toHsl(hex);
  if (!color) {
    return hex;
  }
  color.s = Math.min(1, color.s * factor);
  return color.formatHex();
};

const lighten = (hex: string, amount: number) => {
  const color = toHsl(hex);
  if (!color) {
    return hex;
  }
  color.l = Math.min(1, color.l + amount);
  return color.formatHex();
};

const makeNodeColor = (relatedness: number, isCentral: boolean) => {
  if (isCentral) {
    return '#445bff';
  }

  const normalized = (relatedness + 1) / 2;
  const paletteBase = d3.interpolateCubehelixLong('#223366', '#c4d5ff')(
    normalized
  );
  const saturated = saturate(paletteBase, 1.12);
  return lighten(saturated, normalized * 0.12);
};

const computeTargetRadius = (relatedness: number, baseRadius: number) => {
  const normalized = (relatedness + 1) / 2;
  const contraction = 1 - normalized * 0.45;
  return baseRadius * contraction;
};

const randomAngle = (index: number, total: number) => {
  if (total <= 0) {
    return 0;
  }
  return (index / total) * Math.PI * 2;
};

const sanitizeLabel = (value?: string | null) => {
  if (value == null) {
    return undefined;
  }
  const trimmed = value.trim();
  if (
    !trimmed ||
    trimmed.toLowerCase() === 'undefined' ||
    trimmed.toLowerCase() === 'null'
  ) {
    return undefined;
  }
  return trimmed;
};

const normalizeRelatedness = (value?: number | null) => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 0;
  }
  return clampRelatedness(value);
};

export const buildGraphTemplate = (
  center: { id: string; label: string },
  related: RelatedKeyword[],
  options?: { baseRadialDistance?: number }
): GraphTemplate => {
  const fallbackLabel =
    sanitizeLabel(center.label) ??
    sanitizeLabel(center.id) ??
    center.label ??
    '중심 키워드';
  const centerId = sanitizeLabel(center.id) ?? center.id ?? 'center';

  const cleaned = (related ?? [])
    .map((item, index) => {
      const safeLabel =
        sanitizeLabel(item.keywordName) ?? `관련 키워드 ${index + 1}`;
      const safeId =
        item.keywordId != null
          ? String(item.keywordId)
          : `${centerId}-${index + 1}`;
      return {
        keywordName: safeLabel,
        keywordId: safeId,
        relatedness: normalizeRelatedness(item.relatedness),
      };
    })
    .sort((a, b) => b.relatedness - a.relatedness);

  const baseRadialDistance = options?.baseRadialDistance ?? 280;

  const relatednessValues = cleaned.map((item) => item.relatedness);
  const minRelatedness =
    relatednessValues.length > 0
      ? Math.min(...relatednessValues)
      : 0;
  const maxRelatedness =
    relatednessValues.length > 0
      ? Math.max(...relatednessValues)
      : 0;

  const radiusScale = d3
    .scaleLinear()
    .domain(
      minRelatedness === maxRelatedness
        ? [minRelatedness - 0.01, maxRelatedness + 0.01]
        : [minRelatedness, maxRelatedness]
    )
    .range([28, 64]);

  const centerNode: BaseNode = {
    id: centerId,
    label: fallbackLabel,
    isCentral: true,
    radius: 72,
    color: makeNodeColor(1, true),
    initialX: 0,
    initialY: 0,
    depth: 0,
    targetRadius: 0,
  };

  const relatedNodes: BaseNode[] = cleaned.map((item, index) => {
    const nodeRadius = radiusScale(item.relatedness);
    const targetRadius = computeTargetRadius(
      item.relatedness,
      baseRadialDistance
    );
    const angle = randomAngle(index, cleaned.length);
    return {
      id: String(item.keywordId),
      label: item.keywordName ?? `관련 키워드 ${index + 1}`,
      isCentral: false,
      relatedness: item.relatedness,
      radius: Math.max(22, nodeRadius),
      color: makeNodeColor(item.relatedness, false),
      initialX: Math.cos(angle) * targetRadius,
      initialY: Math.sin(angle) * targetRadius,
      depth: 1,
      targetRadius,
    };
  });

  const links: BaseLink[] = relatedNodes.map((node) => ({
    source: centerNode.id,
    target: node.id,
    weight: node.relatedness ?? 0,
    width: 1.4 + Math.abs(node.relatedness ?? 0) * 1.8,
    color: 'rgba(91, 126, 215, 0.32)',
  }));

  const adjacency = new Map<string, Set<string>>();
  [centerNode, ...relatedNodes].forEach((node) =>
    adjacency.set(node.id, new Set())
  );
  links.forEach((link) => {
    adjacency.get(link.source)?.add(link.target);
    adjacency.get(link.target)?.add(link.source);
  });

  return {
    centerId: centerNode.id,
    centerLabel: centerNode.label,
    nodes: [centerNode, ...relatedNodes],
    links,
    adjacency,
    orderedRelated: relatedNodes.map((node) => ({
      id: node.id,
      label: node.label,
      relatedness: node.relatedness ?? 0,
    })),
  };
};

export const deriveGraph = (
  template: GraphTemplate,
  visibleCount: number
): FilteredGraph => {
  const clampedCount = Math.max(
    0,
    Math.min(visibleCount, template.orderedRelated.length)
  );

  const allowedIds = new Set<string>();
  allowedIds.add(template.centerId);
  template.orderedRelated.slice(0, clampedCount).forEach((item) => {
    allowedIds.add(item.id);
  });

  const nodes: NodeDatum[] = template.nodes
    .filter((node) => allowedIds.has(node.id))
    .map((node) => ({
      ...node,
      x: node.initialX,
      y: node.initialY,
      fx: node.isCentral ? 0 : undefined,
      fy: node.isCentral ? 0 : undefined,
    }));

  const peripheral = nodes.filter((node) => !node.isCentral);
  peripheral.forEach((node, index) => {
    const angle = peripheral.length
      ? (index / peripheral.length) * Math.PI * 2
      : 0;
    const baseX = Math.cos(angle) * node.targetRadius;
    const baseY = Math.sin(angle) * node.targetRadius;
    node.initialX = baseX;
    node.initialY = baseY;
    node.x = baseX + (Math.random() - 0.5) * 18;
    node.y = baseY + (Math.random() - 0.5) * 18;
  });

  const nodeMap = new Map<string, NodeDatum>();
  nodes.forEach((node) => nodeMap.set(node.id, node));

  const links: LinkDatum[] = template.links
    .filter(
      (link) => allowedIds.has(link.source) && allowedIds.has(link.target)
    )
    .map((link) => ({
      ...link,
      source: nodeMap.get(link.source)!,
      target: nodeMap.get(link.target)!,
    }));

  const adjacency = new Map<string, Set<string>>();
  nodes.forEach((node) => adjacency.set(node.id, new Set()));
  links.forEach((link) => {
    adjacency.get(link.source.id)?.add(link.target.id);
    adjacency.get(link.target.id)?.add(link.source.id);
  });

  return {
    centerId: template.centerId,
    nodes,
    links,
    adjacency,
  };
};
