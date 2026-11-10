const { test, beforeEach, afterEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<body></body>', { url: 'https://editor.test/' });
global.window = dom.window;
global.document = dom.window.document;
global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const { MemoryRouter } = require('react-router-dom');
const h = React.createElement;
let context, handler, calls, root, host;
const cache = new Map();
function source(relative) {
  const filename = path.resolve(__dirname, '../src', relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const native = loaded.require.bind(loaded);
  loaded.require = (id) => {
    if (id.endsWith('.css')) return {};
    if (id.endsWith('/workspace')) return { useWorkspace: () => context };
    if (id.endsWith('/api'))
      return {
        api: (url, options) => {
          calls.push({ url, options });
          return handler(url, options);
        },
      };
    if (!id.startsWith('.')) return native(id);
    const target = ['.ts', '.tsx']
      .map((ext) => path.resolve(path.dirname(filename), id + ext))
      .find(fs.existsSync);
    assert.ok(target, `Module ${id} exists`);
    return source(path.relative(path.resolve(__dirname, '../src'), target));
  };
  cache.set(filename, loaded);
  loaded._compile(
    ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    filename,
  );
  return loaded.exports;
}
const { default: Report, ReviewReportView } = source(
  'pages/workspace/ReviewReport.tsx',
);
function evidence(
  name,
  low = '1',
  high = '100',
  expression = `${low} ≤ ${name} ≤ ${high}`,
  location = 'korean · input · 2',
) {
  return { name, low, high, expression, location };
}
function row(name, status = 'match') {
  return {
    id: `row-${name}`,
    name,
    status,
    reason_code: status,
    reason: `${name} 비교 근거: ${status}`,
    matching: status === 'match' || status === 'difference' ? 'exact' : null,
    statement: [evidence(name)],
    validator: [
      evidence(name, '1', '100', `inf.readInt(1, 100, "${name}")`, '7'),
    ],
  };
}
function fixture() {
  const rows = [
    row('N'),
    row('M', 'difference'),
    row('A_i', 'partial'),
    row('S', 'statement_only'),
    row('V', 'validator_only'),
    row('K', 'unresolved'),
    row('B', 'ambiguous'),
    row('X'),
  ];
  rows[1].statement[0].high = '200';
  rows[1].statement[0].expression = '1 ≤ M ≤ 200';
  rows[2].statement = [evidence('A_i', '0', null, '0 ≤ A_i ≤ N + K')];
  rows[3].validator = [];
  rows[4].statement = [];
  rows[5].statement = [evidence('K', null, null, '1 ≤ K ≤ N * 2')];
  rows[5].validator = [
    evidence('K', null, null, 'inf.readInt(1, N * 2, "K")', '11'),
  ];
  rows[6].statement.push(
    evidence('B', '1', '200', '1 ≤ B ≤ 200', 'english · input · 3'),
  );
  rows[7].statement = [
    evidence('X', '-9223372036854775808', '9223372036854775807'),
  ];
  rows[7].validator = [
    evidence(
      'X',
      '-9223372036854775808',
      '9223372036854775807',
      'inf.readLong(MIN, MAX, "X")',
      '12',
    ),
  ];
  return {
    document_hash: 'a'.repeat(64),
    generated_at: 1000,
    categories: { constraints: '제한 비교', tests: '테스트 구조' },
    counts: { warning: 1, info: 1, recommendation: 1 },
    evidence_jobs: [],
    method: '저장 자료 비교',
    items: [
      {
        code: 'CONSTRAINT_SCOPE',
        severity: 'info',
        category: 'constraints',
        message: '명시적 정수 범위 3개를 비교했습니다.',
        section: 'validator',
        evidence: '기존 범위 안내',
      },
      {
        code: 'CONSTRAINT_DIFFERENCE',
        severity: 'warning',
        category: 'constraints',
        message: '기존 M 불일치 카드',
        section: 'validator',
        evidence: '옛 근거',
      },
      {
        code: 'DUPLICATE',
        severity: 'recommendation',
        category: 'tests',
        message: '동일 입력 테스트',
        section: 'tests',
        evidence: 'SHA-256 일치',
      },
    ],
    constraint_comparison: {
      version: 1,
      validator: { name: 'val.cpp', language: 'cpp17' },
      counts: {
        compared: 3,
        matched: 2,
        different: 1,
        unresolved: 3,
        statement_only: 1,
        validator_only: 1,
      },
      rows,
      notices: [],
      limitations: [
        '명시된 정수 범위만 비교합니다. 전체 입력 구조와 조건은 직접 확인하세요.',
      ],
    },
  };
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function setContext(id = 'problem', hash = 'a'.repeat(64)) {
  context = {
    data: { problem: { id }, document_hash: hash },
    dirty: false,
    busy: false,
  };
}
beforeEach(() => {
  document.body.innerHTML = '<main></main>';
  host = document.querySelector('main');
  root = createRoot(host);
  setContext();
  calls = [];
  handler = async () => fixture();
});
afterEach(async () => {
  await act(async () => root.unmount());
});
after(() => dom.window.close());
async function mount(report = fixture(), props = {}) {
  await act(async () =>
    root.render(
      h(
        MemoryRouter,
        null,
        h(ReviewReportView, { report, problemId: 'problem', ...props }),
      ),
    ),
  );
}
async function mountLoader() {
  await act(async () => root.render(h(MemoryRouter, null, h(Report))));
}
async function changeCategory(value) {
  const select = host.querySelector('select[aria-label="검수 보고서 분류"]');
  await act(async () => {
    select.value = value;
    select.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
}
async function severity(label) {
  const button = [
    ...host.querySelectorAll('.review-report-counts button'),
  ].find((b) => b.textContent.startsWith(label));
  assert.ok(button);
  await act(async () => button.click());
}
const displayed = () =>
  [...host.querySelectorAll('[data-constraint-status]')].map(
    (e) => e.dataset.constraintStatus,
  );

test('rich comparison names every variable and side, replacing generic scope and duplicate warning cards', async () => {
  await mount();
  assert.equal(host.querySelectorAll('.constraint-row').length, 8);
  assert.match(host.textContent, /1 ≤ N ≤ 100/);
  assert.match(host.textContent, /1 ≤ M ≤ 200/);
  assert.match(host.textContent, /0 ≤ A_i · 상한 미확정/);
  assert.match(host.textContent, /자동 비교 안 됨5개/);
  assert.match(host.textContent, /수동 확인 · 지문만/);
  assert.match(host.textContent, /수동 확인 · Validator만/);
  assert.match(host.textContent, /B 비교 근거: ambiguous/);
  assert.match(host.textContent, /문제 전체의 검증 통과를 뜻하지 않습니다/);
  assert.doesNotMatch(
    host.textContent,
    /명시적 정수 범위 3개를 비교했습니다|기존 M 불일치 카드/,
  );
  assert.ok(host.querySelector('a[href="/problems/problem/statements"]'));
  assert.ok(host.querySelector('a[href="/problems/problem/validator"]'));
  assert.match(host.textContent, /동일 입력 테스트/);
});

test('original source and locations start collapsed and preserve every conflicting translation', async () => {
  await mount();
  const details = [...host.querySelectorAll('.constraint-evidence')];
  assert.ok(details.every((d) => !d.open));
  const n = host.querySelector('.constraint-row');
  n.querySelector('details').open = true;
  assert.match(n.textContent, /한국어 · 입력 · 2행/);
  assert.match(n.textContent, /val\.cpp:7/);
  assert.equal(n.querySelectorAll('pre').length, 2);
  const ambiguous = host.querySelector('[data-constraint-status="ambiguous"]');
  assert.equal(
    ambiguous.querySelectorAll('.constraint-evidence pre').length,
    3,
  );
  assert.match(ambiguous.textContent, /영어 · 입력 · 3행/);
});

test('existing category and severity filters apply to all rich rows without hiding unresolved rows in info', async () => {
  await mount();
  await severity('경고');
  assert.deepEqual(displayed(), ['difference']);
  await severity('확인 범위');
  assert.equal(displayed().length, 7);
  assert.ok(displayed().includes('unresolved'));
  assert.ok(displayed().includes('statement_only'));
  assert.ok(!displayed().includes('difference'));
  await changeCategory('tests');
  assert.equal(host.querySelector('.constraint-comparison'), null);
  assert.match(host.textContent, /선택한 분류에 표시할 항목이 없습니다/);
  await severity('확인 범위');
  assert.match(host.textContent, /동일 입력 테스트/);
  await changeCategory('constraints');
  assert.equal(host.querySelectorAll('.constraint-row').length, 8);
});

test('ten-row pagination includes later manual-only evidence and resets after filtering', async () => {
  const report = fixture();
  report.constraint_comparison.rows = Array.from({ length: 23 }, (_, i) =>
    row(`variable_${i + 1}`, i === 22 ? 'statement_only' : 'match'),
  );
  report.constraint_comparison.rows[22].validator = [];
  report.constraint_comparison.counts = {
    compared: 22,
    matched: 22,
    different: 0,
    unresolved: 0,
    statement_only: 1,
    validator_only: 0,
  };
  await mount(report);
  assert.equal(host.querySelectorAll('.constraint-row').length, 10);
  await act(async () =>
    host.querySelector('[aria-label="제한 비교 3페이지"]').click(),
  );
  assert.equal(host.querySelectorAll('.constraint-row').length, 3);
  assert.match(host.textContent, /variable_23/);
  assert.match(host.textContent, /전체 23개 · 21–23/);
  await severity('확인 범위');
  assert.equal(host.querySelectorAll('.constraint-row').length, 10);
  assert.ok(
    host.querySelector('[aria-label="제한 비교 1페이지"][aria-current="page"]'),
  );
  assert.doesNotMatch(
    host.querySelector('.constraint-rows').textContent,
    /variable_23/,
  );
});

test('missing or unreadable validators retain statement-only ranges with explicit notices and no claim of comparison', async () => {
  const report = fixture();
  const data = report.constraint_comparison;
  data.validator = null;
  data.rows = [row('StatementOnly', 'statement_only')];
  data.rows[0].validator = [];
  data.counts = {
    compared: 0,
    matched: 0,
    different: 0,
    unresolved: 0,
    statement_only: 1,
    validator_only: 0,
  };
  data.notices = [
    {
      code: 'missing_validator',
      message: 'Validator가 선택되지 않아 자동 비교하지 못했습니다.',
    },
  ];
  await mount(report);
  assert.match(host.textContent, /선택된 Validator 없음/);
  assert.match(host.textContent, /범위 비교0개/);
  assert.match(host.textContent, /자동 비교 안 됨1개/);
  assert.match(
    host.textContent,
    /Validator가 선택되지 않아 자동 비교하지 못했습니다/,
  );
  assert.match(host.textContent, /확인된 범위 없음/);
  data.rows = [];
  data.counts.statement_only = 0;
  await mount(report);
  assert.match(
    host.textContent,
    /선택한 조건에 표시할 제한 비교 항목이 없습니다/,
  );
  assert.match(host.textContent, /Validator가 선택되지 않아/);
});

test('int64 decimal strings remain exact while unsafe legacy numbers are never rounded into apparent evidence', async () => {
  await mount();
  const ranges = [...host.querySelectorAll('.constraint-range code')].map(
    (e) => e.textContent,
  );
  assert.ok(
    ranges.includes(
      '-9,223,372,036,854,775,808 ≤ X ≤ 9,223,372,036,854,775,807',
    ),
  );
  const report = fixture();
  report.constraint_comparison.rows[0].statement[0].high = Number(
    '9223372036854775807',
  );
  await mount(report);
  assert.match(
    host.querySelector('.constraint-row .constraint-range').textContent,
    /정밀도 확인 필요/,
  );
});

test('source truncation notices remain visible under warning filtering and counts do not imply every group was returned', async () => {
  const report = fixture();
  report.constraint_comparison.counts.compared = 250;
  report.constraint_comparison.counts.different = 248;
  report.constraint_comparison.notices = [
    {
      code: 'row_limit',
      message: '비교 항목이 많아 처음 8개만 제공합니다. 원문을 확인하세요.',
    },
  ];
  await mount(report);
  await severity('경고');
  assert.match(host.textContent, /범위 비교250개/);
  assert.match(host.textContent, /현재 필터 1개 · 제공된 비교 항목 8개/);
  assert.match(host.textContent, /처음 8개만 제공합니다/);
  assert.deepEqual(displayed(), ['difference']);
});

test('legacy or unsupported rich versions preserve existing constraint cards', async () => {
  for (const value of [undefined, { version: 2 }]) {
    const report = fixture();
    report.constraint_comparison = value;
    await mount(report);
    assert.equal(host.querySelector('.constraint-comparison'), null);
    assert.match(host.textContent, /명시적 정수 범위 3개를 비교했습니다/);
    assert.match(host.textContent, /기존 M 불일치 카드/);
  }
});

test('long source expressions and names render literally without creating HTML or prototype-key errors', async () => {
  const report = fixture();
  const name = 'VeryLongVariable_'.repeat(15);
  const entry = row(name, 'unresolved');
  entry.statement[0] = evidence(
    name,
    null,
    null,
    '<script>alert(1)</script>' + 'long_symbol+'.repeat(40),
    'constructor · input · 2',
  );
  report.constraint_comparison.rows = [entry];
  await mount(report);
  assert.equal(host.querySelector('script'), null);
  assert.match(
    host.querySelector('pre').textContent,
    /<script>alert\(1\)<\/script>/,
  );
  assert.match(host.textContent, /constructor · 입력 · 2행/);
  assert.equal(host.querySelector('h3 code').textContent, name);
});

test('initial loading disables duplicate refresh and a problem change immediately removes old evidence even on failure', async () => {
  const first = deferred();
  handler = () => first.promise;
  await mountLoader();
  assert.equal(host.querySelector('button').disabled, true);
  await act(async () => {
    host.querySelector('button').click();
  });
  assert.equal(calls.length, 1);
  await act(async () => first.resolve(fixture()));
  assert.ok(host.querySelector('.constraint-comparison'));
  const next = deferred();
  handler = () => next.promise;
  setContext('other', 'b'.repeat(64));
  await mountLoader();
  assert.equal(calls[0].options.signal.aborted, true);
  assert.equal(host.querySelector('.constraint-comparison'), null);
  assert.equal(host.querySelector('a[href^="/problems/problem/"]'), null);
  assert.equal(host.querySelector('button').disabled, true);
  await act(async () =>
    next.reject(new Error('새 문제의 보고서 권한이 없습니다.')),
  );
  assert.match(host.textContent, /새 문제의 보고서 권한이 없습니다/);
  assert.equal(host.querySelector('.constraint-comparison'), null);
  assert.equal(host.querySelector('button').disabled, false);
});

test('late responses from an old problem or document cannot replace current evidence', async () => {
  const first = deferred(),
    second = deferred(),
    third = deferred();
  const pending = [first, second, third];
  handler = () => pending.shift().promise;
  await mountLoader();
  setContext('other', 'b'.repeat(64));
  await mountLoader();
  const report = fixture();
  report.document_hash = 'b'.repeat(64);
  report.constraint_comparison.rows = [row('CurrentProblem')];
  await act(async () => second.resolve(report));
  assert.match(host.textContent, /CurrentProblem/);
  await act(async () => first.resolve(fixture()));
  assert.match(host.textContent, /CurrentProblem/);
  setContext('other', 'c'.repeat(64));
  await mountLoader();
  assert.doesNotMatch(host.textContent, /CurrentProblem/);
  assert.match(host.textContent, /불러오고 있습니다/);
  await act(async () =>
    third.reject(new Error('새 저장 자료를 불러오지 못했습니다.')),
  );
  assert.doesNotMatch(host.textContent, /CurrentProblem/);
  assert.ok(calls.every((call) => !call.options.method));
});

test('warning filtering preserves omitted differences and truncation context when the returned page has no difference rows', async () => {
  const report = fixture();
  report.constraint_comparison.rows = [row('ReturnedMatch')];
  report.constraint_comparison.counts = {
    compared: 201,
    matched: 200,
    different: 1,
    unresolved: 0,
    statement_only: 0,
    validator_only: 0,
  };
  report.constraint_comparison.notices = [
    {
      code: 'row_limit',
      message: '비교 항목을 일부만 제공합니다. 원문을 확인하세요.',
    },
  ];
  await mount(report);
  await severity('경고');
  assert.ok(host.querySelector('.constraint-comparison'));
  assert.equal(host.querySelectorAll('.constraint-row').length, 0);
  assert.match(host.textContent, /불일치1개/);
  assert.match(host.textContent, /현재 필터 0개 · 제공된 비교 항목 1개/);
  assert.match(host.textContent, /비교 항목을 일부만 제공합니다/);
  assert.match(host.textContent, /제공된 항목에 불일치 행이 없습니다/);
});

test('unnamed input calls explain the concrete fix and HTML-derived locations retain their distinct provenance', async () => {
  const report = fixture();
  const unnamed = row('입력 호출 7', 'unresolved');
  unnamed.reason_code = 'missing_name';
  unnamed.reason = '긴 진단용 이름에서 변수명을 자동 대응하지 못했습니다.';
  unnamed.statement[0].location = 'korean · input · 추출 텍스트 2행';
  report.constraint_comparison.rows = [unnamed, row('PlainText')];
  await mount(report);
  const first = host.querySelector('.constraint-row');
  assert.match(
    first.textContent,
    /입력 호출의 이름 인자에 "N"처럼 변수명만 쓰거나/,
  );
  assert.match(
    first.textContent,
    /int N = inf\.readInt\(\.\.\.\)처럼 단순 대입문/,
  );
  assert.match(first.textContent, /한국어 · 입력 · 추출 텍스트 2행/);
  const plain = host.querySelectorAll('.constraint-row')[1];
  assert.match(plain.textContent, /한국어 · 입력 · 2행/);
  assert.doesNotMatch(plain.textContent, /추출 텍스트/);
});
