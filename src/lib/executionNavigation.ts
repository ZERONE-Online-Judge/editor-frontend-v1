import type { JobKind } from './types';

export type ExecutionView = 'all' | 'verify' | 'stress' | 'package';

export function matchesExecutionView(kind: JobKind, view: ExecutionView) {
  return view === 'all' || kind === view;
}

export function executionResultPath(problemId: string, jobId: string) {
  return `/problems/${encodeURIComponent(problemId)}/invocations?job=${encodeURIComponent(jobId)}`;
}
