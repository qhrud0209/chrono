"use client";

import { ChangeEvent } from "react";
import styles from "./NodeDepthSlider.module.css";

type NodeDepthSliderProps = {
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
};

const NodeDepthSlider = ({ value, min = 0, max = 3, onChange }: NodeDepthSliderProps) => {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange(Number(event.target.value));
  };

  return (
    <div className={styles.wrapper}>
      <div className={styles.track}>
        <div className={styles.header}>
          <span className={styles.title}>노드 거리</span>
          <span className={styles.value}>{value}</span>
        </div>
        <input
          className={styles.slider}
          type="range"
          min={min}
          max={max}
          step={1}
          value={value}
          onChange={handleChange}
        />
        <div className={styles.labels}>
          {Array.from({ length: max - min + 1 }, (_, idx) => min + idx).map((depth) => (
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
