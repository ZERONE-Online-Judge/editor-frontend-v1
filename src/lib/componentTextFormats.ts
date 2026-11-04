import { post } from './api';

export type BlobTextFormat = {
  sha256: string;
  size: number;
  line_ending: 'none' | 'lf' | 'crlf' | 'cr' | 'mixed' | null;
  has_final_newline: boolean | null;
  needs_lf_conversion: boolean;
  binary: boolean;
};

export async function loadBlobTextFormats(
  problemId: string,
  hashes: string[],
  signal?: AbortSignal,
) {
  const values: Record<string, BlobTextFormat> = {};
  const unique = [...new Set(hashes)];
  for (let offset = 0; offset < unique.length; offset += 100) {
    const batch = unique.slice(offset, offset + 100);
    const response = await post<{ items: BlobTextFormat[] }>(
      `/problems/${problemId}/blobs/text-formats`,
      { sha256: batch },
      signal,
    );
    if (signal?.aborted)
      throw new DOMException('요청을 취소했습니다.', 'AbortError');
    for (const item of response.items) {
      if (!batch.includes(item.sha256))
        throw new Error('요청한 자료와 다른 줄바꿈 정보를 받았습니다.');
      values[item.sha256] = item;
    }
    if (batch.some((hash) => !values[hash]))
      throw new Error('일부 자료의 줄바꿈 정보를 확인하지 못했습니다.');
  }
  return values;
}

export async function normalizeBlobLf(
  problemId: string,
  hashes: string[],
  signal?: AbortSignal,
) {
  const values: Record<string, string> = {};
  const unique = [...new Set(hashes)];
  for (let offset = 0; offset < unique.length; offset += 100) {
    const batch = unique.slice(offset, offset + 100);
    const response = await post<{
      items: (BlobTextFormat & { normalized_sha256: string })[];
    }>(`/problems/${problemId}/blobs/normalize-lf`, { sha256: batch }, signal);
    if (signal?.aborted)
      throw new DOMException('요청을 취소했습니다.', 'AbortError');
    for (const item of response.items) {
      if (!batch.includes(item.sha256) || !item.normalized_sha256)
        throw new Error('줄바꿈 변환 결과를 확인하지 못했습니다.');
      values[item.sha256] = item.normalized_sha256;
    }
    if (batch.some((hash) => !values[hash]))
      throw new Error('일부 자료의 변환 결과를 받지 못했습니다.');
  }
  return values;
}

/** Normalize judging data without decoding large or binary files in the browser. */
export async function normalizeTestBlobs(
  problemId: string,
  hashes: string[],
  signal?: AbortSignal,
) {
  const formats = await loadBlobTextFormats(problemId, hashes, signal);
  const candidates = Object.values(formats)
    .filter((file) => !file.binary && file.needs_lf_conversion)
    .map((file) => file.sha256);
  return normalizeBlobLf(problemId, candidates, signal);
}
