const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'),
  path = require('node:path'),
  Module = require('node:module'),
  ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<body></body>', { pretendToBeVisual: true });
global.window = dom.window;
global.document = dom.window.document;
global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react'),
  { act } = React,
  { createRoot } = require('react-dom/client');
window.HTMLDialogElement.prototype.showModal = function () {
  this.open = true;
};
window.HTMLDialogElement.prototype.close = function () {
  this.open = false;
};
let context,
  uploads = [],
  blobs = [],
  previewOverride = null;
const router = {
  useSearchParams: () => React.useState(() => new window.URLSearchParams()),
  Link: ({ children, to, ...props }) =>
    React.createElement('a', { href: to, ...props }, children),
};
const cache = new Map();
function source(relative) {
  const file = path.resolve(__dirname, '../src', relative);
  if (cache.has(file)) return cache.get(file).exports;
  const loaded = new Module(file, module);
  loaded.filename = file;
  loaded.paths = Module._nodeModulePaths(path.dirname(file));
  const native = loaded.require.bind(loaded);
  loaded.require = (id) => {
    if (id === 'react-router-dom') return router;
    if (id.endsWith('/workspace')) return { useWorkspace: () => context };
    if (id.endsWith('/api'))
      return {
        ...source('lib/api.ts'),
        upload: async (...args) => {
          uploads.push(args);
          return { sha256: 'new', size: 20 };
        },
        blobPreview: async (problem, sha, signal) => {
          blobs.push(sha);
          if (typeof previewOverride === 'function')
            return previewOverride(problem, sha, signal);
          if (previewOverride) return previewOverride;
          return {
            text:
              sha === 'old' ? 'int x = 1;\nreturn x;' : 'int x = 2;\nreturn x;',
            truncated: false,
            binary: false,
          };
        },
      };
    if (id.startsWith('.'))
      return source(
        path.relative(
          path.resolve(__dirname, '../src'),
          ['.ts', '.tsx']
            .map((ext) => path.resolve(path.dirname(file), id + ext))
            .find((f) => fs.existsSync(f)),
        ),
      );
    return native(id);
  };
  cache.set(file, loaded);
  loaded._compile(
    ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText,
    file,
  );
  return loaded.exports;
}
const { sourceRoles, reuseAsSolution, solutionReuseIssue } =
  source('lib/sourceRoles.ts');
const { documentChanges, diffLines } = source('lib/documentChanges.ts');
const { preparationCautions } = source('lib/readiness.ts');
const { loopScript } = source('lib/generationScript.ts');
const { bulkTests } = source('lib/bulkTests.ts');
const {
  effectiveStatement,
  translationCanonical,
  statementCanonical,
  translationHash,
} = source('lib/sharedStatements.ts');

test('shared statement hashes match the server and keep original language fields separate', async () => {
  const korean = {
    name: '공유',
    legend: '정수 $N$',
    input: '',
    output: '',
    scoring: '',
    interaction: '',
    notes: '',
    tutorial: '',
    show_in_review: true,
  };
  const doc = {
    statements: { korean, english: { ...korean, name: 'Shared', legend: 'N' } },
    common_statement: '공통 $N$',
    common_tutorial: 'SECRET_COMMON',
    translation_source: 'korean',
  };
  assert.equal(
    await translationHash(translationCanonical(doc)),
    'ffdb9a14348e743a44a1ad73170944afd369784d2b0f3ab325857abb829a501c',
  );
  assert.equal(
    await translationHash(statementCanonical(doc, 'english')),
    '1027d4b5e644e683f43916316918f4760d62b6ea30f7d096d56a56c3dd552630',
  );
  assert.equal(effectiveStatement(doc, 'english').legend, '공통 $N$\n\nN');
  assert.equal(effectiveStatement(doc, 'english').tutorial, 'SECRET_COMMON');
  assert.equal(doc.statements.english.tutorial, '');
});

test('bulk operations preserve originals and validate a whole move before applying it', () => {
  const doc = workspace();
  doc.info.skip_duplicate_validation = false;
  doc.testsets.tests.script = '';
  doc.testsets.tests.groups_enabled = true;
  doc.testsets.tests.groups = { small: {} };
  doc.testsets.target = {
    script: '',
    tests: {},
    groups_enabled: true,
    groups: { large: {} },
  };
  const source = Object.values(doc.testsets.tests.tests)[0];
  source.group = 'small';
  source.description = 'original';
  source.sample = true;
  source.statement_output = 'custom';
  const moved = bulkTests(doc, 'tests', [source.index], 'move', {
    target: 'target',
    group: 'large',
    limit: 1000,
  });
  assert.equal(Object.keys(moved.testsets.tests.tests).length, 0);
  assert.equal(
    Object.values(moved.testsets.target.tests)[0].statement_output,
    'custom',
  );
  assert.equal(Object.values(moved.testsets.target.tests)[0].group, 'large');
  assert.equal(Object.values(doc.testsets.tests.tests)[0].group, 'small');
  assert.throws(
    () =>
      bulkTests(doc, 'tests', [source.index], 'copy', {
        target: 'target',
        group: 'missing',
      }),
    /그룹/,
  );
  assert.equal(Object.keys(doc.testsets.target.tests).length, 0);
  const changed = bulkTests(doc, 'tests', [source.index], 'sample-off');
  assert.equal(Object.values(changed.testsets.tests.tests)[0].sample, false);
  assert.equal(source.sample, true);
});

test('bulk copies reject capacity overflow and live scripts without partially changing a set', () => {
  const doc = workspace();
  doc.testsets.tests.script = '';
  doc.testsets.target = {
    script: '',
    tests: { one: { index: 1, input_sha: 'different' } },
    groups: {},
    groups_enabled: false,
  };
  const index = Object.values(doc.testsets.tests.tests)[0].index;
  assert.throws(
    () =>
      bulkTests(doc, 'tests', [index], 'copy', {
        target: 'target',
        group: '',
        limit: 1,
      }),
    /한도/,
  );
  assert.equal(Object.keys(doc.testsets.target.tests).length, 1);
  doc.testsets.tests.script = 'gen 1 > $';
  assert.throws(() => bulkTests(doc, 'tests', [index], 'delete'), /생성 결과/);
});

test('loop builder emits bounded declarative groups without executing commands', () => {
  assert.equal(
    loopScript('gen 10 {seed}', 1, 3, 1, 'small'),
    'repeat seed in 1..3\n  group small\n  gen 10 {seed} > $\nend',
  );
  assert.match(loopScript('gen {seed}', 5, 1, -2, ''), /5\.\.1 step -2/);
  assert.throws(() => loopScript('gen 1', 1, 3, 1, ''), /seed/);
  assert.throws(() => loopScript('gen {seed}', 3, 1, 1, ''), /방향/);
  assert.throws(() => loopScript('gen {seed}', 1, 3, 0, ''), /방향/);
});

test('resource policy offers supported language scoping without claiming runtime attachment', async () => {
  let changed;
  const policy = {
    languages: ['cpp17', 'cpp20'],
    targets: ['SOLUTION'],
    stages: ['COMPILE'],
  };
  const { host, close } = await mount(
    source('pages/workspace/ResourceOptions.tsx').default,
    {
      policy,
      disabled: false,
      change: (value) => {
        changed = value;
      },
    },
  );
  const cpp20 = [...host.querySelectorAll('label')]
    .find((label) => label.textContent.trim() === 'C++20')
    .querySelector('input');
  await act(async () => cpp20.click());
  assert.deepEqual(changed, {
    languages: ['cpp17'],
    targets: ['SOLUTION'],
    stages: ['COMPILE'],
  });
  assert.match(
    host.textContent,
    /실행 시 원본 리소스 파일은 제공하지 않습니다/,
  );
  await close();
});

test('matrix preserves missing measurements and filters an observed cover without deleting tests', async () => {
  const row = (index, detected) => ({
    id: `tests/${index}`,
    testset: 'tests',
    index,
    group: '',
    detected,
    missing_targets: [],
    skipped: [],
    same_pattern_as: [],
    same_pattern_count: 0,
    exclusive_detections: [],
    no_detection: !detected.length,
  });
  const job = {
    result: {
      test_matrix: {
        solutions: ['main', 'wrong'],
        targets: ['wrong'],
        uncovered_solutions: [],
        unassigned_errors: [],
        cover: { test_ids: ['tests/2'], method: 'exact', covered_solutions: 1 },
        rows: [row(1, []), row(2, ['wrong'])],
      },
      solutions: [
        {
          name: 'main',
          cases: [
            {
              testset: 'tests',
              index: 1,
              verdict: 'AC',
              cpu_ms: null,
              memory_kb: null,
            },
          ],
        },
        {
          name: 'wrong',
          cases: [
            {
              testset: 'tests',
              index: 2,
              verdict: 'WA',
              cpu_ms: 12,
              memory_kb: 64,
            },
          ],
        },
      ],
    },
  };
  const { host, close } = await mount(
    source('pages/workspace/TestVerdictMatrix.tsx').default,
    { job },
  );
  await act(async () => host.querySelector('.matrix-summary').click());
  assert.match(host.textContent, /미실행/);
  const select = host.querySelector('select');
  await act(async () => {
    select.value = 'cpu';
    select.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
  assert.match(host.textContent, /12ms/);
  assert.match(host.textContent, /—/);
  await act(async () => host.querySelector('input[type=checkbox]').click());
  assert.equal(host.querySelectorAll('tbody tr').length, 1);
  assert.equal(job.result.test_matrix.rows.length, 2);
  await close();
});
const file = (name, extra = {}) => ({
  name,
  kind: 'source',
  language: 'cpp17',
  sha256: 'old',
  size: 30,
  ...extra,
});
function fixture() {
  return {
    info: { name: '합', tags: [], points_enabled: false, interactive: false },
    statements: {
      korean: {
        legend: '두 수의 합',
        name: '합',
        input: '',
        output: '',
        notes: '',
        tutorial: '',
      },
    },
    files: {
      'main.cpp': file('main.cpp'),
      'validator.cpp': file('validator.cpp'),
      'gen.cpp': file('gen.cpp', { roles: ['generator'] }),
    },
    solutions: {},
    checker: 'std::wcmp',
    validator: 'validator.cpp',
    interactor: '',
    extra_validators: [],
    testsets: {
      tests: {
        script: '',
        tests: {
          one: {
            index: 1,
            input_sha: 'input',
            answer_sha: null,
            sample: true,
            command: '',
          },
        },
      },
    },
    validator_tests: {},
    checker_tests: {},
    materials: { public: { files: ['main.cpp'], solutions: [], testsets: [] } },
  };
}
function workspace() {
  let doc = fixture();
  context = {
    data: {
      problem: { id: 'fixture', role: 'WRITE', note: '', modified: false },
      cautions: [],
      version: 0,
    },
    get document() {
      return doc;
    },
    editable: true,
    mutate: (fn) => {
      fn(doc);
    },
    notify: () => {},
    run: async () => {},
  };
  return doc;
}
async function mount(Component, props = {}) {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(React.createElement(Component, props)));
  return {
    host,
    close: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}
test('Reusing a file preserves its contents, Main uniqueness and publication links', () => {
  const doc = fixture();
  doc.solutions['previous.cpp'] = {
    ...file('previous.cpp'),
    tag: 'MA',
    extra_tags: {},
  };
  reuseAsSolution(doc, 'main.cpp', 'MA');
  assert.equal(doc.files['main.cpp'], undefined);
  assert.equal(doc.solutions['main.cpp'].sha256, 'old');
  assert.equal(doc.solutions['previous.cpp'].tag, 'OK');
  assert.deepEqual(doc.materials.public.files, []);
  assert.deepEqual(doc.materials.public.solutions, ['main.cpp']);
  assert.match(solutionReuseIssue(doc, 'validator.cpp'), /Validator/);
  assert.match(solutionReuseIssue(doc, 'gen.cpp'), /Generator/);
});
test('Legacy linked programs stay visible while unrelated sources do not gain roles', () => {
  const doc = fixture();
  assert.deepEqual(sourceRoles(doc, 'validator.cpp'), ['validator']);
  assert.deepEqual(sourceRoles(doc, 'main.cpp'), []);
  delete doc.files['gen.cpp'].roles;
  doc.testsets.tests.script = 'gen 100 42 > $';
  assert.deepEqual(sourceRoles(doc, 'gen.cpp'), ['generator']);
});
test('The existing-file picker creates a Main solution without uploading a second blob', async () => {
  uploads = [];
  const doc = workspace();
  const { host, close } = await mount(
    source('pages/workspace/Files.tsx').default,
    { solutions: true },
  );
  await act(async () =>
    [...host.querySelectorAll('button')]
      .find((b) => b.textContent.includes('기존 파일에서 선택'))
      .click(),
  );
  assert.equal(host.querySelector('dialog select').value, '');
  await act(async () => {
    const select = host.querySelector('dialog select');
    select.value = 'main.cpp';
    select.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
  assert.equal(host.querySelectorAll('dialog select')[1].value, 'MA');
  await act(async () =>
    [...host.querySelectorAll('dialog button')]
      .find((b) => b.textContent === '풀이로 지정')
      .click(),
  );
  assert.equal(doc.solutions['main.cpp'].tag, 'MA');
  assert.deepEqual(uploads, []);
  await close();
});
test('Validator selection omits unrelated and generator sources', async () => {
  workspace();
  const { host, close } = await mount(
    source('pages/workspace/ComponentTests.tsx').default,
    { kind: 'validator' },
  );
  assert.deepEqual(
    [...host.querySelectorAll('select option')].map((o) => o.value),
    ['', 'validator.cpp'],
  );
  await close();
});

test('Read-only users can select code for download while editing stays disabled', async () => {
  workspace();
  context.editable = false;
  context.data.problem.role = 'READ';
  const { host, close } = await mount(
    source('pages/workspace/Files.tsx').default,
  );
  const selection = host.querySelector('[aria-label="표시된 파일 전체 선택"]');
  assert.equal(selection.disabled, false);
  await act(async () => selection.click());
  assert.match(
    host.querySelector('.download-toolbar').textContent,
    /선택 다운로드 \(3개\)/,
  );
  assert.ok(
    [...host.querySelectorAll('[aria-label$="제거"]')].every(
      (button) => button.disabled,
    ),
  );
  assert.equal(host.querySelectorAll('a[download]').length, 3);
  await close();
});

test('Read-only users can select tests and download available files without changing samples', async () => {
  const doc = workspace();
  doc.testsets.tests.groups_enabled = false;
  doc.testsets.tests.groups = {};
  context.editable = false;
  context.data.problem.role = 'READ';
  const { host, close } = await mount(
    source('pages/workspace/Tests.tsx').default,
  );
  const selection = host.querySelector(
    '[aria-label="현재 페이지 테스트 전체 선택"]',
  );
  assert.equal(selection.disabled, false);
  await act(async () => selection.click());
  assert.match(
    host.querySelector('.download-toolbar').textContent,
    /선택 다운로드 \(1개 테스트\)/,
  );
  const input = host.querySelector('.test-download-actions a');
  assert.equal(input.getAttribute('download'), '0001.in');
  assert.equal(input.getAttribute('href'), '/api/problems/fixture/blobs/input');
  assert.ok(host.querySelector('.test-download-actions button').disabled);
  assert.ok(host.querySelector('[aria-label="테스트 1 제거"]').disabled);
  assert.equal(Object.values(doc.testsets.tests.tests)[0].sample, true);
  await close();
});

test('File selection is limited to the current page and survives page changes', async () => {
  const doc = workspace();
  doc.files = Object.fromEntries(
    Array.from({ length: 25 }, (_, index) => [
      `file-${index}.cpp`,
      file(`file-${index}.cpp`),
    ]),
  );
  const { host, close } = await mount(
    source('pages/workspace/Files.tsx').default,
  );
  assert.equal(host.querySelectorAll('tbody tr').length, 20);
  await act(async () =>
    host.querySelector('[aria-label="표시된 파일 전체 선택"]').click(),
  );
  assert.match(
    host.querySelector('.download-toolbar').textContent,
    /선택 다운로드 \(20개\)/,
  );
  await act(async () =>
    host.querySelector('[aria-label="파일 목록 다음 페이지"]').click(),
  );
  assert.equal(host.querySelectorAll('tbody tr').length, 5);
  assert.equal(
    host.querySelector('[aria-label="표시된 파일 전체 선택"]').checked,
    false,
  );
  await act(async () =>
    host.querySelector('[aria-label="표시된 파일 전체 선택"]').click(),
  );
  assert.match(
    host.querySelector('.download-toolbar').textContent,
    /선택 다운로드 \(25개\)/,
  );
  await act(async () =>
    host.querySelector('[aria-label="표시된 파일 전체 선택"]').click(),
  );
  assert.match(
    host.querySelector('.download-toolbar').textContent,
    /선택 다운로드 \(20개\)/,
  );
  await close();
});
test('Preparation recommendations do not count as missing required data', () => {
  const doc = fixture();
  reuseAsSolution(doc, 'main.cpp', 'MA');
  const rows = preparationCautions(doc);
  assert.equal(rows.filter((r) => r.blocking).length, 0);
  assert.deepEqual(
    rows.map((r) => r.code),
    ['NO_VALIDATOR_TESTS', 'NO_WRONG_SOLUTIONS'],
  );
});
test('Commit differences omit unchanged settings and peer changes', () => {
  const before = fixture(),
    after = JSON.parse(JSON.stringify(before));
  after.statements.korean.legend = '새 지문';
  after.testsets.tests.tests.two = { index: 2, input_sha: 'input2' };
  // Object ordering is not a content change.
  after.files['main.cpp'] = {
    size: 30,
    sha256: 'old',
    language: 'cpp17',
    kind: 'source',
    name: 'main.cpp',
  };
  assert.deepEqual(
    documentChanges(before, after).map((r) => [r.label, r.kind]),
    [
      ['korean · 지문', 'changed'],
      ['tests #2', 'added'],
    ],
  );
});
test('Line differences reconstruct both originals and revised text', () => {
  for (const [a, b] of [
    ['one\ntwo\nthree', 'one\nnew\nthree'],
    ['', 'new'],
    ['old', ''],
    ['same', 'same'],
  ]) {
    const rows = diffLines(a, b);
    assert.equal(
      rows
        .filter((r) => r.kind !== 'add')
        .map((r) => r.text)
        .join('\n'),
      a,
    );
    assert.equal(
      rows
        .filter((r) => r.kind !== 'remove')
        .map((r) => r.text)
        .join('\n'),
      b,
    );
  }
});

test('Promoting an unchanged source is a role change rather than code deletion', () => {
  const before = fixture(),
    after = JSON.parse(JSON.stringify(before));
  reuseAsSolution(after, 'main.cpp', 'MA');
  const rows = documentChanges(before, after).filter((r) =>
    r.label.includes('main.cpp'),
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].group, '파일 역할');
  assert.equal(rows[0].kind, 'changed');
  assert.equal(rows[0].source, undefined);
});
test('Commit preview loads code only when expanded and renders changed lines', async () => {
  blobs = [];
  const before = fixture(),
    after = JSON.parse(JSON.stringify(before));
  after.files['main.cpp'].sha256 = 'new';
  const { host, close } = await mount(
    source('components/CommitChanges.tsx').default,
    { problemId: 'fixture', before, after },
  );
  assert.deepEqual(blobs, []);
  await act(async () => {
    const details = host.querySelector('details');
    details.open = true;
    details.dispatchEvent(new window.Event('toggle'));
  });
  assert.deepEqual(blobs, ['old', 'new']);
  assert.match(
    host.querySelector('.diff-line.remove').textContent,
    /int x = 1/,
  );
  assert.match(host.querySelector('.diff-line.add').textContent, /int x = 2/);
  await close();
});
after(() => dom.window.close());

test('solution scopes keep testset defaults separate from group overrides', async () => {
  const doc = workspace();
  doc.testsets.tests.groups_enabled = true;
  doc.testsets.tests.groups = { small: {}, large: {} };
  let saved;
  const { host, close } = await mount(
    source('pages/workspace/SolutionExpectations.tsx').default,
    {
      source: { tag: 'TL', extra_tags: {}, group_tags: {} },
      document: doc,
      disabled: false,
      change: (extra, groups) => {
        saved = { extra, groups };
      },
    },
  );
  const scope = host.querySelector(
    '[aria-label="tests / small 그룹 기대 판정"]',
  );
  await act(async () => {
    scope.value = 'OK';
    scope.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
  assert.deepEqual(saved, { extra: {}, groups: { tests: { small: 'OK' } } });
  const set = host.querySelector('[aria-label="tests 세트 기대 판정"]');
  await act(async () => {
    set.value = 'TL';
    set.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
  assert.deepEqual(saved, { extra: { tests: 'TL' }, groups: {} });
  assert.equal(
    [...scope.options].some((option) => option.value === 'MA'),
    false,
  );
  await close();
});

test('review report filters evidence without claiming unsaved edits were checked', async () => {
  const { ReviewReportView } = source('pages/workspace/ReviewReport.tsx');
  const target = document.createElement('div');
  document.body.appendChild(target);
  const root = createRoot(target);
  const report = {
    document_hash: 'a'.repeat(64),
    generated_at: 1000,
    categories: { tests: '테스트 구조', solutions: '풀이 검증' },
    counts: { warning: 1, recommendation: 1 },
    evidence_jobs: ['evidence'],
    method: '실행 기록 근거',
    items: [
      {
        code: 'DUPLICATE',
        severity: 'recommendation',
        category: 'tests',
        message: '동일 입력',
        section: 'tests',
        evidence: 'SHA-256 일치',
      },
      {
        code: 'WRONG',
        severity: 'warning',
        category: 'solutions',
        message: '기대 판정 불일치',
        section: 'executions',
        evidence: '전체 실행',
        job_id: 'evidence',
      },
    ],
  };
  await act(async () =>
    root.render(
      React.createElement(ReviewReportView, {
        report,
        problemId: 'problem',
        stale: true,
      }),
    ),
  );
  assert.match(target.textContent, /이전 저장 자료 기준/);
  assert.ok(
    target.querySelector('a[href="/problems/problem/executions?job=evidence"]'),
  );
  const select = target.querySelector('select');
  await act(async () => {
    select.value = 'tests';
    select.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
  assert.match(target.textContent, /동일 입력/);
  assert.doesNotMatch(target.textContent, /기대 판정 불일치/);
  await act(async () => root.unmount());
  target.remove();
});

test('preparation readiness includes scoped wrong tags but excludes globally skipped solutions', () => {
  const doc = fixture();
  reuseAsSolution(doc, 'main.cpp', 'OK');
  doc.solutions['main.cpp'].group_tags = { tests: { small: 'TL' } };
  assert.ok(
    !preparationCautions(doc).some((c) => c.code === 'NO_WRONG_SOLUTIONS'),
  );
  doc.solutions['main.cpp'].tag = 'NR';
  assert.ok(
    preparationCautions(doc).some((c) => c.code === 'NO_WRONG_SOLUTIONS'),
  );
});

test('Language limit controls preserve overrides while toggling correction and following base changes', async () => {
  const Card = source('components/LanguageResourceLimits.tsx').default;
  const { effectiveLimits } = source('lib/languageLimits.ts');
  let saved;
  const original = {
    info: { time_limit_ms: 1000, memory_limit_mb: 256 },
    language_resource_limits: { pypy3: { time_limit_ms: 700 } },
  };
  function Form() {
    const [doc, setDoc] = React.useState(original);
    saved = doc;
    return React.createElement(Card, {
      document: doc,
      onChange: (value) => setDoc({ ...doc, language_resource_limits: value }),
    });
  }
  const { host, close } = await mount(Form);
  assert.equal(host.querySelectorAll('input[type=checkbox]').length, 4);
  const row = [...host.querySelectorAll('.language-limit-row')].find((r) =>
    r.textContent.includes('PyPy'),
  );
  assert.match(row.textContent, /640MiB/);
  await act(async () => row.querySelector('input[type=checkbox]').click());
  assert.deepEqual(saved.language_resource_limits.pypy3, {
    time_limit_ms: 700,
    disable_auto_adjustment: true,
  });
  assert.match(row.textContent, /256MiB/);
  assert.deepEqual(
    effectiveLimits(
      { ...saved, info: { time_limit_ms: 2000, memory_limit_mb: 512 } },
      'pypy3',
    ),
    { time_limit_ms: 700, memory_limit_mb: 512 },
  );
  await act(async () => row.querySelector('input[type=checkbox]').click());
  assert.deepEqual(saved.language_resource_limits.pypy3, {
    time_limit_ms: 700,
  });
  assert.match(row.textContent, /640MiB/);
  await close();
});

test('Read-only language limits expose policy without granting editing or changing a document', async () => {
  const Card = source('components/LanguageResourceLimits.tsx').default;
  const doc = { info: { time_limit_ms: 1000, memory_limit_mb: 256 } };
  const { host, close } = await mount(Card, { document: doc });
  assert.equal(host.querySelector('fieldset').disabled, true);
  assert.match(host.textContent, /기본 설정 편집 권한/);
  assert.deepEqual(doc, {
    info: { time_limit_ms: 1000, memory_limit_mb: 256 },
  });
  await close();
});

test('Large input and answer previews are read-only and metadata saves retain both original blobs', async () => {
  const doc = workspace();
  const original = doc.testsets.tests.tests.one;
  original.answer_sha = 'answer-original';
  uploads = [];
  previewOverride = { text: 'prefix only', truncated: true, binary: false };
  const view = await mount(source('pages/workspace/Tests.tsx').TestEditor, {
    test: original,
    testset: 'tests',
    onClose: () => {},
  });
  try {
    const areas = [...view.host.querySelectorAll('textarea')];
    assert.equal(areas.length, 2);
    assert.ok(areas.every((el) => el.readOnly && el.value === 'prefix only'));
    await act(async () =>
      [...view.host.querySelectorAll('button')]
        .find((b) => b.textContent === '작업 사본에 반영')
        .click(),
    );
    assert.equal(doc.testsets.tests.tests['1'].input_sha, 'input');
    assert.equal(doc.testsets.tests.tests['1'].answer_sha, 'answer-original');
    assert.deepEqual(uploads, []);
  } finally {
    previewOverride = null;
    await view.close();
  }
});

test('Large source metadata saves keep the complete original file and never upload its preview', async () => {
  const doc = workspace();
  doc.files['main.cpp'].size = 100000000;
  uploads = [];
  previewOverride = { text: '// prefix only', truncated: true, binary: false };
  const view = await mount(source('pages/workspace/Files.tsx').FileEditor, {
    asset: doc.files['main.cpp'],
    solutions: false,
    onClose: () => {},
  });
  try {
    assert.equal(view.host.querySelector('textarea').readOnly, true);
    assert.match(view.host.textContent, /원본 파일 다운로드/);
    await act(async () =>
      [...view.host.querySelectorAll('button')]
        .find((b) => b.textContent === '작업 사본에 반영')
        .click(),
    );
    assert.equal(doc.files['main.cpp'].sha256, 'old');
    assert.equal(doc.files['main.cpp'].size, 100000000);
    assert.deepEqual(uploads, []);
  } finally {
    previewOverride = null;
    await view.close();
  }
});

test('Closing a pending test preview aborts both reads instead of continuing to load hidden large files', async () => {
  const doc = workspace();
  doc.testsets.tests.tests.one.answer_sha = 'answer';
  const signals = [];
  previewOverride = (_problem, _sha, signal) => {
    signals.push(signal);
    return new Promise(() => {});
  };
  const view = await mount(source('pages/workspace/Tests.tsx').TestEditor, {
    test: doc.testsets.tests.tests.one,
    testset: 'tests',
    onClose: () => {},
  });
  try {
    assert.equal(signals.length, 2);
    assert.ok(signals.every((signal) => !signal.aborted));
  } finally {
    await view.close();
    previewOverride = null;
  }
  assert.ok(signals.every((signal) => signal.aborted));
});

test('test ordering keeps sparse identities and appends new tests without modifying generation rules', () => {
  const { orderedTests, moveTest } = source('lib/testOrder.ts');
  const set = {
    script: 'repeat seed in 1..3\ngen {seed} > $\nend',
    order: [9, 2, 88],
    tests: Object.fromEntries(
      [2, 5, 9].map((index) => [
        index,
        {
          index,
          input_sha: `in-${index}`,
          answer_sha: `out-${index}`,
          group: 'g',
          sample: index === 2,
        },
      ]),
    ),
  };
  const original = global.structuredClone(set);
  assert.deepEqual(
    orderedTests(set).map((test) => test.index),
    [9, 2, 5],
  );
  assert.deepEqual(moveTest([9, 2, 5], 5, 1), [5, 9, 2]);
  assert.deepEqual(moveTest([9, 2, 5], 9, 3), [2, 5, 9]);
  for (const position of [0, 4, 1.5, NaN])
    assert.throws(() => moveTest([9, 2, 5], 9, position), /정수/);
  assert.deepEqual(set, original);
});

test('bulk renumber follows the chosen execution order and keeps each input and answer paired', () => {
  const doc = fixture();
  doc.testsets.tests.order = [3, 1, 2];
  doc.testsets.tests.tests = Object.fromEntries(
    [1, 2, 3].map((index) => [
      index,
      {
        index,
        input_sha: `in-${index}`,
        answer_sha: `out-${index}`,
        group: 'g',
        sample: index === 2,
      },
    ]),
  );
  const next = bulkTests(doc, 'tests', [1, 2, 3], 'renumber');
  assert.equal(next.testsets.tests.order, undefined);
  assert.deepEqual(
    Object.values(next.testsets.tests.tests).map((test) => [
      test.index,
      test.input_sha,
      test.answer_sha,
    ]),
    [
      [1, 'in-3', 'out-3'],
      [2, 'in-1', 'out-1'],
      [3, 'in-2', 'out-2'],
    ],
  );
  assert.deepEqual(doc.testsets.tests.order, [3, 1, 2]);
  assert.deepEqual(
    bulkTests(doc, 'tests', [1], 'delete').testsets.tests.order,
    [3, 2],
  );
});

test('test order dialog edits locally until applied and provides accessible adjacent moves', async () => {
  const set = {
    tests: {
      1: { index: 1, description: '예제' },
      4: { index: 4, description: '경계값' },
      9: { index: 9, description: '최댓값' },
    },
    order: [4, 1, 9],
  };
  let applied = null;
  const view = await mount(source('pages/workspace/TestOrder.tsx').default, {
    testset: set,
    onApply: (order) => {
      applied = order;
    },
    onClose: () => {},
  });
  const listed = () =>
    [...view.host.querySelectorAll('.test-order-label strong')].map(
      (node) => node.textContent,
    );
  assert.deepEqual(listed(), ['#4', '#1', '#9']);
  assert.equal(
    view.host.querySelector('[aria-label="테스트 4 위로 이동"]').disabled,
    true,
  );
  assert.equal(
    view.host.querySelector('[aria-label="테스트 9 아래로 이동"]').disabled,
    true,
  );
  await act(async () =>
    view.host.querySelector('[aria-label="테스트 1 위로 이동"]').click(),
  );
  assert.deepEqual(listed(), ['#1', '#4', '#9']);
  assert.deepEqual(set.order, [4, 1, 9]);
  assert.equal(applied, null);
  await act(async () =>
    [...view.host.querySelectorAll('button')]
      .find((b) => b.textContent === '작업 사본에 반영')
      .click(),
  );
  assert.deepEqual(applied, [1, 4, 9]);
  await view.close();
});

test('test order dialog supports cross-page position moves and cancel leaves the source unchanged', async () => {
  const set = {
    tests: Object.fromEntries(
      Array.from({ length: 53 }, (_, i) => [
        i + 1,
        { index: i + 1, description: `case ${i + 1}` },
      ]),
    ),
  };
  let cancelled = false;
  const view = await mount(source('pages/workspace/TestOrder.tsx').default, {
    testset: set,
    onApply: () => assert.fail('must not apply'),
    onClose: () => {
      cancelled = true;
    },
  });
  await act(async () =>
    view.host.querySelector('[aria-label="테스트 순서 2페이지"]').click(),
  );
  await act(async () =>
    view.host.querySelector('[aria-label="테스트 51 위로 이동"]').click(),
  );
  assert.equal(view.host.querySelectorAll('.test-order-list li').length, 50);
  assert.equal(
    [...view.host.querySelectorAll('.test-order-label strong')].at(-1)
      .textContent,
    '#51',
  );
  // Choosing #53 fills its current position; move #53 to the first position.
  await act(async () => {
    const select = view.host.querySelector('select');
    select.value = '53';
    select.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
  await act(async () => {
    const input = view.host.querySelector('[aria-label="이동할 위치"]');
    Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    ).set.call(input, '1');
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
  await act(async () =>
    view.host
      .querySelector('form')
      .dispatchEvent(
        new window.Event('submit', { bubbles: true, cancelable: true }),
      ),
  );
  assert.equal(
    view.host.querySelector('.test-order-label strong').textContent,
    '#53',
  );
  await act(async () =>
    [...view.host.querySelectorAll('button')]
      .find((b) => b.textContent === '취소')
      .click(),
  );
  assert.equal(cancelled, true);
  assert.equal(set.order, undefined);
  await view.close();
});

test('workspace exposes the saved order, applies moves without renumbering, and records an order-only diff', async () => {
  const doc = workspace();
  doc.testsets.tests.groups = {};
  doc.testsets.tests.groups_enabled = false;
  const base = global.structuredClone(doc);
  doc.testsets.tests.tests.two = {
    ...doc.testsets.tests.tests.one,
    index: 2,
    input_sha: 'other',
  };
  doc.testsets.tests.order = [2, 1];
  const view = await mount(source('pages/workspace/Tests.tsx').default);
  assert.match(view.host.querySelector('tbody tr').textContent, /#2/);
  await act(async () =>
    [...view.host.querySelectorAll('button')]
      .find((b) => b.textContent.includes('순서 변경'))
      .click(),
  );
  await act(async () =>
    view.host.querySelector('[aria-label="테스트 1 위로 이동"]').click(),
  );
  await act(async () =>
    [...view.host.querySelectorAll('dialog button')]
      .find((b) => b.textContent === '작업 사본에 반영')
      .click(),
  );
  assert.deepEqual(doc.testsets.tests.order, [1, 2]);
  assert.equal(
    doc.testsets.tests.tests.one.input_sha,
    base.testsets.tests.tests.one.input_sha,
  );
  const after = global.structuredClone(base);
  after.testsets.tests.order = [2, 1];
  const rows = documentChanges(base, after);
  assert.equal(rows.length, 1);
  assert.match(rows[0].label, /테스트 실행 순서/);
  await view.close();
});
