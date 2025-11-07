import { useEffect, useRef } from 'react';
import * as d3 from 'd3';

import styles from './TopicGraph.module.css';
import {
  FilteredGraph,
  JITTER_STRENGTH,
  LinkDatum,
  NodeDatum,
} from './topicGraphData';

type TopicGraphCanvasProps = {
  graph: FilteredGraph;
};

const TopicGraphCanvas = ({ graph }: TopicGraphCanvasProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const width = container.clientWidth;
    const height = container.clientHeight;
    let centerX = width / 2;
    let centerY = height / 2;

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
      .data(graph.links, (link) => {
        const sourceId =
          typeof link.source === 'string' ? link.source : link.source.id;
        const targetId =
          typeof link.target === 'string' ? link.target : link.target.id;
        return `${sourceId}-${targetId}`;
      })
      .join('line')
      .attr('stroke-width', (link) => link.width)
      .attr('stroke', (link) => link.color)
      .attr('stroke-linecap', 'round')
      .attr('stroke-opacity', 0.8);

    const nodeSelection = nodeLayer
      .selectAll<SVGGElement, NodeDatum>('g')
      .data(graph.nodes, (node) => node.id)
      .join('g')
      .attr('class', styles.nodeGroup);

    nodeSelection
      .append('circle')
      .attr('r', (node) => node.radius)
      .attr('fill', (node) => node.color)
      .attr('stroke', (node) => (node.isCentral ? '#2235da' : '#39426f'))
      .attr('stroke-width', (node) => (node.isCentral ? 3.4 : 1.4))
      .attr('fill-opacity', (node) => (node.isCentral ? 0.94 : 0.86))
      .attr('stroke-opacity', 0.9);

    nodeSelection
      .append('text')
      .attr('class', styles.nodeLabel)
      .attr('dominant-baseline', 'middle')
      .attr('text-anchor', 'middle')
      .text((node) => node.label ?? '');

    const updatePositions = () => {
      nodeSelection.attr('transform', (node) => {
        const x = (node.x ?? 0) + centerX;
        const y = (node.y ?? 0) + centerY;
        return `translate(${x}, ${y})`;
      });

      linkSelection
        .attr('x1', (link) => (link.source.x ?? 0) + centerX)
        .attr('y1', (link) => (link.source.y ?? 0) + centerY)
        .attr('x2', (link) => (link.target.x ?? 0) + centerX)
        .attr('y2', (link) => (link.target.y ?? 0) + centerY);
    };

    const simulation = d3
      .forceSimulation(graph.nodes)
      .force(
        'link',
        d3
          .forceLink<NodeDatum, LinkDatum>(graph.links)
          .id((node) => node.id)
          .distance((link) =>
            Math.max(120, (link.target.targetRadius ?? 200) * 0.85)
          )
          .strength(0.22)
      )
      .force(
        'charge',
        d3
          .forceManyBody<NodeDatum>()
          .strength((node) => (node.isCentral ? -320 : -160))
          .theta(0.9)
      )
      .force(
        'collision',
        d3
          .forceCollide<NodeDatum>((node) => node.radius + (node.isCentral ? 16 : 10))
          .iterations(2)
      )
      .force('center', d3.forceCenter<NodeDatum>(0, 0))
      .force(
        'radial',
        d3
          .forceRadial<NodeDatum>((node) =>
            node.isCentral ? 0 : node.targetRadius
          )
          .strength(0.16)
      )
      .force('x', d3.forceX<NodeDatum>().strength(0.0025))
      .force('y', d3.forceY<NodeDatum>().strength(0.0025))
      .alphaDecay(0.006)
      .velocityDecay(0.12)
      .alphaTarget(0.3)
      .on('tick', () => {
        graph.nodes.forEach((node) => {
          if (
            !node.isCentral &&
            node.fx == null &&
            node.fy == null
          ) {
            node.vx = (node.vx ?? 0) + (Math.random() - 0.5) * JITTER_STRENGTH;
            node.vy = (node.vy ?? 0) + (Math.random() - 0.5) * JITTER_STRENGTH;
          }
        });
        updatePositions();
        if (simulation.alpha() < 0.26) {
          simulation.alphaTarget(0.3);
        }
      });

    const drag = d3
      .drag<SVGGElement, NodeDatum>()
      .on('start', (event, node) => {
        if (!event.active) {
          simulation.alphaTarget(0.38).restart();
        }
        node.fx = node.x;
        node.fy = node.y;
      })
      .on('drag', (event, node) => {
        const [pointerX, pointerY] = d3.pointer(event, svg.node());
        node.fx = pointerX - centerX;
        node.fy = pointerY - centerY;
        node.x = node.fx;
        node.y = node.fy;
      })
      .on('end', (event, node) => {
        if (!event.active) {
          simulation.alphaTarget(0.3);
        }

        if (node.isCentral) {
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

    nodeSelection
      .on('mouseenter', function (_, node) {
        d3.select(this).classed(styles.nodeActive, true);
        const neighbors = graph.adjacency.get(node.id) ?? new Set<string>();
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
      }
    });

    resizeObserver.observe(container);

    return () => {
      simulation.stop();
      resizeObserver.disconnect();
      svg.remove();
    };
  }, [graph]);

  return <div ref={containerRef} className={styles.canvas} />;
};

export default TopicGraphCanvas;
