import type { ProblemDocument, SourceFile } from './types';

export type DocumentChange = {
  key: string;
  group: string;
  label: string;
  kind: 'added' | 'removed' | 'changed';
  before: unknown;
  after: unknown;
  source?: { before?: SourceFile; after?: SourceFile };
};
const infoNames: Record<string, string> = {
  name: '문제 이름',
  input_file: '입력 파일',
  output_file: '출력 파일',
  time_limit_ms: '시간 제한 (ms)',
  memory_limit_mb: '메모리 제한 (MiB)',
  interactive: '인터랙티브',
  well_formed: '입력 형식 검사',
  skip_duplicate_validation: '중복 테스트 허용',
  points_enabled: '부분 점수',
  checker_percent: 'Checker 백분율 점수',
  tags: '태그',
  description: '내부 설명',
};
const statementNames: Record<string, string> = {
  name: '제목',
  legend: '지문',
  input: '입력 형식',
  output: '출력 형식',
  scoring: '점수',
  interaction: '상호작용',
  notes: '예제 설명',
  tutorial: '해설',
  show_in_review: '미리보기 표시',
};
export const equal = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) || Array.isArray(b))
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((v, i) => equal(v, b[i]))
    );
  const aa = a as Record<string, unknown>,
    bb = b as Record<string, unknown>;
  return (
    Object.keys(aa).length === Object.keys(bb).length &&
    Object.keys(aa).every((k) => Object.hasOwn(bb, k) && equal(aa[k], bb[k]))
  );
};

export function documentChanges(
  before: ProblemDocument,
  after: ProblemDocument,
): DocumentChange[] {
  const rows: DocumentChange[] = [];
  const add = (
    key: string,
    group: string,
    label: string,
    a: unknown,
    b: unknown,
    source?: DocumentChange['source'],
  ) => {
    if (!equal(a, b))
      rows.push({
        key,
        group,
        label,
        before: a,
        after: b,
        source,
        kind:
          a === undefined ? 'added' : b === undefined ? 'removed' : 'changed',
      });
  };
  for (const [key, label] of Object.entries({
    common_statement: '공통 설명',
    common_tutorial: '공통 해설',
    translation_source: '번역 기준 원문',
    translation_reviews: '번역 검토 상태',
  }))
    add(
      key,
      '지문',
      label,
      before[key as keyof ProblemDocument],
      after[key as keyof ProblemDocument],
    );
  add(
    'language_resource_limits',
    '설정',
    '언어별 시간·메모리 제한',
    before.language_resource_limits ?? {},
    after.language_resource_limits ?? {},
  );
  for (const key of Object.keys(infoNames))
    add(
      `info/${key}`,
      '설정',
      infoNames[key],
      before.info[key as keyof typeof before.info],
      after.info[key as keyof typeof after.info],
    );
  for (const lang of new Set([
    ...Object.keys(before.statements),
    ...Object.keys(after.statements),
  ])) {
    const a = before.statements[lang],
      b = after.statements[lang];
    if (!a || !b) add(`statements/${lang}`, '지문', `${lang} 지문`, a, b);
    else
      for (const key of Object.keys(statementNames))
        add(
          `statements/${lang}/${key}`,
          '지문',
          `${lang} · ${statementNames[key]}`,
          a[key as keyof typeof a],
          b[key as keyof typeof b],
        );
  }
  const reassigned = new Set<string>();
  for (const name of new Set([
    ...Object.keys(before.files),
    ...Object.keys(before.solutions),
  ])) {
    const toSolution =
      before.files[name] &&
      !after.files[name] &&
      !before.solutions[name] &&
      after.solutions[name];
    const toFile =
      before.solutions[name] &&
      !after.solutions[name] &&
      !before.files[name] &&
      after.files[name];
    if (!toSolution && !toFile) continue;
    const a = toSolution ? before.files[name] : before.solutions[name];
    const b = toSolution ? after.solutions[name] : after.files[name];
    reassigned.add(name);
    add(
      `role/${name}`,
      '파일 역할',
      `${name} · ${toSolution ? '풀이로 지정' : '파일로 지정'}`,
      { role: toSolution ? '일반 소스' : '풀이', ...a },
      { role: toSolution ? '풀이' : '일반 소스', ...b },
      a.sha256 !== b.sha256 ? { before: a, after: b } : undefined,
    );
  }
  for (const category of ['files', 'solutions'] as const)
    for (const name of new Set([
      ...Object.keys(before[category]),
      ...Object.keys(after[category]),
    ])) {
      if (reassigned.has(name)) continue;
      const a = before[category][name],
        b = after[category][name];
      add(
        `${category}/${name}`,
        category === 'solutions' ? '풀이' : '파일',
        name,
        a,
        b,
        (!a || !b || a.sha256 !== b.sha256) &&
          (a?.kind === 'source' || b?.kind === 'source')
          ? { before: a, after: b }
          : undefined,
      );
    }
  for (const key of [
    'validator',
    'checker',
    'interactor',
    'extra_validators',
  ] as const)
    add(
      key,
      '프로그램 연결',
      key === 'extra_validators' ? '추가 Validator' : key,
      before[key],
      after[key],
    );
  for (const name of new Set([
    ...Object.keys(before.testsets),
    ...Object.keys(after.testsets),
  ])) {
    const a = before.testsets[name],
      b = after.testsets[name];
    if (!a || !b) {
      add(`testsets/${name}`, '테스트', `${name} 테스트 세트`, a, b);
      continue;
    }
    for (const key of ['script', 'groups_enabled', 'groups', 'order'] as const)
      add(
        `testsets/${name}/${key}`,
        '테스트 설정',
        `${name} · ${key === 'order' ? '테스트 실행 순서' : key === 'script' ? '생성 스크립트' : key === 'groups' ? '그룹' : '그룹 사용'}`,
        a[key],
        b[key],
      );
    const aa = Object.fromEntries(
        Object.values(a.tests).map((t) => [t.index, t]),
      ),
      bb = Object.fromEntries(Object.values(b.tests).map((t) => [t.index, t]));
    for (const index of [
      ...new Set([...Object.keys(aa), ...Object.keys(bb)]),
    ].sort((x, y) => Number(x) - Number(y)))
      add(
        `testsets/${name}/${index}`,
        '테스트',
        `${name} #${index}`,
        aa[Number(index)],
        bb[Number(index)],
      );
  }
  for (const category of [
    'validator_tests',
    'checker_tests',
    'materials',
  ] as const)
    for (const key of new Set([
      ...Object.keys(before[category]),
      ...Object.keys(after[category]),
    ]))
      add(
        `${category}/${key}`,
        category === 'materials' ? '공개 자료' : '자체 테스트',
        `${category === 'validator_tests' ? 'Validator' : category === 'checker_tests' ? 'Checker' : '자료'} · ${key}`,
        before[category][key],
        after[category][key],
      );
  return rows;
}

export type DiffLine = {
  kind: 'same' | 'add' | 'remove';
  text: string;
  old?: number;
  next?: number;
};
export function diffLines(before: string, after: string): DiffLine[] {
  const a = before === '' ? [] : before.split('\n'),
    b = after === '' ? [] : after.split('\n');
  let start = 0,
    end = 0;
  while (start < Math.min(a.length, b.length) && a[start] === b[start]) start++;
  while (
    end < Math.min(a.length, b.length) - start &&
    a[a.length - end - 1] === b[b.length - end - 1]
  )
    end++;
  const aa = a.slice(start, a.length - end),
    bb = b.slice(start, b.length - end);
  const rows: DiffLine[] = a
    .slice(0, start)
    .map((text, i) => ({ kind: 'same', text, old: i + 1, next: i + 1 }));
  let x = 0,
    y = 0;
  if (aa.length * bb.length <= 250000) {
    const dp = Array.from(
      { length: aa.length + 1 },
      () => new Uint32Array(bb.length + 1),
    );
    for (let i = aa.length - 1; i >= 0; i--)
      for (let j = bb.length - 1; j >= 0; j--)
        dp[i][j] =
          aa[i] === bb[j]
            ? dp[i + 1][j + 1] + 1
            : Math.max(dp[i + 1][j], dp[i][j + 1]);
    while (x < aa.length || y < bb.length) {
      if (x < aa.length && y < bb.length && aa[x] === bb[y]) {
        rows.push({
          kind: 'same',
          text: aa[x],
          old: start + x + 1,
          next: start + y + 1,
        });
        x++;
        y++;
      } else if (
        x < aa.length &&
        (y === bb.length || dp[x + 1][y] >= dp[x][y + 1])
      ) {
        rows.push({ kind: 'remove', text: aa[x], old: start + x + 1 });
        x++;
      } else {
        rows.push({ kind: 'add', text: bb[y], next: start + y + 1 });
        y++;
      }
    }
  } else {
    aa.forEach((text, i) =>
      rows.push({
        kind: 'remove',
        text,
        old: start + i + 1,
      }),
    );
    bb.forEach((text, i) =>
      rows.push({
        kind: 'add',
        text,
        next: start + i + 1,
      }),
    );
  }
  for (let i = 0; i < end; i++)
    rows.push({
      kind: 'same',
      text: a[a.length - end + i],
      old: a.length - end + i + 1,
      next: b.length - end + i + 1,
    });
  return rows;
}
