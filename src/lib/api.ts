import { responsePreview } from './largeText';
import type { SourceFile } from './types';
export class ApiError extends Error {
  code: string;
  details: Record<string, unknown>;
  status: number;
  constructor(status: number, details: Record<string, unknown>) {
    super(String(details.message || '요청을 처리하지 못했습니다.'));
    this.code = String(details.code || 'request_failed');
    this.details = details;
    this.status = status;
  }
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('X-Editor-Request', '1');
  if (typeof options.body === 'string')
    headers.set('Content-Type', 'application/json');
  const response = await fetch(`/api${path}`, {
    ...options,
    headers,
    credentials: 'same-origin',
  });
  if (!response.ok) {
    const data = await response
      .json()
      .catch(() => ({ error: { message: '서버에 연결하지 못했습니다.' } }));
    if ((data.error || data).code === 'central_login_required')
      window.dispatchEvent(new Event('zoj-central-login-required'));
    throw new ApiError(response.status, data.error || data);
  }
  return response.json();
}
export function post<T>(path: string, body: unknown = {}) {
  return api<T>(path, { method: 'POST', body: JSON.stringify(body) });
}
export function put<T>(path: string, body: unknown) {
  return api<T>(path, { method: 'PUT', body: JSON.stringify(body) });
}
export function patch<T>(path: string, body: unknown) {
  return api<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
}
export async function upload(
  problemId: string,
  content: Blob | string,
): Promise<{ sha256: string; size: number }> {
  return api(`/problems/${problemId}/blobs`, {
    method: 'POST',
    body:
      typeof content === 'string'
        ? new Blob([content], { type: 'text/plain;charset=utf-8' })
        : content,
  });
}
export async function blobText(
  problemId: string,
  sha: string,
): Promise<string> {
  const preview = await blobPreview(problemId, sha);
  if (preview.truncated || preview.binary)
    throw new Error(
      '전체 내용을 편집창에 불러올 수 없습니다. 원본 파일을 다운로드해 확인하세요.',
    );
  return preview.text;
}
export async function blobPreview(
  problemId: string,
  sha: string,
  signal?: AbortSignal,
  limit = 262144,
): Promise<{ text: string; truncated: boolean; binary: boolean }> {
  const response = await fetch(`/api/problems/${problemId}/blobs/${sha}`, {
    credentials: 'same-origin',
    headers: { Range: `bytes=0-${limit}` },
    signal,
  });
  return responsePreview(response, limit);
}

export const languages = {
  cpp17: 'C++17 · ZOJ 채점기',
  cpp20: 'C++20',
  c17: 'C17',
  c99: 'C99 · ZOJ 채점기',
  python3: 'Python 3.11 · ZOJ 채점기',
  pypy3: 'PyPy 3.11 · ZOJ 채점기',
  kotlin: 'Kotlin 1.9.24 · ZOJ 채점기',
  java17: 'Java 17',
  java8: 'Java 8 · ZOJ 채점기',
  text: '텍스트',
};
export const tags = {
  MA: 'Main · 기준 정답',
  OK: '정답',
  WA: '오답',
  TL: '시간 초과',
  ML: '메모리 초과',
  RE: '런타임 오류',
  PE: '출력 형식 오류',
  RJ: '정답이 아닌 결과',
  TO: '정답 또는 시간 초과',
  TM: '시간 또는 메모리 초과',
  NR: '실행하지 않음',
};
export const jobLabels = {
  prepare: '입력·정답 생성',
  verify: '풀이 검증',
  'validator-tests': 'Validator 자체 테스트',
  'checker-tests': 'Checker 자체 테스트',
  stress: '스트레스 테스트',
  package: '패키지 생성',
  render: '지문 렌더링',
};
export const statusLabels = {
  queued: '대기 중',
  running: '실행 중',
  completed: '완료',
  failed: '실패',
  cancelled: '취소',
};
export function time(value: number) {
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value * 1000));
}
export function bytes(value: number) {
  return value >= 1048576
    ? `${(value / 1048576).toFixed(1)} MiB`
    : value >= 1024
      ? `${(value / 1024).toFixed(1)} KiB`
      : `${value} B`;
}
export function inferLanguage(name: string): SourceFile['language'] {
  if (name.endsWith('.kt')) return 'kotlin';
  return name.endsWith('.py')
    ? 'python3'
    : name.endsWith('.java')
      ? 'java17'
      : name.endsWith('.c')
        ? 'c17'
        : /\.(cpp|cc|cxx)$/.test(name)
          ? 'cpp17'
          : 'text';
}
