'use client';

import { useMemo, useState } from 'react';

import NodeDepthSlider from './NodeDepthSlider';
import TopicGraphCanvas from './TopicGraphCanvas';
import styles from './TopicGraph.module.css';
import {
  RelatedKeyword,
  buildGraphTemplate,
  deriveGraph,
} from './topicGraphData';

type TopicGraphProps = {
  center: {
    id: string;
    label: string;
  };
  related: RelatedKeyword[];
};

const DEFAULT_VISIBLE = 6;

const TopicGraph = ({ center, related }: TopicGraphProps) => {
  const template = useMemo(
    () => buildGraphTemplate(center, related),
    [center, related],
  );
  const relatedCount = template.orderedRelated.length;
  const [rawVisibleCount, setRawVisibleCount] = useState(DEFAULT_VISIBLE);

  const sliderMin = relatedCount === 0 ? 0 : 1;
  const sliderMax = relatedCount;
  const sliderDisabled = sliderMax <= sliderMin;

  const effectiveVisibleCount =
    sliderMax === 0
      ? 0
      : Math.min(
          sliderMax,
          Math.max(sliderMin, rawVisibleCount),
        );

  const graph = useMemo(
    () => deriveGraph(template, effectiveVisibleCount),
    [template, effectiveVisibleCount],
  );

  return (
    <>
      <TopicGraphCanvas graph={graph} />
      <div className={styles.depthControls}>
        <NodeDepthSlider
          value={sliderMax === 0 ? 0 : effectiveVisibleCount}
          min={sliderMin}
          max={sliderMax}
          onChange={setRawVisibleCount}
          disabled={sliderDisabled}
          title="연관 키워드"
          valueFormatter={(value) =>
            value <= 0 || sliderMax === 0 ? '데이터 없음' : `상위 ${value}개`
          }
        />
      </div>
    </>
  );
};

export default TopicGraph;
