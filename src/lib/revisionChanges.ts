import { documentChanges, equal, type DocumentChange } from './documentChanges';
import type { ProblemDocument } from './types';

export const changeLabels = {
  added: '추가',
  changed: '수정',
  removed: '삭제',
} as const;
export const categories = [
  '설정',
  '지문',
  '코드·파일',
  '테스트',
  '공개 자료',
] as const;
export function categoryOf(change: DocumentChange) {
  return change.group === '설정' || change.group === '프로그램 연결'
    ? '설정'
    : change.group === '지문'
      ? '지문'
      : ['파일', '풀이', '파일 역할'].includes(change.group)
        ? '코드·파일'
        : change.group === '공개 자료'
          ? '공개 자료'
          : '테스트';
}
export const displayChangeLabel = (change: DocumentChange) =>
  change.label
    .replace(/^korean(?= ·| 지문)/, '한국어')
    .replace(/^english(?= ·| 지문)/, '영어');
const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
export const valueText = (value: unknown): string =>
  value === undefined
    ? ''
    : typeof value === 'string'
      ? value
      : JSON.stringify(value, null, 2);
export function displayValue(value: unknown) {
  if (value === undefined) return '없음';
  if (value === null) return '미지정';
  if (value === '') return '비어 있음';
  if (typeof value === 'boolean') return value ? '사용' : '사용 안 함';
  if (Array.isArray(value) && !value.length) return '없음';
  return valueText(value);
}
const fieldLabels: Record<string, string> = {
  name: '파일 이름',
  kind: '파일 분류',
  language: '언어',
  size: '파일 크기 (B)',
  tag: '기본 기대 판정',
  extra_tags: '세트별 기대 판정',
  group_tags: '그룹별 기대 판정',
  roles: '구성요소 역할',
  role: '자료 역할',
  entry_class: '시작 클래스',
  resource_policy: '리소스 적용 조건',
  compile_with_solution: '풀이와 함께 컴파일',
  attach_to_build: '빌드에 첨부',
  index: '테스트 번호',
  command: '생성 명령',
  group: '그룹',
  points: '점수',
  description: '설명',
  sample: '지문 예제 표시',
  verify_statement_io: '표시용 입출력 검사',
  script: '생성 스크립트',
  groups_enabled: '그룹 사용',
  groups: '테스트 그룹',
  tests: '등록 테스트',
  expected: '기대 판정',
  strategy: '공개 시점',
  files: '공개 파일',
  solutions: '공개 풀이',
  testsets: '공개 테스트 세트',
  exists: '테스트 세트',
};
const contentKeys = new Set([
  'sha256',
  'input_sha',
  'answer_sha',
  'output_sha',
  'statement_input',
  'statement_output',
]);
const statementFields: Record<string, string> = {
  legend: '지문',
  input: '입력 형식',
  output: '출력 형식',
  scoring: '부분 점수',
  interaction: '인터랙션',
  notes: '노트',
  tutorial: '해설',
};
export function changedFields(change: DocumentChange) {
  const a = record(change.before),
    b = record(change.after);
  if (!a && !b) return [];
  return [...new Set([...Object.keys(a || {}), ...Object.keys(b || {})])]
    .filter(
      (key) =>
        !contentKeys.has(key) &&
        !(/^statements\/[^/]+$/.test(change.key) && key in statementFields) &&
        !equal(a?.[key], b?.[key]),
    )
    .map((key) => ({
      key,
      label:
        /^statements\/[^/]+$/.test(change.key) && key === 'name'
          ? '지문 제목'
          : key === 'show_in_review'
            ? '미리보기 표시'
            : fieldLabels[key] || key,
      before: a?.[key],
      after: b?.[key],
    }));
}
export type RevisionAsset = { sha?: string; text?: string; name: string };
export type RevisionContent = {
  key: string;
  label: string;
  before?: RevisionAsset;
  after?: RevisionAsset;
};
export function changedContents(change: DocumentChange): RevisionContent[] {
  const a = record(change.before),
    b = record(change.after);
  const pairs = [
    ['sha256', '파일 내용', String(b?.name || a?.name || 'source.txt')],
    ['input_sha', '테스트 입력', 'input.in'],
    ['answer_sha', '기대 출력', 'answer.out'],
    ['output_sha', '실제 출력', 'output.out'],
    ['statement_input', '지문 표시용 입력', 'statement.in'],
    ['statement_output', '지문 표시용 출력', 'statement.out'],
  ];
  const statement = /^statements\/[^/]+$/.test(change.key);
  if (statement)
    pairs.push(
      ...Object.entries(statementFields).map(([key, label]) => [
        key,
        label,
        `${key}.txt`,
      ]),
    );
  return pairs.flatMap(([key, label, name]) => {
    const oldValue = a?.[key],
      newValue = b?.[key];
    if (statement && !oldValue && !newValue) return [];
    if (oldValue === newValue || (oldValue == null && newValue == null))
      return [];
    const asset = (value: unknown): RevisionAsset | undefined =>
      typeof value !== 'string'
        ? undefined
        : statement || key.startsWith('statement_')
          ? { text: value, name }
          : value
            ? { sha: value, name }
            : undefined;
    return [{ key, label, before: asset(oldValue), after: asset(newValue) }];
  });
}
export function describeChange(change: DocumentChange) {
  const contents = changedContents(change).map((item) =>
    item.label === '파일 내용' ? '내용' : item.label,
  );
  const fields = changedFields(change).map((item) => item.label);
  const names = [...contents, ...fields];
  if (names.length)
    return `${names.slice(0, 3).join(' · ')}${names.length > 3 ? ` 외 ${names.length - 3}개` : ''} ${changeLabels[change.kind]}`;
  if (
    categoryOf(change) === '설정' &&
    !record(change.before) &&
    !record(change.after)
  )
    return [change.before, change.after]
      .map((value) => {
        const text = displayValue(value).replace(/\s+/g, ' ');
        return text.length > 40 ? `${text.slice(0, 40)}…` : text;
      })
      .join(' → ');
  return `${change.group} ${changeLabels[change.kind]}`;
}

export function revisionChanges(
  before: ProblemDocument | null,
  after: ProblemDocument,
) {
  const baseline =
    before ||
    ({
      info: {},
      statements: {},
      files: {},
      solutions: {},
      testsets: {},
      validator_tests: {},
      checker_tests: {},
      materials: {},
    } as ProblemDocument);
  return documentChanges(baseline, after).flatMap((change) => {
    // New/removed sets still expose each individual test instead of one huge JSON object.
    if (!/^testsets\/[^/]+$/.test(change.key)) return [change];
    const a = record(change.before),
      b = record(change.after);
    const rows: DocumentChange[] = [
      {
        ...change,
        group: '테스트 설정',
        before: a ? { exists: '등록됨' } : undefined,
        after: b ? { exists: '등록됨' } : undefined,
      },
    ];
    for (const key of ['script', 'groups', 'groups_enabled']) {
      if (JSON.stringify(a?.[key]) === JSON.stringify(b?.[key])) continue;
      rows.push({
        ...change,
        key: `${change.key}/${key}`,
        group: '테스트 설정',
        label: `${change.label} · ${fieldLabels[key]}`,
        before: a?.[key],
        after: b?.[key],
      });
    }
    const tests = record(b?.tests) || record(a?.tests) || {};
    for (const test of Object.values(tests).sort(
      (x, y) => Number(record(x)?.index) - Number(record(y)?.index),
    )) {
      const index = record(test)?.index;
      rows.push({
        ...change,
        key: `${change.key}/${index}`,
        label: `${change.key.split('/')[1]} #${index}`,
        before: a ? test : undefined,
        after: b ? test : undefined,
      });
    }
    return rows;
  });
}
