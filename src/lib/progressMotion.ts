import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

const duration = 420;

export function boundedProgress(value: number, max = 100) {
  const ceiling = Number.isFinite(max) ? Math.max(0, max) : 100;
  return Number.isFinite(value) ? Math.max(0, Math.min(ceiling, value)) : 0;
}

function motionIsReduced() {
  return (
    typeof window === 'undefined' ||
    !window.requestAnimationFrame ||
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true ||
    document.visibilityState === 'hidden'
  );
}

function subscribeMotion(callback: () => void) {
  const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  media?.addEventListener?.('change', callback);
  document.addEventListener('visibilitychange', callback);
  return () => {
    media?.removeEventListener?.('change', callback);
    document.removeEventListener('visibilitychange', callback);
  };
}

/** Interpolate only between received values; a new scope or rollback snaps. */
export function useProgressMotion(value: number, scope: string, max = 100) {
  const target = boundedProgress(value, max);
  const identity = `${scope}/${max}`;
  const reduced = useSyncExternalStore(
    subscribeMotion,
    motionIsReduced,
    () => true,
  );
  const [frame, setFrame] = useState({ identity, target, value: target });
  const previous = useRef({ identity, target, value: target });

  // Reset during render so a quick new job/rollback cannot reuse an old frame.
  // React immediately retries this component before committing its children.
  if (frame.identity !== identity || target !== frame.target) {
    setFrame({
      identity,
      target,
      value:
        frame.identity !== identity || target < frame.target
          ? target
          : frame.value,
    });
  }

  useEffect(() => {
    const before = previous.current;
    const from =
      before.identity === identity &&
      target >= before.target &&
      before.value <= target &&
      !reduced
        ? before.value
        : target;
    let request = 0;
    let cancelled = false;
    const started = window.performance.now();
    previous.current = { identity, target, value: from };
    const update = (now: number) => {
      if (cancelled) return;
      const elapsed = reduced
        ? 1
        : Math.min(1, Math.max(0, (now - started) / duration));
      const next =
        elapsed === 1
          ? target
          : from + (target - from) * (1 - (1 - elapsed) ** 3);
      previous.current = { identity, target, value: next };
      setFrame({ identity, target, value: next });
      if (elapsed < 1 && from !== target)
        request = window.requestAnimationFrame(update);
    };
    // Schedule even a snap so interrupted animations cannot restore old values.
    if (window.requestAnimationFrame)
      request = window.requestAnimationFrame(update);
    return () => {
      cancelled = true;
      if (request) window.cancelAnimationFrame(request);
    };
  }, [identity, target, reduced]);

  return reduced || frame.identity !== identity || frame.value > target
    ? target
    : boundedProgress(frame.value, max);
}
