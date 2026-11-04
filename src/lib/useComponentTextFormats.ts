import { useEffect, useMemo, useState } from 'react';
import {
  loadBlobTextFormats,
  type BlobTextFormat,
} from './componentTextFormats';

export function useComponentTextFormats(problemId: string, hashKey: string) {
  const [retry, setRetry] = useState(0);
  const key = `${problemId}/${hashKey}/${retry}`;
  const hashes = useMemo(() => (hashKey ? hashKey.split(',') : []), [hashKey]);
  const [state, setState] = useState<{
    key: string;
    values: Record<string, BlobTextFormat>;
    error: string;
  } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void loadBlobTextFormats(problemId, hashes, controller.signal).then(
      (values) => {
        if (!controller.signal.aborted) setState({ key, values, error: '' });
      },
      (error: Error) => {
        if (!controller.signal.aborted)
          setState({ key, values: {}, error: error.message });
      },
    );
    return () => controller.abort();
  }, [problemId, hashes, key]);
  return {
    values: state?.key === key ? state.values : {},
    loading: state?.key !== key,
    error: state?.key === key ? state.error : '',
    reload: () => setRetry((value) => value + 1),
  };
}
