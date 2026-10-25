import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import { asPage, type Page } from './pagination';

export function useRemotePage<T>(
  url: string,
  page: number,
  interval = 0,
  legacyFilter?: (items: T[]) => T[],
  enabled = true,
  pageSize = 20,
) {
  const [state, setState] = useState<{
    url: string;
    data?: Page<T>;
    error?: string;
  }>({ url: '' });
  const sequence = useRef({ value: 0, url });
  const filter = useRef(legacyFilter);
  useEffect(() => {
    filter.current = legacyFilter;
  }, [legacyFilter]);
  const refresh = useCallback(async () => {
    const tracker = sequence.current;
    if (!enabled || tracker.url !== url) return;
    const token = ++tracker.value;
    try {
      let value = await api<Page<T> | T[]>(url);
      if (Array.isArray(value) && filter.current) value = filter.current(value);
      const data = asPage(value, page, pageSize);
      if (tracker.value === token) setState({ url, data });
    } catch (error) {
      if (tracker.value === token)
        setState((previous) => ({
          url,
          data: previous.url === url ? previous.data : undefined,
          error: (error as Error).message,
        }));
    }
  }, [url, page, enabled, pageSize]);
  useEffect(() => {
    if (!enabled) return;
    const tracker = sequence.current;
    tracker.url = url;
    let pending = false;
    const poll = async () => {
      if (pending) return;
      pending = true;
      try {
        await refresh();
      } finally {
        pending = false;
      }
    };
    void poll();
    const timer = interval
      ? window.setInterval(() => void poll(), interval)
      : undefined;
    return () => {
      tracker.value++;
      tracker.url = '';
      if (timer) window.clearInterval(timer);
    };
  }, [refresh, interval, url, enabled]);
  return {
    data: enabled && state.url === url ? state.data : undefined,
    error: enabled && state.url === url ? state.error : undefined,
    refresh,
  };
}
