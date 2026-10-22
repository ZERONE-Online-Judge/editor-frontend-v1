import type { LanguageResourceLimits, ProblemDocument } from './types';
export const limitLanguages: {
  key: keyof LanguageResourceLimits;
  label: string;
  corrected: boolean;
}[] = [
  { key: 'cpp17', label: 'C++17', corrected: false },
  { key: 'c99', label: 'C99', corrected: false },
  { key: 'python3', label: 'Python 3.11', corrected: true },
  { key: 'pypy3', label: 'PyPy 3.11', corrected: true },
  { key: 'java8', label: 'Java 8', corrected: true },
  { key: 'kotlin', label: 'Kotlin', corrected: true },
];
const time = {
  python3: [3, 2000],
  pypy3: [3, 2000],
  java8: [2, 1000],
  kotlin: [2, 1000],
};
const memory = {
  python3: [2, 32],
  pypy3: [2, 128],
  java8: [2, 16],
  kotlin: [2, 16],
};
export function effectiveLimits(
  doc: Pick<ProblemDocument, 'info' | 'language_resource_limits'>,
  language: keyof LanguageResourceLimits,
) {
  const row = doc.language_resource_limits?.[language] ?? {};
  const auto = !row.disable_auto_adjustment && language in time;
  const t = auto ? time[language as keyof typeof time] : [1, 0];
  const m = auto ? memory[language as keyof typeof memory] : [1, 0];
  return {
    time_limit_ms: row.time_limit_ms ?? doc.info.time_limit_ms * t[0] + t[1],
    memory_limit_mb:
      row.memory_limit_mb ?? doc.info.memory_limit_mb * m[0] + m[1],
  };
}
