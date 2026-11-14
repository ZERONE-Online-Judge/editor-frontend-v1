import type { ComponentProps, ReactNode } from 'react';
import { boundedProgress, useProgressMotion } from '../lib/progressMotion';

export function MotionNumber({
  value,
  scope,
  max = Number.MAX_SAFE_INTEGER,
}: {
  value: number;
  scope: string;
  max?: number;
}) {
  const target = boundedProgress(value, max);
  const displayed = useProgressMotion(target, scope, max);
  return (
    <span className="motion-number">
      <span className="motion-sr-only">{target.toLocaleString()}</span>
      <span
        className="motion-number-visual"
        aria-hidden="true"
        data-motion-value={(displayed === target
          ? target
          : Math.floor(displayed)
        ).toLocaleString()}
      />
    </span>
  );
}

export function MotionProgress({
  value,
  max = 100,
  scope,
  ...props
}: Omit<ComponentProps<'progress'>, 'value' | 'max'> & {
  value: number;
  max?: number;
  scope: string;
}) {
  const target = boundedProgress(value, max);
  const displayed = useProgressMotion(target, scope, max);
  const ceiling = Number.isFinite(max) ? Math.max(0, max) : 100;
  return (
    <progress
      {...props}
      className={`motion-progress ${props.className || ''}`}
      max={ceiling || 1}
      value={displayed}
      aria-valuenow={target}
      aria-valuemax={ceiling || 1}
    />
  );
}

/** For count summaries only, preserving their labels and exact readable value. */
export function MotionCountText({
  value,
  scope,
}: {
  value: string;
  scope: string;
}) {
  return (
    <span className="motion-count-text">
      {value
        .split(/(\d[\d,]*(?:\.\d+)?)/g)
        .map((part, index) =>
          index % 2 === 1 ? (
            <MotionNumber
              key={index}
              value={Number(part.replaceAll(',', ''))}
              scope={`${scope}/${index}`}
            />
          ) : (
            part
          ),
        )}
    </span>
  );
}

export function ResultTransition({
  children,
  stateKey,
}: {
  children: ReactNode;
  stateKey: string;
}) {
  return (
    <span className="motion-result" key={stateKey}>
      {children}
    </span>
  );
}
