import { useEffect, useState } from 'react';
import { api } from './api';

export type AuthorIdentity = {
  id: string;
  display_name: string;
  email: string;
  handle: string;
};

export type AuthoringProblem = {
  id: string;
  slug: string;
  name: string;
  deleted: boolean;
  owner: AuthorIdentity;
  created_at: number;
  updated_at: number;
  revision: number;
  editor_count: number;
  last_activity_at: number;
  last_activity_type: 'created' | 'commit' | 'working_copy';
  last_actor: AuthorIdentity | null;
};

export type AuthoringDetail = {
  problem: AuthoringProblem;
  editors: {
    user: AuthorIdentity;
    role: string;
    last_saved_at: number | null;
    working_revision: number | null;
  }[];
  last_commit: {
    number: number;
    created_at: number;
    author: AuthorIdentity;
  } | null;
};

// Keep administrator metadata scoped to the current account and request.
// Errors, account changes and permission revocation never retain old rows.
export function useMasterMetadata<T>(path: string, accountId: string | null) {
  const [version, setVersion] = useState(0);
  const key = accountId ? `${accountId}:${path}:${version}` : '';
  const [state, setState] = useState<{ key: string; data?: T; error?: string }>(
    { key: '' },
  );
  useEffect(() => {
    if (!accountId) return;
    const abort = new AbortController();
    let active = true;
    api<T>(path, { signal: abort.signal })
      .then((data) => {
        if (active) setState({ key, data });
      })
      .catch((error: Error) => {
        if (active && !abort.signal.aborted)
          setState({ key, error: error.message });
      });
    return () => {
      active = false;
      abort.abort();
    };
  }, [key, path, accountId]);
  const result = key && state.key === key ? state : undefined;
  return {
    data: result?.data,
    error: result?.error,
    loading: Boolean(accountId && !result),
    refresh: () => setVersion((value) => value + 1),
  };
}

export function authoringMoment(value: number | null) {
  if (value === null || !Number.isFinite(value)) return '저장 기록 없음';
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value * 1000));
}
