'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import NodeDepthSlider from './NodeDepthSlider';
import TopicGraphCanvas from './TopicGraphCanvas';
import styles from './TopicGraph.module.css';
import {
  NodeDatum,
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

type HintState = {
  nodeId: string;
  label: string;
  x: number;
  y: number;
  centerId: string;
};

const HINT_OFFSET_X = 28;
const HINT_OFFSET_Y = -16;

const TopicGraph = ({ center, related }: TopicGraphProps) => {
  const router = useRouter();
  const template = useMemo(
    () => buildGraphTemplate(center, related),
    [center, related],
  );
  const relatedCount = template.orderedRelated.length;
  const [rawVisibleCount, setRawVisibleCount] = useState(DEFAULT_VISIBLE);
  const [activeHint, setActiveHint] = useState<HintState | null>(null);

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

  const dismissHint = useCallback(() => {
    setActiveHint(null);
  }, []);

  useEffect(() => {
    const handleBodyClick = () => {
      setActiveHint(null);
    };
    window.addEventListener('click', handleBodyClick);
    return () => {
      window.removeEventListener('click', handleBodyClick);
    };
  }, []);

  const handleContextMenu = useCallback(
    (info: { node: NodeDatum; x: number; y: number }) => {
      if (info.node.isCentral) {
        setActiveHint(null);
        return;
      }
      setActiveHint({
        nodeId: info.node.id,
        label: info.node.label ?? '키워드',
        x: info.x,
        y: info.y,
        centerId: center.id,
      });
    },
    [center.id],
  );

  const handleNavigate = useCallback(
    (nodeId: string) => {
      dismissHint();
      router.push(`/keyword/${encodeURIComponent(nodeId)}`);
    },
    [dismissHint, router],
  );

  const visibleHint =
    activeHint && activeHint.centerId === center.id ? activeHint : null;

  const hintStyle = visibleHint
    ? {
        top: visibleHint.y + HINT_OFFSET_Y,
        left: visibleHint.x + HINT_OFFSET_X,
      }
    : undefined;

  return (
    <>
      <div className={styles.graphContainer}>
        <TopicGraphCanvas
          graph={graph}
          onNodeContextMenu={handleContextMenu}
        />
        {visibleHint && (
          <button
            className={styles.navigateHint}
            style={hintStyle}
            onClick={(event) => {
              event.stopPropagation();
              handleNavigate(visibleHint.nodeId);
            }}
            onContextMenu={(event) => event.preventDefault()}
          >
            <span className={styles.navigateHintLabel}>{visibleHint.label}</span>
            <span className={styles.navigateHintAction}>이 키워드로 이동</span>
          </button>
        )}
      </div>
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
