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
  action: 'keyword' | 'chronology';
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
      const action = info.node.isCentral ? 'chronology' : 'keyword';
      setActiveHint({
        nodeId: info.node.id,
        label: info.node.label ?? '키워드',
        x: info.x,
        y: info.y,
        centerId: center.id,
        action,
      });
    },
    [center.id],
  );

  const handleNavigate = useCallback(
    (hint: HintState) => {
      dismissHint();
      if (hint.action === 'chronology') {
        router.push(`/chronology/${encodeURIComponent(hint.nodeId)}`);
        return;
      }
      router.push(`/keyword/${encodeURIComponent(hint.nodeId)}`);
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

  const hintLabel =
    visibleHint?.action === 'chronology'
      ? 'WWDC25'
      : visibleHint?.label;

  const hintActionText =
    visibleHint?.action === 'chronology'
      ? '타임라인 열기'
      : '이 키워드로 이동';

  const hintClassName = [
    styles.navigateHint,
    visibleHint?.action === 'chronology' ? styles.navigateHintChronology : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <>
      <div className={styles.graphContainer}>
        <TopicGraphCanvas
          graph={graph}
          onNodeContextMenu={handleContextMenu}
        />
        {visibleHint && (
          <button
            className={hintClassName}
            style={hintStyle}
            onClick={(event) => {
              event.stopPropagation();
              handleNavigate(visibleHint);
            }}
            onContextMenu={(event) => event.preventDefault()}
          >
            <span className={styles.navigateHintLabel}>{hintLabel}</span>
            <span className={styles.navigateHintAction}>{hintActionText}</span>
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
