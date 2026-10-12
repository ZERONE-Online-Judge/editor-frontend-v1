import { createContext, useContext } from 'react';
import type { Job, JobKind, ProblemDocument, WorkspaceData } from './types';
export type Workspace = {
  data: WorkspaceData;
  document: ProblemDocument;
  dirty: boolean;
  busy: boolean;
  editable: boolean;
  mutate: (fn: (doc: ProblemDocument) => void) => void;
  save: () => Promise<number>;
  reload: () => Promise<void>;
  run: (kind: JobKind, options?: Record<string, unknown>) => Promise<Job>;
  notify: (message: string, error?: boolean) => void;
};
export const WorkspaceContext = createContext<Workspace | null>(null);
export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error('Problem workspace is required');
  return value;
}
