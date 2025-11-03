'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';

import styles from './TopicGraph.module.css';

type Topic = {
  id: string;
  label: string;
  url: string;
  influence: number;
};

type Link = {
  source: string;
  target: string;
  weight: number;
};

type NodeDatum = d3.SimulationNodeDatum &
  Topic & {
    radius: number;
    color: string;
  };

type LinkDatum = d3.SimulationLinkDatum<NodeDatum> &
  Link & {
    width: number;
    color: string;
  };

const CENTRAL_TOPIC_ID = 'us-election';

const TOPICS: Topic[] = [
  {
    id: 'us-election',
    label: '미국 대선',
    url: 'https://www.nytimes.com/section/us/politics',
    influence: 6,
  },
  {
    id: 'donald-trump',
    label: '도널드 트럼프',
    url: 'https://www.politico.com/news/donald-trump',
    influence: 5,
  },
  {
    id: 'china-trade',
    label: '미중 무역 갈등',
    url: 'https://www.bloomberg.com/asia',
    influence: 4,
  },
  {
    id: 'semiconductors',
    label: '반도체 정책',
    url: 'https://www.ft.com/technology',
    influence: 3,
  },
  {
    id: 'ukraine',
    label: '우크라이나 전쟁',
    url: 'https://www.reuters.com/world/europe/',
    influence: 5,
  },
  {
    id: 'fed-policy',
    label: '연준 통화정책',
    url: 'https://www.wsj.com/market-data/bonds',
    influence: 4,
  },
  {
    id: 'taiwan-strait',
    label: '대만 해협 긴장',
    url: 'https://www.scmp.com/topics/taiwan-strait',
    influence: 4,
  },
  {
    id: 'inflation',
    label: '인플레이션',
    url: 'https://www.economist.com/finance-and-economics',
    influence: 3,
  },
  {
    id: 'ai-regulation',
    label: 'AI 규제 논쟁',
    url: 'https://www.technologyreview.com/',
    influence: 3,
  },
];

const LINKS: Link[] = [
  { source: 'us-election', target: 'donald-trump', weight: 1 },
  { source: 'us-election', target: 'china-trade', weight: 0.75 },
  { source: 'us-election', target: 'ukraine', weight: 0.6 },
  { source: 'us-election', target: 'fed-policy', weight: 0.55 },
  { source: 'us-election', target: 'inflation', weight: 0.65 },
  { source: 'donald-trump', target: 'taiwan-strait', weight: 0.45 },
  { source: 'china-trade', target: 'semiconductors', weight: 0.75 },
  { source: 'china-trade', target: 'taiwan-strait', weight: 0.55 },
  { source: 'china-trade', target: 'inflation', weight: 0.48 },
  { source: 'semiconductors', target: 'ai-regulation', weight: 0.7 },
  { source: 'fed-policy', target: 'inflation', weight: 0.9 },
  { source: 'ukraine', target: 'taiwan-strait', weight: 0.6 },
  { source: 'ukraine', target: 'china-trade', weight: 0.5 },
];

const PALETTE = [
  '#06112b',
  '#0e1f47',
  '#143267',
  '#1b4691',
  '#2460bf',
  '#3574e6',
  '#4f8dff',
] as const;

const buildGraph = () => {
  const radiusScale = d3.scaleLinear().domain([2, 6]).range([34, 58]);

  const nodes: NodeDatum[] = TOPICS.map((topic, index) => {
    const color =
      topic.id === CENTRAL_TOPIC_ID
        ? '#030619'
        : PALETTE[index % PALETTE.length];
    const angle = index / TOPICS.length;
    const orbitRadius =
      topic.id === CENTRAL_TOPIC_ID ? 0 : 240 + (index % 3) * 40;
    const startX = Math.cos(angle * Math.PI * 2) * orbitRadius;
    const startY = Math.sin(angle * Math.PI * 2) * orbitRadius;

    return {
      ...topic,
      radius: radiusScale(topic.influence),
      color,
      fx: topic.id === CENTRAL_TOPIC_ID ? 0 : undefined,
      fy: topic.id === CENTRAL_TOPIC_ID ? 0 : undefined,
      x: startX,
      y: startY,
    };
  });

  const links: LinkDatum[] = LINKS.map((link) => ({
    ...link,
    width: 1.4 + link.weight * 2.4,
    color: 'rgba(118,144,223,0.4)',
  }));

  return { nodes, links };
};

const TopicGraph = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [graph] = useState(buildGraph);
  const adjacency = useMemo(() => {
    const map = new Map<string, Set<string>>();
    graph.links.forEach((link) => {
      if (!map.has(link.source)) {
        map.set(link.source, new Set());
      }
      if (!map.has(link.target)) {
        map.set(link.target, new Set());
      }
      map.get(link.source)!.add(link.target);
      map.get(link.target)!.add(link.source);
    });
    return map;
  }, [graph.links]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const width = container.clientWidth;
    const height = container.clientHeight;
    let centerX = width / 2;
    let centerY = height / 2;
    let currentTransform = d3.zoomIdentity;

    const svg = d3
      .select(container)
      .append('svg')
      .attr('class', styles.svg)
      .attr('width', width)
      .attr('height', height);

    const zoomLayer = svg.append('g').attr('class', styles.zoomLayer);
    const linkLayer = zoomLayer.append('g').attr('class', styles.linkLayer);
    const nodeLayer = zoomLayer.append('g').attr('class', styles.nodeLayer);

    const linkSelection = linkLayer
      .selectAll('line')
      .data(graph.links)
      .join('line')
      .attr('stroke-width', (link) => link.width)
      .attr('stroke', (link) => link.color)
      .attr('stroke-linecap', 'round')
      .attr('stroke-opacity', 0.8);

    const nodeSelection = nodeLayer
      .selectAll('g')
      .data(graph.nodes)
      .join('g')
      .attr('class', styles.nodeGroup);

    const updatePositions = () => {
      linkSelection
        .attr('x1', (link) => (link.source.x ?? 0) + centerX)
        .attr('y1', (link) => (link.source.y ?? 0) + centerY)
        .attr('x2', (link) => (link.target.x ?? 0) + centerX)
        .attr('y2', (link) => (link.target.y ?? 0) + centerY);

      nodeSelection.attr(
        'transform',
        (node) =>
          `translate(${(node.x ?? 0) + centerX}, ${(node.y ?? 0) + centerY})`
      );
    };

    nodeSelection
      .append('circle')
      .attr('r', (node) => node.radius)
      .attr('fill', (node) => node.color)
      .attr('stroke', (node) =>
        node.id === CENTRAL_TOPIC_ID ? '#7aa6ff' : 'rgba(148,163,184,0.4)'
      )
      .attr('stroke-width', (node) => (node.id === CENTRAL_TOPIC_ID ? 3.2 : 1.4))
      .attr('fill-opacity', 0.94);

    nodeSelection
      .append('text')
      .attr('class', styles.nodeLabel)
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .each(function (node) {
        const text = d3.select(this);
        const words = node.label.split(' ');
        const maxChars = node.id === CENTRAL_TOPIC_ID ? 18 : 14;
        const lines: string[] = [];
        let current: string[] = [];

        words.forEach((word) => {
          current.push(word);
          const attempt = current.join(' ');
          if (attempt.length > maxChars && current.length > 1) {
            current.pop();
            lines.push(current.join(' '));
            current = [word];
          }
        });

        if (current.length) {
          lines.push(current.join(' '));
        }

        text.text('');
        text.attr('fill', node.id === CENTRAL_TOPIC_ID ? '#f8fbff' : '#e2e8ff');
        const lineHeight = 1;
        const offset = ((lines.length - 1) * lineHeight) / 2;

        lines.forEach((line, index) =>
          text
            .append('tspan')
            .attr('x', 0)
            .attr('dy', `${index === 0 ? 0.35 - offset : lineHeight}em`)
            .text(line)
        );
      });

    updatePositions();

    const simulation = d3
      .forceSimulation(graph.nodes)
      .force(
        'link',
        d3
          .forceLink<NodeDatum, LinkDatum>(graph.links)
          .id((node) => node.id)
          .distance((link) => 220 - link.weight * 60)
          .strength(0.25)
      )
      .force('charge', d3.forceManyBody<NodeDatum>().strength(-200).theta(0.8))
      .force(
        'collision',
        d3.forceCollide<NodeDatum>((node) => node.radius + 10).iterations(1)
      )
      .force('center', d3.forceCenter<NodeDatum>(0, 0))
      .force('x', d3.forceX<NodeDatum>().strength(0.01))
      .force('y', d3.forceY<NodeDatum>().strength(0.01))
      .alphaDecay(0.01)
      .velocityDecay(0.16)
      .alphaTarget(0.1)
      .on('tick', () => {
        updatePositions();
        if (simulation.alpha() < 0.08) {
          simulation.alphaTarget(0.1);
        }
      });

    const drag = d3
      .drag<SVGGElement, NodeDatum>()
      .on('start', (event, node) => {
        if (!event.active) {
          simulation.alphaTarget(0.18).restart();
        }
        node.fx = node.x;
        node.fy = node.y;
      })
      .on('drag', (event, node) => {
        const [pointerX, pointerY] = d3.pointer(event, svg.node());
        const [px, py] = currentTransform.invert([pointerX, pointerY]);
        node.fx = px - centerX;
        node.fy = py - centerY;
        node.x = node.fx;
        node.y = node.fy;
      })
      .on('end', (event, node) => {
        if (!event.active) {
          simulation.alphaTarget(0.1);
        }

        if (node.id === CENTRAL_TOPIC_ID) {
          node.fx = 0;
          node.fy = 0;
          node.x = 0;
          node.y = 0;
        } else {
          node.fx = undefined;
          node.fy = undefined;
        }
      });

    nodeSelection.call(
      drag as unknown as (
        selection: d3.Selection<SVGGElement, NodeDatum, SVGGElement, unknown>
      ) => void
    );

    nodeSelection.on('click', (_, node) => {
      if (node.url) {
        window.open(node.url, '_blank', 'noopener,noreferrer');
      }
    });

    nodeSelection
      .on('mouseenter', function (_, node) {
        d3.select(this).classed(styles.nodeActive, true);
        const neighbors = adjacency.get(node.id) ?? new Set<string>();
        const neighborSet = new Set<string>(neighbors);
        neighborSet.add(node.id);

        nodeSelection.classed(
          styles.dimmed,
          (current) => !neighborSet.has(current.id)
        );
        linkSelection.classed(
          styles.linkActive,
          (link) =>
            neighborSet.has(link.source.id) && neighborSet.has(link.target.id)
        );
      })
      .on('mouseleave', function () {
        d3.select(this).classed(styles.nodeActive, false);
        nodeSelection.classed(styles.dimmed, false);
        linkSelection.classed(styles.linkActive, false);
      });

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.6, 2])
      .on('zoom', (event) => {
        currentTransform = event.transform;
        zoomLayer.attr('transform', currentTransform.toString());
      });

    svg.call(zoom);

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width: nextWidth, height: nextHeight } = entry.contentRect;
        if (!nextWidth || !nextHeight) {
          continue;
        }

        svg.attr('width', nextWidth).attr('height', nextHeight);

        centerX = nextWidth / 2;
        centerY = nextHeight / 2;
        updatePositions();
        zoomLayer.attr('transform', currentTransform.toString());
      }
    });

    resizeObserver.observe(container);

    return () => {
      simulation.stop();
      resizeObserver.disconnect();
      svg.remove();
    };
  }, [graph.links, graph.nodes, adjacency]);

  return <div ref={containerRef} className={styles.canvas} />;
};

export default TopicGraph;
