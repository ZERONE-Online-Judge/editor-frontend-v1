import type { Job, StressPattern } from './types';

function argument(value: string): string {
  return /^[A-Za-z0-9_./:+-]+$/.test(value)
    ? value
    : "'" + value.replaceAll("'", "'\"'\"'") + "'";
}

export function composeStressPatterns({
  template,
  modes,
  nMin,
  nMax,
  valueMin,
  valueMax,
  limit,
}: {
  template: string;
  modes: string;
  nMin: number;
  nMax: number;
  valueMin: number;
  valueMax: number;
  limit: number;
}): StressPattern[] {
  if (
    ![nMin, nMax, valueMin, valueMax].every(Number.isSafeInteger) ||
    nMin < 0 ||
    nMin > nMax ||
    valueMin > valueMax
  )
    throw new Error('N과 값 범위의 최솟값·최댓값을 올바른 정수로 지정하세요.');
  const choices = [
    ...new Set(
      modes
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];
  if (template.includes('{mode}') && !choices.length)
    throw new Error(
      '생성기가 지원하는 mode를 입력하거나 템플릿에서 {mode}를 제거하세요.',
    );
  const selected = template.includes('{mode}') ? choices : [''];
  if (
    choices.some(
      (value) => value.length > 200 || /[\r\n\u2028\u2029]/.test(value),
    )
  )
    throw new Error('mode는 줄바꿈 없는 200자 이하 값으로 입력하세요.');
  if (selected.length > limit)
    throw new Error(`패턴을 최대 ${limit}개까지 조합할 수 있습니다.`);
  return selected.map((mode, index) => {
    const values: Record<string, string> = {
      mode: argument(mode),
      N: nMin === nMax ? String(nMin) : `[${nMin}..${nMax}]`,
      lo: String(valueMin),
      hi: String(valueMax),
    };
    const command = template
      .trim()
      .replace(/\{([^}]+)\}/g, (match, name: string, offset: number) => {
        if (name === 'seed') return match;
        if (!Object.hasOwn(values, name))
          throw new Error(`지원하지 않는 자리표시자입니다: ${match}`);
        const before = template.trim()[offset - 1],
          after = template.trim()[offset + match.length];
        if ((before && !/\s/.test(before)) || (after && !/\s/.test(after)))
          throw new Error(
            '조합 자리표시자는 따옴표 없이 독립된 인자로 입력하세요.',
          );
        return values[name];
      });
    if (!command) throw new Error('생성기 명령 템플릿을 입력하세요.');
    if (command.length > 4096)
      throw new Error('조합한 생성기 명령이 너무 깁니다.');
    return {
      name: (mode ? `mode ${mode}` : `범위 조합 ${index + 1}`).slice(0, 80),
      command,
    };
  });
}

export function retryStressOptions(
  job: Job,
  candidates: string[],
): Record<string, unknown> {
  const options: Record<string, unknown> = {};
  for (const key of [
    'generator',
    'patterns',
    'reference',
    'testset',
    'group',
    'iterations',
    'duration_seconds',
    'counterexample_limit',
    'counterexample_verdicts',
    'minimize',
    'minimize_attempts',
    'minimize_seconds',
    'seed_step',
  ]) {
    if (key in job.options) options[key] = job.options[key];
  }
  const step = typeof options.seed_step === 'number' ? options.seed_step : 1;
  const base =
    typeof job.options.seed_start === 'number' ? job.options.seed_start : 1;
  const count =
    job.result.stress?.iterations_started || job.result.iterations || 0;
  const previous =
    job.result.stress?.last_seed ??
    (count > 0 ? base + (count - 1) * step : undefined);
  const start =
    previous != null
      ? previous + step
      : typeof job.options.seed_start === 'number'
        ? job.options.seed_start
        : 1;
  const iterations =
    typeof options.iterations === 'number' ? options.iterations : 50;
  if (!Number.isSafeInteger(start + (iterations - 1) * step))
    throw new Error(
      '다음 시드 범위가 안전한 정수 범위를 넘습니다. 새 조건으로 실행하세요.',
    );
  return {
    ...options,
    candidates,
    seed_start: start,
    stop_mode: 'all_candidates',
    stop_on_first: false,
    focus_uncovered: true,
  };
}
