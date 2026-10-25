const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const modules = new Map();
function source(relative) {
  const file = path.resolve(__dirname, '../src/lib', relative);
  if (modules.has(file)) return modules.get(file).exports;
  const loaded = new Module(file, module);
  loaded.filename = file;
  loaded.paths = Module._nodeModulePaths(path.dirname(file));
  const native = loaded.require.bind(loaded);
  loaded.require = (id) =>
    id.startsWith('.') ? source(id + '.ts') : native(id);
  modules.set(file, loaded);
  loaded._compile(
    ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    file,
  );
  return loaded.exports;
}
const { executionTitle, executionPresentation } = source('executionTitles.ts');
const { jobCategory } = source('executionCategories.ts');
function job(kind, options = {}, result = {}) {
  return { kind, options, result, revision: 5 };
}

test('selected and all solutions retain the requested counts instead of partial outcomes', () => {
  const selected = job('verify', {
    solutions: ['slow.py', 'main.cpp', 'slow.py'],
    testset: 'large',
    test_indices: [3, 1, 2, 8, 7],
  });
  const before = global.structuredClone(selected);
  assert.equal(
    executionTitle(selected),
    '선택 풀이 2개 검증 · large 세트 · 선택 테스트 5개',
  );
  assert.equal(
    executionPresentation(selected).detail,
    '풀이: slow.py, main.cpp · 테스트: #1–3, #7–8',
  );
  assert.deepEqual(selected, before);
  selected.result.solutions = [{ name: 'main.cpp', cases: [] }];
  assert.equal(executionTitle(selected), executionTitle(before));
  const all = job('verify', {
    solutions: [],
    test_indices: [],
    testsets: ['tests', 'samples'],
    scope: {
      solutions: ['a.cpp', 'b.py', 'c.kt'],
      test_count: 20,
      all_testsets: true,
    },
  });
  assert.equal(
    executionTitle(all),
    '전체 풀이 검증 · 대상 3개 · 모든 세트 2개 · 전체 테스트 20개',
  );
});

test('one chosen test and arbitrary set subsets stay visible in the title', () => {
  assert.equal(
    executionTitle(
      job('verify', {
        solutions: ['main.cpp'],
        testsets: ['tiny', 'huge'],
        test_indices: [7],
      }),
    ),
    '선택 풀이 1개 검증 · 선택 세트 2개 · 테스트 #7',
  );
  assert.match(
    executionPresentation(job('verify', { testsets: ['tiny', 'huge'] })).detail,
    /세트: tiny, huge/,
  );
});

test('temporary code titles count only requested temporary solutions and distinguish mixed/all scope', () => {
  const temporary_solutions = [{ name: 'trial.cpp' }, { name: 'unused.py' }];
  assert.match(
    executionTitle(
      job('verify', { solutions: ['trial.cpp'], temporary_solutions }),
    ),
    /^임시 코드 1개 검증/,
  );
  assert.match(
    executionTitle(
      job('verify', {
        solutions: ['trial.cpp', 'main.cpp'],
        temporary_solutions,
      }),
    ),
    /^임시 코드 포함 풀이 2개 검증/,
  );
  assert.match(
    executionTitle(job('verify', { solutions: [], temporary_solutions })),
    /^임시 코드 포함 전체 풀이 검증/,
  );
  assert.equal(
    executionTitle(
      job('verify', { solutions: ['main.cpp'], temporary_solutions }),
    ),
    '선택 풀이 1개 검증',
  );
});

for (const [options, expected] of [
  [
    {
      prepare_mode: 'full',
      testset: 'tests',
      test_indices: [],
      auto_apply: true,
    },
    '입력·정답 생성 · tests 세트 · 전체 테스트 · 자동 반영 요청',
  ],
  [
    {
      prepare_mode: 'inputs',
      check_only: true,
      testset: 'tests',
      test_indices: [],
    },
    '입력 검사 · tests 세트 · 전체 테스트',
  ],
  [
    { prepare_mode: 'inputs', testset: 'tests', test_indices: [] },
    '입력 검사 · tests 세트 · 전체 테스트',
  ],
  [
    { prepare_mode: 'inputs', testset: 'tests', test_indices: [2, 3] },
    '입력 재생성 · tests 세트 · 선택 테스트 2개',
  ],
  [
    {
      prepare_mode: 'inputs',
      check_only: false,
      all_testsets: true,
      test_indices: [],
    },
    '입력 생성 · 모든 세트 · 전체 테스트',
  ],
  [
    { prepare_mode: 'validate', testset: 'tests', test_indices: [1] },
    '저장 입력 검사 · tests 세트 · 테스트 #1',
  ],
  [
    { prepare_mode: 'answers', testsets: ['a', 'b'], test_indices: [] },
    '정답 생성 · 선택 세트 2개 · 전체 테스트',
  ],
])
  test(`preparation title differentiates intent: ${expected}`, () => {
    assert.equal(executionTitle(job('prepare', options)), expected);
  });

test('legacy list categories and full detail results produce the same input-check title', () => {
  const row = job('prepare', { testset: 'tests' });
  row.category = 'prepare-inputs';
  assert.equal(executionTitle(row), '입력 검사 · tests 세트');
  assert.equal(
    executionTitle({
      ...row,
      result: { prepare_mode: 'inputs', testsets: { tests: [{ index: 1 }] } },
    }),
    executionTitle(row),
  );
  assert.equal(jobCategory(row).id, 'prepare-inputs');
});

test('unknown historical scope never claims all or invents counts from partial results', () => {
  assert.equal(
    executionTitle(job('verify', {}, { solutions: [{ name: 'first.cpp' }] })),
    '풀이 검증',
  );
  assert.equal(
    executionTitle(job('verify', { scope: { solutions: ['saved.py'] } })),
    '풀이 1개 검증',
  );
  assert.doesNotMatch(
    executionTitle(job('verify', { test_indices: ['bad', 0] })),
    /전체 테스트/,
  );
});

test('request context survives empty list results, failures and preparation-policy changes', () => {
  const row = job('verify', {
    solutions: ['old.cpp'],
    testset: 'saved',
    test_indices: [1],
    force_prepare: true,
    snapshot: 'committed',
  });
  const light = executionPresentation(row);
  assert.match(light.title, /준비 새로 실행/);
  assert.match(light.detail, /old.cpp.*커밋 r5 기준/);
  assert.deepEqual(
    executionPresentation({
      ...row,
      status: 'failed',
      result: {
        scope: { solutions: ['new.py'], test_count: 99 },
        solutions: [],
      },
    }),
    light,
  );
});

for (const [options, expected] of [
  [
    { export_format: 'zoj', verify: false, testsets: ['tests'] },
    'ZOJ 패키지 생성 · 검증 없이 · tests 세트',
  ],
  [
    { export_format: 'zoj', verify: true, testsets: ['tests', 'samples'] },
    'ZOJ 패키지 생성 · 검증 포함 · 선택 세트 2개',
  ],
  [
    { export_format: 'editor', verify: false, testset: 'tests' },
    'Editor 패키지 생성 · 검증 없이 · 모든 세트',
  ],
  [
    { export_format: 'linux', verify: true },
    'Linux 패키지 생성 · 검증 포함 · 모든 세트',
  ],
  [{ package_type: 'sources' }, '소스 패키지 생성 · 모든 세트'],
])
  test(`package title differentiates format, judging and effective scope: ${expected}`, () => {
    assert.equal(executionTitle(job('package', options)), expected);
  });

test('stress title exposes comparison count, stopping mode, limits and minimization from saved configuration', () => {
  const row = job('stress', {
    stress_configuration: {
      reference: 'main.cpp',
      candidates: [{ name: 'wa.py' }, { name: 'tle.kt' }],
      stop_mode: 'target',
      counterexample_limit: 5,
      iterations: 500,
      duration_seconds: 30,
      seed_start: 0,
      seed_step: 2,
      testset: 'stress',
      minimize: true,
      focus_uncovered: true,
      patterns: [{}, {}],
    },
  });
  assert.equal(
    executionTitle(row),
    '스트레스 테스트 · 비교 풀이 2개 · 반례 최대 5개 · stress 세트 · 반례 축소',
  );
  assert.match(
    executionPresentation(row).detail,
    /기준: main.cpp.*비교: wa.py, tle.kt.*패턴 2개.*최대 500회.*최대 30초.*시작 시드 0.*시드 간격 2.*미발견 풀이 우선/,
  );
  const prior = executionPresentation(row);
  row.result.stress_configuration = { candidates: [{ name: 'different.py' }] };
  assert.deepEqual(executionPresentation(row), prior);
  assert.match(
    executionTitle(
      job('stress', { candidate: 'old.cpp', stop_on_first: true }),
    ),
    /비교 풀이 1개 · 첫 반례 탐색/,
  );
  assert.match(
    executionTitle(
      job('stress', { candidates: ['a.py'], stop_mode: 'all_candidates' }),
    ),
    /모든 비교 풀이 반례/,
  );
});

test('component self-tests and document generation cannot be confused with input checks', () => {
  assert.equal(
    executionTitle(job('validator-tests')),
    'Validator 자체 테스트 · 전체 검사',
  );
  assert.equal(
    executionTitle(job('checker-tests')),
    'Checker 자체 테스트 · 전체 검사',
  );
  // Render generates every statement, not only the default statement_language option.
  assert.equal(
    executionTitle(job('render', { statement_language: 'korean' })),
    '지문 HTML·PDF 생성',
  );
});
