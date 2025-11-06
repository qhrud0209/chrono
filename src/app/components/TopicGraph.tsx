'use client';

import { useMemo, useState } from 'react';

import NodeDepthSlider from './NodeDepthSlider';
import TopicGraphCanvas from './TopicGraphCanvas';
import styles from './TopicGraph.module.css';
import { buildBaseGraph, deriveGraph } from './topicGraphData';

const TopicGraph = () => {
  const baseGraph = useMemo(() => buildBaseGraph(), []);
  const [maxDepth, setMaxDepth] = useState(Math.min(2, baseGraph.maxDepth));
  const filteredGraph = useMemo(
    () => deriveGraph(baseGraph, maxDepth),
    [baseGraph, maxDepth],
  );

  return (
    <>
      <TopicGraphCanvas graph={filteredGraph} />
      <div className={styles.depthControls}>
        <NodeDepthSlider
          value={maxDepth}
          min={0}
          max={baseGraph.maxDepth}
          onChange={setMaxDepth}
        />
      </div>
    </>
  );
};

export default TopicGraph;
