import type { JobKind } from './types';

export type ExecutionView = 'all' | 'verify' | 'stress' | 'package';

export function matchesExecutionView(kind: JobKind, view: ExecutionView) {
  return view === 'all' ? kind !== 'verify' : kind === view;
}

export function executionResultPath(
  problemId: string,
  kind: JobKind,
  jobId: string,
) {
  const tab = kind === 'verify' ? 'verification' : 'invocations';
  return `/problems/${encodeURIComponent(problemId)}/${tab}?job=${encodeURIComponent(jobId)}`;
}
