export const singleVerificationLanguages = [
  'c99',
  'cpp17',
  'python3',
  'pypy3',
  'java8',
  'kotlin',
] as const;
export type SingleVerificationLanguage =
  (typeof singleVerificationLanguages)[number];
export const singleVerificationTags = [
  'OK',
  'RJ',
  'TL',
  'TO',
  'TM',
  'WA',
  'ML',
  'RE',
] as const;
export type SingleVerificationTag = (typeof singleVerificationTags)[number];
const extensions: Record<SingleVerificationLanguage, string> = {
  c99: '.c',
  cpp17: '.cpp',
  python3: '.py',
  pypy3: '.py',
  java8: '.java',
  kotlin: '.kt',
};

export function singleVerificationFilename(
  base: string,
  language: SingleVerificationLanguage,
) {
  if (!extensions[language])
    throw new Error('ZOJ 채점기에서 지원하는 언어를 선택하세요.');
  const stem = base.trim().replace(/\.(?:c|cc|cpp|cxx|py|java|kt)$/i, '');
  if (!stem) throw new Error('확장자를 제외한 파일명을 입력하세요.');
  if (!/^[A-Za-z0-9_][A-Za-z0-9_-]*$/.test(stem))
    throw new Error(
      '파일명에는 영문·숫자·밑줄·하이픈만 사용하세요. 폴더 경로와 점은 사용할 수 없습니다.',
    );
  const filename = stem + extensions[language];
  if (filename.length > 100)
    throw new Error('확장자를 포함한 파일명은 100자 이내로 입력하세요.');
  return filename;
}
