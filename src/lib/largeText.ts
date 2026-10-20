export const TEXT_PREVIEW_LIMIT = 256 * 1024;
export type TextPreview = { text: string; truncated: boolean; binary: boolean };

/** Bound work before splitting lines or mounting an editor. Keep a prefix only. */
export function textPreview(
  value: string,
  limit = TEXT_PREVIEW_LIMIT,
): TextPreview {
  const end = Math.min(value.length, limit);
  let lines = 1,
    column = 0,
    i = 0;
  for (; i < end; i++) {
    if (value.charCodeAt(i) === 10) {
      if (++lines > 5000) break;
      column = 0;
    } else if (++column > 16384) break;
  }
  if (i < value.length && i > 0 && /[\uD800-\uDBFF]/.test(value[i - 1])) i--;
  return {
    text: value.slice(0, i),
    truncated: i < value.length,
    binary: false,
  };
}

/** Also bound transfers when a server ignores Range. Never buffer response.text(). */
export async function responsePreview(
  response: Response,
  limit = TEXT_PREVIEW_LIMIT,
  clipLines = true,
): Promise<TextPreview> {
  if (
    response.status === 416 &&
    /\/0$/.test(response.headers.get('Content-Range') || '')
  )
    return { text: '', truncated: false, binary: false };
  if (!response.ok) throw new Error('파일을 불러오지 못했습니다.');
  const reader = response.body?.getReader();
  if (!reader)
    throw new Error('파일 미리보기를 읽을 수 없습니다. 다운로드해 확인하세요.');
  const total = Number(
    response.headers.get('Content-Range')?.split('/')[1] ||
      response.headers.get('Content-Length'),
  );
  const bytes = new Uint8Array(limit + 1);
  let size = 0;
  try {
    while (size <= limit) {
      const part = await reader.read();
      if (part.done) break;
      const kept = part.value.subarray(0, bytes.length - size);
      bytes.set(kept, size);
      size += kept.length;
      if (size > limit) break;
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const truncated = size > limit || total > limit;
  const content = bytes.subarray(0, Math.min(size, limit));
  try {
    if (content.subarray(0, 4096).includes(0)) throw new Error('binary');
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(content, {
      stream: truncated,
    });
    const preview = clipLines
      ? textPreview(decoded, limit)
      : { text: decoded, truncated: false, binary: false };
    return { ...preview, truncated: truncated || preview.truncated };
  } catch {
    return { text: '', truncated, binary: true };
  }
}

export async function sourceFileText(file: File): Promise<string> {
  if (file.size > 512 * 1024)
    throw new Error(
      '512KiB를 넘는 코드는 브라우저에서 직접 실행할 수 없습니다. 소스 파일 크기를 줄여 주세요.',
    );
  const value = await file.text();
  if (value.includes('\0')) throw new Error('텍스트 소스 파일을 선택하세요.');
  return value;
}
