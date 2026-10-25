import type { Job } from './types';
import { jobCategory } from './executionCategories';
import { isCheckOnly } from './validationResults';

type Saved = Record<string, unknown>;

function object(value: unknown): Saved {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Saved)
    : {};
}
function names(value: unknown): string[] | undefined {
  return Array.isArray(value)
    ? [
        ...new Set(
          value.filter(
            (name): name is string => typeof name === 'string' && !!name.trim(),
          ),
        ),
      ]
    : undefined;
}
function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : '';
}
function count(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
    ? value
    : undefined;
}
function indices(value: unknown): number[] | undefined {
  if (!Array.isArray(value) || value.some((index) => count(index) == null))
    return undefined;
  return [...new Set(value as number[])].sort((a, b) => a - b);
}
function list(values: string[]) {
  return values.length > 3
    ? `${values.slice(0, 3).join(', ')} 외 ${values.length - 3}개`
    : values.join(', ');
}
function ranges(values: number[]) {
  const groups: string[] = [];
  for (let i = 0; i < values.length; i++) {
    const first = values[i];
    while (i + 1 < values.length && values[i + 1] === values[i] + 1) i++;
    groups.push(first === values[i] ? `#${first}` : `#${first}–${values[i]}`);
  }
  return list(groups);
}
function testScope(job: Job) {
  const options = job.options;
  const scope = object(options.scope);
  const sets = names(options.testsets) ?? names(scope.testsets);
  const single = text(options.testset) || text(scope.testset);
  const all =
    options.all_testsets === true ||
    scope.all_testsets === true ||
    (job.kind === 'package' && !sets);
  const setLabel = all
    ? `모든 세트${sets?.length ? ` ${sets.length}개` : ''}`
    : sets && sets.length > 1
      ? `선택 세트 ${sets.length}개`
      : sets?.[0] || single
        ? `${sets?.[0] || single} 세트`
        : '';
  const selected = indices(options.test_indices) ?? indices(scope.test_indices);
  const total = count(scope.test_count);
  const testLabel = selected?.length
    ? selected.length === 1
      ? `테스트 #${selected[0]}`
      : `선택 테스트 ${selected.length}개`
    : selected
      ? `전체 테스트${total ? ` ${total}개` : ''}`
      : '';
  return {
    setLabel,
    testLabel,
    selected,
    detail: [
      sets?.length ? `세트: ${list(sets)}` : '',
      selected?.length ? `테스트: ${ranges(selected)}` : '',
    ].filter(Boolean),
  };
}

// Only saved request data is used. Live results can be partial and the
// current working copy may have changed since this request was submitted.
export function executionPresentation(job: Job) {
  const options = job.options;
  const scope = testScope(job);
  const details: string[] = [];
  let parts: string[];
  if (job.kind === 'verify') {
    const selected = names(options.solutions);
    const savedScope = object(options.scope);
    const runnable = names(savedScope.solutions);
    const submittedTemporary = Array.isArray(options.temporary_solutions)
      ? names(
          options.temporary_solutions.map((source) => object(source).name),
        ) || []
      : [];
    const temporary = selected?.length
      ? submittedTemporary.filter((name) => selected.includes(name))
      : submittedTemporary;
    const label = temporary.length
      ? selected?.length
        ? selected.length > temporary.length
          ? `임시 코드 포함 풀이 ${selected.length}개 검증`
          : `임시 코드 ${temporary.length}개 검증`
        : selected
          ? '임시 코드 포함 전체 풀이 검증'
          : '임시 코드 포함 풀이 검증'
      : selected?.length
        ? `선택 풀이 ${selected.length}개 검증`
        : selected
          ? `전체 풀이 검증${runnable?.length ? ` · 대상 ${runnable.length}개` : ''}`
          : runnable?.length
            ? `풀이 ${runnable.length}개 검증`
            : '풀이 검증';
    parts = [label, scope.setLabel, scope.testLabel];
    if (selected?.length) details.push(`풀이: ${list(selected)}`);
    else if (runnable?.length) details.push(`대상 풀이: ${list(runnable)}`);
    if (options.force_prepare === true) parts.push('준비 새로 실행');
  } else if (job.kind === 'prepare') {
    const category = jobCategory(job).id;
    const label =
      category === 'prepare-inputs'
        ? isCheckOnly(job)
          ? '입력 검사'
          : scope.selected?.length
            ? '입력 재생성'
            : '입력 생성'
        : category === 'prepare-validate'
          ? '저장 입력 검사'
          : category === 'prepare-answers'
            ? '정답 생성'
            : category === 'prepare-full'
              ? '입력·정답 생성'
              : '테스트 준비';
    parts = [label, scope.setLabel, scope.testLabel];
    if (!isCheckOnly(job) && options.auto_apply === true)
      parts.push('자동 반영 요청');
  } else if (job.kind === 'stress') {
    const saved = object(options.stress_configuration);
    const config = Object.keys(saved).length ? saved : options;
    const candidates = Array.isArray(config.candidates)
      ? names(
          config.candidates.map((source) =>
            typeof source === 'string' ? source : object(source).name,
          ),
        )
      : text(options.candidate)
        ? [text(options.candidate)]
        : undefined;
    const stop =
      text(config.stop_mode) ||
      (config.stop_on_first === true
        ? 'first'
        : config.stop_on_first === false
          ? 'target'
          : '');
    const limit = count(config.counterexample_limit);
    const stopLabel =
      stop === 'all_candidates'
        ? '모든 비교 풀이 반례'
        : stop === 'first'
          ? '첫 반례 탐색'
          : stop === 'target'
            ? `반례 ${limit ? `최대 ${limit}개` : '수집'}`
            : '';
    const setName = text(config.testset) || text(options.testset);
    parts = [
      '스트레스 테스트',
      candidates?.length ? `비교 풀이 ${candidates.length}개` : '',
      stopLabel,
      setName ? `${setName} 세트` : '',
    ];
    if (config.minimize === true) parts.push('반례 축소');
    if (text(config.reference)) details.push(`기준: ${text(config.reference)}`);
    if (candidates?.length) details.push(`비교: ${list(candidates)}`);
    const patterns = Array.isArray(config.patterns)
      ? config.patterns.length
      : 0;
    if (patterns) details.push(`생성기 패턴 ${patterns}개`);
    if (count(config.iterations)) details.push(`최대 ${config.iterations}회`);
    if (count(config.duration_seconds))
      details.push(`최대 ${config.duration_seconds}초`);
    if (count(config.seed_start) || config.seed_start === 0)
      details.push(`시작 시드 ${config.seed_start}`);
    if (count(config.seed_step)) details.push(`시드 간격 ${config.seed_step}`);
    if (config.focus_uncovered === true) details.push('미발견 풀이 우선');
    if (text(config.group)) details.push(`그룹: ${text(config.group)}`);
  } else if (job.kind === 'package') {
    const format = text(options.export_format) || text(options.package_type);
    const label =
      format === 'zoj'
        ? 'ZOJ 패키지 생성'
        : format === 'editor'
          ? 'Editor 패키지 생성'
          : format === 'linux'
            ? 'Linux 패키지 생성'
            : format === 'sources'
              ? '소스 패키지 생성'
              : '패키지 생성';
    parts = [
      label,
      options.verify === false
        ? '검증 없이'
        : options.verify === true
          ? '검증 포함'
          : '',
      scope.setLabel,
    ];
    if (format === 'zoj' && text(options.statement_language))
      details.push(`지문 언어: ${text(options.statement_language)}`);
  } else if (job.kind === 'validator-tests' || job.kind === 'checker-tests') {
    parts = [
      job.kind === 'validator-tests'
        ? 'Validator 자체 테스트'
        : 'Checker 자체 테스트',
      '전체 검사',
    ];
  } else if (job.kind === 'render') {
    parts = ['지문 HTML·PDF 생성'];
  } else {
    parts = [jobCategory(job).label];
  }
  if (['verify', 'prepare', 'package'].includes(job.kind))
    details.push(...scope.detail);
  if (options.snapshot === 'committed')
    details.push(`커밋 r${job.revision} 기준`);
  else if (options.snapshot === 'working_copy')
    details.push('요청 당시 작업 사본 기준');
  return {
    title: parts.filter(Boolean).join(' · '),
    detail: details.join(' · '),
  };
}

export function executionTitle(job: Job) {
  return executionPresentation(job).title;
}

export function executionHistoryPresentation(job: Job) {
  const [title, ...scope] = executionTitle(job).split(' · ');
  return {
    title,
    scope: scope
      .filter((part) => part !== '모든 세트 1개')
      .map((part) => part.replace(/^전체 테스트 /, '테스트 '))
      .join(' · '),
  };
}
