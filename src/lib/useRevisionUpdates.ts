import { useEffect, useState } from 'react';
import { api, ApiError } from './api';

export type RevisionHead = {
  revision: number;
  author: string | null;
  message: string;
  created_at: number | null;
};

export function useRevisionUpdates(
  problemId: string,
  initialRevision: number | null,
) {
  const [observed, setObserved] = useState<{
    problemId: string;
    head: RevisionHead;
  } | null>(null);
  useEffect(() => {
    if (initialRevision == null) return;
    let active = true;
    let stopped = false;
    let timer: number | undefined;
    let controller: AbortController | null = null;
    let knownRevision = initialRevision;
    let failures = 0;
    async function poll() {
      if (
        !active ||
        stopped ||
        document.visibilityState === 'hidden' ||
        (controller && !controller.signal.aborted)
      )
        return;
      const pending = new AbortController();
      controller = pending;
      let delay = 100;
      try {
        const head = await api<RevisionHead>(
          `/problems/${problemId}/revision-status?after=${knownRevision}&wait_seconds=25`,
          { signal: pending.signal },
        );
        if (!active || pending.signal.aborted) return;
        knownRevision = Math.max(knownRevision, head.revision);
        setObserved((previous) =>
          previous?.problemId === problemId &&
          (previous.head.revision > head.revision ||
            JSON.stringify(previous.head) === JSON.stringify(head))
            ? previous
            : { problemId, head },
        );
        failures = 0;
      } catch (error) {
        if (!active || pending.signal.aborted) return;
        if (
          error instanceof ApiError &&
          [401, 403, 404].includes(error.status)
        ) {
          stopped = true;
          return;
        }
        delay = Math.min(30000, 1000 * 2 ** Math.min(++failures, 5));
      } finally {
        if (controller === pending) controller = null;
      }
      if (active && !stopped && !pending.signal.aborted)
        timer = window.setTimeout(() => void poll(), delay);
    }
    function wake() {
      window.clearTimeout(timer);
      if (document.visibilityState === 'hidden') controller?.abort();
      else void poll();
    }
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('focus', wake);
    window.addEventListener('online', wake);
    void poll();
    return () => {
      active = false;
      window.clearTimeout(timer);
      controller?.abort();
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('focus', wake);
      window.removeEventListener('online', wake);
    };
  }, [problemId, initialRevision]);
  return observed?.problemId === problemId ? observed.head : null;
}
