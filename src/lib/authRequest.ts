import { api } from './api';

export const AUTH_REQUEST_TIMEOUT_MS = 12_000;

export class AuthRequestTimeoutError extends Error {
  constructor() {
    super('계정 확인 응답이 늦어지고 있습니다. 잠시 후 다시 시도해 주세요.');
  }
}

/** A failed account check must finish without implying that the user logged out. */
export function authRequest<T>(path: string, signal?: AbortSignal): Promise<T> {
  if (signal?.aborted)
    return Promise.reject(new DOMException('Aborted', 'AbortError'));
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout>;
  let cancel = () => {};
  const deadline = new Promise<never>((_, reject) => {
    cancel = () => {
      reject(new DOMException('Aborted', 'AbortError'));
      controller.abort();
    };
    signal?.addEventListener('abort', cancel, { once: true });
    timeout = setTimeout(() => {
      reject(new AuthRequestTimeoutError());
      controller.abort();
    }, AUTH_REQUEST_TIMEOUT_MS);
  });
  return Promise.race([
    api<T>(path, { signal: controller.signal }),
    deadline,
  ]).finally(() => {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', cancel);
  });
}
