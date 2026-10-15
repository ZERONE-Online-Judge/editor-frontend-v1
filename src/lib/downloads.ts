import { ApiError } from './api';
import type { Counterexample, SourceFile, Test } from './types';

export type DownloadFile = { path: string; sha256: string };

export function testDownloads(testset: string, tests: Test[]): DownloadFile[] {
  return tests.flatMap((test) => {
    const name = `tests/${testset}/${String(test.index).padStart(4, '0')}`;
    return [
      ...(test.input_sha
        ? [{ path: `${name}.in`, sha256: test.input_sha }]
        : []),
      ...(test.answer_sha
        ? [{ path: `${name}.out`, sha256: test.answer_sha }]
        : []),
    ];
  });
}

export function sourceDownloads(
  items: { file: SourceFile; isSolution: boolean }[],
): DownloadFile[] {
  return items.map(({ file, isSolution }) => ({
    path: `${isSolution ? 'solutions' : 'files'}/${file.name}`,
    sha256: file.sha256,
  }));
}

export function counterexampleDownloads(
  examples: Counterexample[],
  useReduced: boolean,
  ids?: string[],
): DownloadFile[] {
  return examples.flatMap((original, index) => {
    if (ids && !ids.includes(original.id)) return [];
    const reduced = useReduced && original.minimized;
    const example = reduced ? { ...original, ...reduced } : original;
    const prefix = `counterexamples/${String(index + 1).padStart(4, '0')}-${reduced ? 'reduced' : 'original'}`;
    return [
      { path: `${prefix}/input.in`, sha256: example.input_sha },
      { path: `${prefix}/expected.out`, sha256: example.answer_sha },
      ...example.findings.flatMap((finding, findingIndex) => {
        if (!finding.actual_sha) return [];
        const name = finding.solution
          .replace(/[^A-Za-z0-9_.-]/g, '_')
          .replace(/\.{2,}/g, '_')
          .slice(0, 90);
        return [
          {
            path: `${prefix}/actual/${String(findingIndex + 1).padStart(3, '0')}-${name}.out`,
            sha256: finding.actual_sha,
          },
        ];
      }),
    ];
  });
}

export async function downloadArchive(
  problemId: string,
  files: DownloadFile[],
  filename: string,
) {
  const response = await fetch(`/api/problems/${problemId}/downloads`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-Editor-Request': '1' },
    body: JSON.stringify({ files, filename }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({
      error: { message: '다운로드하지 못했습니다. 다시 시도하세요.' },
    }));
    throw new ApiError(response.status, data.error || data);
  }
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  try {
    link.click();
  } finally {
    link.remove();
    // Allow the browser to start saving before releasing the object URL.
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}
