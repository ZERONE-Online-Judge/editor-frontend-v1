import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { inspectCHeaderCase } from './cHeaderCase';
import {
  ExecutionCancelledError,
  type HeaderCaseSource,
} from './executionHeaderCase';

export type HeaderCaseFile = {
  name: string;
  findings: ReturnType<typeof inspectCHeaderCase>;
  unavailable?: boolean;
};

type Pending = {
  controller: AbortController;
  resolve: (confirmed: boolean) => void;
  ready: boolean;
};

/** A confirmation belongs to one immutable workspace/snapshot scope only. */
export function useCHeaderCaseWarning(scopeKey: string) {
  const [warning, setWarning] = useState<{
    scopeKey: string;
    request: Pending;
    files: HeaderCaseFile[];
  } | null>(null);
  const scope = useRef({ key: scopeKey, active: false });
  const pending = useRef<Pending | null>(null);
  if (warning && warning.scopeKey !== scopeKey) setWarning(null);
  useLayoutEffect(() => {
    const current = { key: scopeKey, active: true };
    scope.current = current;
    return () => {
      current.active = false;
      const request = pending.current;
      pending.current = null;
      request?.controller.abort();
      request?.resolve(false);
    };
  }, [scopeKey]);
  const settle = useCallback((confirmed: boolean) => {
    const request = pending.current;
    if (!request || (confirmed && !request.ready)) return;
    pending.current = null;
    request.controller.abort();
    setWarning(null);
    request.resolve(confirmed);
  }, []);
  const check = useCallback(
    async (
      sources: HeaderCaseSource[],
      load: (sha256: string, signal: AbortSignal) => Promise<string>,
    ) => {
      const current = scope.current;
      if (!current.active || current.key !== scopeKey)
        throw new ExecutionCancelledError();
      setWarning(null);
      const controller = new AbortController();
      const confirmed = await new Promise<boolean>((resolve, reject) => {
        const request = { controller, resolve, ready: false };
        pending.current = request;
        void (async () => {
          try {
            const content = new Map<string, Promise<string>>();
            const warnings = await Promise.all(
              sources.map(async (source) => {
                try {
                  let text = source.content;
                  if (text === undefined && source.sha256) {
                    if (!content.has(source.sha256))
                      content.set(
                        source.sha256,
                        load(source.sha256, controller.signal),
                      );
                    text = await content.get(source.sha256);
                  }
                  return {
                    name: source.name,
                    findings: inspectCHeaderCase(source.language, text ?? ''),
                  };
                } catch {
                  return { name: source.name, findings: [], unavailable: true };
                }
              }),
            );
            if (!current.active || pending.current !== request) return;
            const found = warnings.filter(
              (file) => file.findings.length > 0 || file.unavailable,
            );
            if (found.length) {
              request.ready = true;
              setWarning({ scopeKey, request, files: found });
            } else {
              pending.current = null;
              resolve(true);
            }
          } catch (error) {
            if (!current.active || pending.current !== request) return;
            pending.current = null;
            reject(error);
          }
        })();
      });
      if (!confirmed || !current.active || current.key !== scopeKey)
        throw new ExecutionCancelledError();
    },
    [scopeKey],
  );
  return {
    files: warning?.scopeKey === scopeKey ? warning.files : null,
    check,
    confirm: () => settle(true),
    cancel: () => settle(false),
  };
}
