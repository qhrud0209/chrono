"use client";

import { ChangeEvent } from 'react';
import styles from './NodeDepthSlider.module.css';

type NodeDepthSliderProps = {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  title?: string;
  valueFormatter?: (value: number) => string;
};

const NodeDepthSlider = ({
  value,
  min = 0,
  max = 3,
  step = 1,
  onChange,
  disabled = false,
  title = '노드 거리',
  valueFormatter,
}: NodeDepthSliderProps) => {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange(Number(event.target.value));
  };

  const clampedMin = Math.min(min, max);
  const clampedMax = Math.max(min, max);
  const displayValue = valueFormatter ? valueFormatter(value) : String(value);
  const ticks =
    clampedMax >= clampedMin
      ? Array.from(
          { length: clampedMax - clampedMin + 1 },
          (_, idx) => clampedMin + idx,
        )
      : [];

  return (
    <div className={styles.wrapper}>
      <div className={styles.track}>
        <div className={styles.header}>
          <span className={styles.title}>{title}</span>
          <span className={styles.value}>{displayValue}</span>
        </div>
        <input
          className={styles.slider}
          type="range"
          min={clampedMin}
          max={clampedMax}
          step={step}
          value={value}
          onChange={handleChange}
          disabled={disabled || clampedMax <= clampedMin}
        />
        <div className={styles.labels}>
          {ticks.map((depth) => (
            <span key={depth} className={styles.depthLabel}>
              {depth}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};

export default NodeDepthSlider;
