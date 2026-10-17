import type { SourceFile } from './types';

export function statementAssets(
  problemId: string,
  files: Record<string, SourceFile> = {},
) {
  return Object.fromEntries(
    Object.values(files)
      .filter((file) => file.kind === 'statement')
      .map((file) => [
        file.name,
        `/api/problems/${encodeURIComponent(problemId)}/blobs/${file.sha256}`,
      ]),
  );
}

export function statementImageMime(bytes: Uint8Array, filename: string) {
  const ascii = (start: number, length: number) =>
    String.fromCharCode(...bytes.slice(start, start + length));
  if (ascii(0, 8) === '\x89PNG\r\n\x1a\n') return 'image/png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return 'image/jpeg';
  if (/^GIF8[79]a$/.test(ascii(0, 6))) return 'image/gif';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') return 'image/webp';
  if (ascii(4, 4) === 'ftyp' && /^(avif|avis)$/.test(ascii(8, 4)))
    return 'image/avif';
  if (
    /\.svg$/i.test(filename) &&
    /^\s*(?:<\?xml[\s\S]*?\?>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg(?:\s|>)/i.test(
      new TextDecoder().decode(bytes.slice(0, 2048)),
    )
  )
    return 'image/svg+xml';
  return null;
}
