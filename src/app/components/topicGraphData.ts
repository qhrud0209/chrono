import * as d3 from 'd3';

export type Topic = {
  id: string;
  label: string;
  url: string;
  influence: number;
};

export type Link = {
  source: string;
  target: string;
  weight: number;
};

export type BaseNode = Topic & {
  radius: number;
  color: string;
  initialX: number;
  initialY: number;
  depth: number;
};

export type BaseLink = Link & {
  width: number;
  color: string;
};

export type NodeDatum = d3.SimulationNodeDatum &
  BaseNode & {
    fx?: number;
    fy?: number;
  };

export type LinkDatum = d3.SimulationLinkDatum<NodeDatum> & BaseLink;

export type BaseGraph = {
  nodes: BaseNode[];
  links: BaseLink[];
  distances: Map<string, number>;
  adjacency: Map<string, Set<string>>;
  maxDepth: number;
};

export type FilteredGraph = {
  nodes: NodeDatum[];
  links: LinkDatum[];
  adjacency: Map<string, Set<string>>;
};

export const CENTRAL_TOPIC_ID = 'us-election';
export const JITTER_STRENGTH = 0.032;

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

export const radiusByDepth = (depth: number) => {
  if (depth <= 0) {
    return 0;
  }
  return 140 + depth * 80;
};

const TOPICS: Topic[] = [
  {
    id: 'us-election',
    label: '미국 대선',
    url: 'https://www.nytimes.com/section/us/politics',
    influence: 6,
  },
  {
    id: 'domestic-strategy',
    label: '국내 정치 구도',
    url: 'https://www.washingtonpost.com/politics/',
    influence: 5,
  },
  {
    id: 'swing-states',
    label: '스윙 스테이트 전략',
    url: 'https://www.nbcnews.com/politics',
    influence: 4,
  },
  {
    id: 'policy-messaging',
    label: '정책 메시지',
    url: 'https://www.cnn.com/politics',
    influence: 3,
  },
  {
    id: 'voter-blocs',
    label: '유권자 연합',
    url: 'https://fivethirtyeight.com',
    influence: 3,
  },
  {
    id: 'geopolitics',
    label: '대외 정책',
    url: 'https://www.reuters.com/world/us/',
    influence: 5,
  },
  {
    id: 'ukraine-war',
    label: '우크라이나 전쟁',
    url: 'https://www.reuters.com/world/europe/',
    influence: 4,
  },
  {
    id: 'indo-pacific',
    label: '인도·태평양 전략',
    url: 'https://www.scmp.com/',
    influence: 4,
  },
  {
    id: 'alliance-strategy',
    label: '동맹 관리',
    url: 'https://www.nato.int',
    influence: 3,
  },
  {
    id: 'taiwan-strait',
    label: '대만 해협',
    url: 'https://www.scmp.com/topics/taiwan-strait',
    influence: 3,
  },
  {
    id: 'south-china-sea',
    label: '남중국해',
    url: 'https://www.scmp.com/topics/south-china-sea',
    influence: 2,
  },
  {
    id: 'economic-agenda',
    label: '경제 아젠다',
    url: 'https://www.wsj.com/news/economy',
    influence: 5,
  },
  {
    id: 'inflation',
    label: '물가와 생활비',
    url: 'https://www.economist.com/finance-and-economics',
    influence: 4,
  },
  {
    id: 'jobs-plan',
    label: '일자리 전략',
    url: 'https://www.ft.com/us-economy',
    influence: 3,
  },
  {
    id: 'fiscal-policy',
    label: '재정 정책',
    url: 'https://www.bloomberg.com/politics',
    influence: 3,
  },
  {
    id: 'energy-prices',
    label: '에너지 가격',
    url: 'https://www.bloomberg.com/energy',
    influence: 2,
  },
  {
    id: 'technology-strategy',
    label: '기술 경쟁',
    url: 'https://www.ft.com/technology',
    influence: 4,
  },
  {
    id: 'chip-act',
    label: '반도체 육성',
    url: 'https://www.semianalysis.com',
    influence: 3,
  },
  {
    id: 'ai-governance',
    label: 'AI 규범',
    url: 'https://www.technologyreview.com/',
    influence: 3,
  },
  {
    id: 'cyber-security',
    label: '사이버 보안',
    url: 'https://www.cyberscoop.com/',
    influence: 2,
  },
  {
    id: 'climate-agenda',
    label: '기후·에너지',
    url: 'https://www.nytimes.com/section/climate',
    influence: 4,
  },
  {
    id: 'energy-transition',
    label: '에너지 전환',
    url: 'https://www.iea.org',
    influence: 3,
  },
  {
    id: 'climate-diplomacy',
    label: '기후 외교',
    url: 'https://www.un.org/climatechange',
    influence: 2,
  },
];

const LINKS: Link[] = [
  { source: 'us-election', target: 'domestic-strategy', weight: 0.85 },
  { source: 'domestic-strategy', target: 'swing-states', weight: 0.75 },
  { source: 'domestic-strategy', target: 'policy-messaging', weight: 0.7 },
  { source: 'domestic-strategy', target: 'voter-blocs', weight: 0.68 },
  { source: 'us-election', target: 'geopolitics', weight: 0.82 },
  { source: 'geopolitics', target: 'ukraine-war', weight: 0.72 },
  { source: 'geopolitics', target: 'indo-pacific', weight: 0.7 },
  { source: 'geopolitics', target: 'alliance-strategy', weight: 0.66 },
  { source: 'indo-pacific', target: 'taiwan-strait', weight: 0.62 },
  { source: 'indo-pacific', target: 'south-china-sea', weight: 0.6 },
  { source: 'us-election', target: 'economic-agenda', weight: 0.8 },
  { source: 'economic-agenda', target: 'inflation', weight: 0.74 },
  { source: 'economic-agenda', target: 'jobs-plan', weight: 0.7 },
  { source: 'economic-agenda', target: 'fiscal-policy', weight: 0.65 },
  { source: 'inflation', target: 'energy-prices', weight: 0.6 },
  { source: 'us-election', target: 'technology-strategy', weight: 0.78 },
  { source: 'technology-strategy', target: 'chip-act', weight: 0.7 },
  { source: 'technology-strategy', target: 'ai-governance', weight: 0.68 },
  { source: 'technology-strategy', target: 'cyber-security', weight: 0.64 },
  { source: 'us-election', target: 'climate-agenda', weight: 0.76 },
  { source: 'climate-agenda', target: 'energy-transition', weight: 0.68 },
  { source: 'climate-agenda', target: 'climate-diplomacy', weight: 0.64 },
];

export const buildBaseGraph = (): BaseGraph => {
  const radiusScale = d3.scaleLinear().domain([2, 6]).range([40, 70]);

  const nodes: BaseNode[] = TOPICS.map((topic) => ({
    ...topic,
    radius: radiusScale(topic.influence),
    color: '#0b1730',
    initialX: 0,
    initialY: 0,
    depth: 0,
  }));

  const links: BaseLink[] = LINKS.map((link) => ({
    ...link,
    width: 1.1 + link.weight * 1.6,
    color: 'rgba(118, 146, 210, 0.28)',
  }));

  const adjacency = new Map<string, Set<string>>();
  nodes.forEach((node) => adjacency.set(node.id, new Set()));
  links.forEach((link) => {
    adjacency.get(link.source)?.add(link.target);
    adjacency.get(link.target)?.add(link.source);
  });

  const distances = new Map<string, number>();
  const queue: string[] = [CENTRAL_TOPIC_ID];
  distances.set(CENTRAL_TOPIC_ID, 0);

  while (queue.length) {
    const current = queue.shift()!;
    const depth = distances.get(current) ?? 0;
    adjacency.get(current)?.forEach((neighbor) => {
      if (!distances.has(neighbor)) {
        distances.set(neighbor, depth + 1);
        queue.push(neighbor);
      }
    });
  }

  const maxDepth = Math.max(...Array.from(distances.values()));
  const colorScale = d3
    .scaleSequential(d3.interpolateCubehelixLong('#1f2f70', '#d5e0ff'))
    .domain([0, Math.max(2, maxDepth + 2)]);

  nodes.forEach((node) => {
    const depth =
      node.id === CENTRAL_TOPIC_ID ? 0 : distances.get(node.id) ?? maxDepth;
    node.depth = depth;
    const normalized = depth + 0.6;
    const paletteBase = depth === 0 ? '#445bff' : colorScale(normalized);
    const saturated = saturate(paletteBase, depth === 0 ? 1.15 : 1.08);
    const lightnessBoost = Math.min(depth, maxDepth) * 0.055;
    node.color = lighten(saturated, lightnessBoost);
    const depthFactor = Math.max(0.64, 1 - Math.min(depth, 5) * 0.09);
    const baseRadius = radiusScale(node.influence) * depthFactor;
    node.radius =
      node.id === CENTRAL_TOPIC_ID
        ? Math.max(58, baseRadius * 1.2)
        : Math.max(26, baseRadius);
  });

  const depthBuckets = new Map<number, BaseNode[]>();
  nodes.forEach((node) => {
    const depth = node.depth;
    if (!depthBuckets.has(depth)) {
      depthBuckets.set(depth, []);
    }
    depthBuckets.get(depth)!.push(node);
  });

  depthBuckets.forEach((bucket, depth) => {
    if (depth === 0) {
      bucket.forEach((node) => {
        node.initialX = 0;
        node.initialY = 0;
      });
      return;
    }

    const radius = radiusByDepth(depth);
    bucket.forEach((node, index) => {
      const angle = (index / bucket.length) * Math.PI * 2;
      node.initialX = Math.cos(angle) * radius;
      node.initialY = Math.sin(angle) * radius;
    });
  });

  return { nodes, links, adjacency, distances, maxDepth };
};

export const deriveGraph = (
  base: BaseGraph,
  maxDepth: number
): FilteredGraph => {
  const allowedIds = new Set<string>();
  base.distances.forEach((depth, nodeId) => {
    if (depth <= maxDepth) {
      allowedIds.add(nodeId);
    }
  });

  const nodes: NodeDatum[] = base.nodes
    .filter((node) => allowedIds.has(node.id))
    .map((node) => ({
      ...node,
      x: node.initialX + (Math.random() - 0.5) * 26,
      y: node.initialY + (Math.random() - 0.5) * 26,
      fx: node.id === CENTRAL_TOPIC_ID ? 0 : undefined,
      fy: node.id === CENTRAL_TOPIC_ID ? 0 : undefined,
    }));

  const nodeMap = new Map<string, NodeDatum>();
  nodes.forEach((node) => nodeMap.set(node.id, node));

  const links: LinkDatum[] = base.links
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

  return { nodes, links, adjacency };
};
