const { test, beforeEach, afterEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<body></body>', {
  url: 'http://editor.test',
  pretendToBeVisual: true,
});
global.window = dom.window;
global.document = dom.window.document;
global.IS_REACT_ACT_ENVIRONMENT = true;
window.HTMLDialogElement.prototype.showModal = function () {
  this.open = true;
};
window.HTMLDialogElement.prototype.close = function () {
  this.open = false;
};
const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const Router = require('react-router-dom');
const h = React.createElement;
let state, jobs, requests, requestError, detailGate, advancedLimits;
let revisionRequests,
  workspaceReads,
  saveEnabled,
  updateSnapshot,
  updateFailure;
const cache = new Map();
function source(relative) {
  const file = path.resolve(__dirname, '../src', relative);
  if (cache.has(file)) return cache.get(file).exports;
  const loaded = new Module(file, module);
  loaded.filename = file;
  loaded.paths = Module._nodeModulePaths(path.dirname(file));
  const native = loaded.require.bind(loaded);
  loaded.require = (id) => {
    if (id === 'react-router-dom')
      return { ...Router, useBlocker: () => ({ state: 'unblocked' }) };
    if (id.endsWith('/api') || id === '../lib/api')
      return {
        ...source('lib/api.ts'),
        api: get,
        post: post,
        blobText: async (problem, sha) =>
          sha === 'actual' ? 'Wrong\n' : '1 2\n',
        put: putWorking,
      };
    if (
      /\/workspace\/(Overview|Collaboration|Revisions|Review|Materials)$/.test(
        id,
      ) ||
      id === './ZojPublishing'
    )
      return { __esModule: true, default: () => null };
    if (id.endsWith('/Markdown'))
      return { __esModule: true, default: () => null };
    if (id.startsWith('.')) {
      const next = ['.ts', '.tsx']
        .map((ext) => path.resolve(path.dirname(file), id + ext))
        .find((p) => fs.existsSync(p));
      return source(path.relative(path.resolve(__dirname, '../src'), next));
    }
    return native(id);
  };
  cache.set(file, loaded);
  loaded._compile(
    ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    file,
  );
  return loaded.exports;
}
const WorkspacePage = source('pages/Workspace.tsx').default;
function job(id, kind, summary) {
  return {
    id,
    problem_id: 'p',
    kind,
    status: 'completed',
    options: { testset: 'tests', execution_backend: 'editor' },
    created_at: 1778506713,
    revision: 1,
    document_hash: 'current',
    result: { summary },
  };
}
async function get(url, options = {}) {
  if (url.includes('/revision-status?'))
    return new Promise((resolve, reject) => {
      revisionRequests.push({ url, signal: options.signal, resolve, reject });
      options.signal?.addEventListener(
        'abort',
        () => reject(new Error('aborted')),
        { once: true },
      );
    });
  if (url === '/execution-environment')
    return {
      default_backend: 'zoj',
      zoj_configured: true,
      limits: {
        tests_per_set: 10,
        stress_iterations: 73,
        stress_seconds: 300,
        counterexample_targets: [1, 5, 10],
        generator_arguments: 64,
        generator_cpu_ms: 10000,
        generator_memory_mb: 512,
        generator_output_bytes: 16777216,
        job_timeout_seconds: 600,
        worker_concurrency: 4,
        test_parallelism: 7,
        execution_concurrency: 5,
        judge_concurrency: 2,
        active_jobs_per_user: 5,
        ...(advancedLimits || {}),
      },
      capacity: { running_jobs: 1, queued_jobs: 3 },
    };
  if (url === '/problems/p') {
    workspaceReads++;
    return JSON.parse(JSON.stringify(state));
  }
  if (url.startsWith('/problems/p/revisions/'))
    return JSON.parse(JSON.stringify(state.document));
  if (url.endsWith('/preparation-status'))
    return { version: state.version, pending_preparations: [] };
  if (url === '/problems/p/jobs') return [...jobs];
  if (url.endsWith('/comments')) return [];
  const id = url.split('/jobs/')[1];
  if (id) {
    if (detailGate?.id === id) return detailGate.promise;
    const value = jobs.find((row) => row.id === id);
    if (!value) throw new Error('기록을 찾을 수 없습니다.');
    return JSON.parse(JSON.stringify(value));
  }
  throw new Error('Unexpected GET ' + url);
}
async function post(url, body) {
  requests.push({ url, body });
  if (url === '/problems/p/update') {
    if (updateFailure) throw updateFailure;
    state = {
      ...global.structuredClone(updateSnapshot),
      version: state.version + 1,
    };
    return { version: state.version };
  }
  if (requestError) throw new Error(requestError);
  if (url.endsWith('/counterexamples/apply'))
    return {
      added_count: body.counterexample_ids.length,
      duplicate_count: 0,
      version: state.version,
      needs_context_validation: false,
    };
  assert.equal(url, '/problems/p/jobs');
  const result = job(
    'new-' + body.kind,
    body.kind,
    '방금 요청한 ' + body.kind + ' 결과',
  );
  jobs.unshift(result);
  return result;
}
async function putWorking(url, body) {
  if (!saveEnabled) throw new Error('Unexpected save');
  assert.equal(url, '/problems/p/working-copy');
  requests.push({ url, body: global.structuredClone(body) });
  assert.equal(body.version, state.version);
  state.document = global.structuredClone(body.document);
  state.version++;
  return {
    version: state.version,
    document_hash: 'saved-draft',
    cautions: [],
    modified: true,
  };
}
let root, host;
beforeEach(() => {
  revisionRequests = [];
  workspaceReads = 0;
  saveEnabled = false;
  updateSnapshot = null;
  updateFailure = null;
  requests = [];
  requestError = null;
  detailGate = null;
  advancedLimits = null;
  const main = {
    name: 'main.py',
    kind: 'source',
    language: 'python3',
    sha256: 'main',
    size: 20,
    tag: 'MA',
    extra_tags: {},
  };
  state = {
    problem: {
      id: 'p',
      name: '화면 점검',
      slug: 'navigation',
      role: 'OWNER',
      revision: 1,
      modified: false,
    },
    version: 1,
    base_revision: 1,
    document_hash: 'current',
    cautions: [],
    pending_preparations: [],
    document: {
      info: { name: '합', tags: [], points_enabled: false, interactive: false },
      statements: {
        korean: {
          name: '합',
          legend: '두 정수의 합',
          input: '',
          output: '',
          scoring: '',
          interaction: '',
          notes: '',
          tutorial: '',
        },
      },
      files: {
        'validator.cpp': {
          name: 'validator.cpp',
          kind: 'source',
          language: 'cpp17',
          sha256: 'validator',
          size: 30,
          roles: ['validator'],
        },
      },
      solutions: { 'main.py': main },
      checker: 'std::wcmp',
      validator: 'validator.cpp',
      interactor: '',
      extra_validators: [],
      testsets: {
        tests: { tests: {}, groups: {}, script: '', groups_enabled: false },
        extra: { tests: {}, groups: {}, script: '', groups_enabled: false },
      },
      validator_tests: {},
      checker_tests: {},
      materials: {},
    },
  };
  jobs = [
    job('latest', 'verify', '다른 최신 검증 결과'),
    job('old', 'prepare', '이전 입력·정답 결과'),
  ];
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(() => root.unmount());
  host.remove();
});
after(() => dom.window.close());
function Observer() {
  const location = Router.useLocation();
  const navigate = Router.useNavigate();
  return h(
    React.Fragment,
    null,
    h('output', { id: 'location' }, location.pathname + location.search),
    h('button', { onClick: () => navigate(-1) }, '뒤로 이동'),
  );
}
async function flush() {
  await act(async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
  });
}
async function mount(tab) {
  await act(async () =>
    root.render(
      h(
        Router.MemoryRouter,
        { initialEntries: ['/problems/p/' + tab] },
        h(Observer),
        h(
          Router.Routes,
          null,
          h(Router.Route, {
            path: '/problems/:problemId/:tab',
            element: h(WorkspacePage),
          }),
        ),
      ),
    ),
  );
  await flush();
}
async function click(label) {
  const el = [...host.querySelectorAll('button')].find(
    (el) => el.textContent.trim() === label,
  );
  assert.ok(el, label);
  await act(async () => el.click());
  await flush();
}

test('Linux packages explicitly use the Editor replay runtime', async () => {
  await mount('packages');
  await setControl('패키지 형식', 'linux');
  await click('검증 후 패키지 생성');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].body.kind, 'package');
  assert.equal(requests[0].body.options.export_format, 'linux');
  assert.equal(requests[0].body.options.execution_backend, 'editor');
});

test('execution results and full verification have separate history and launch controls', async () => {
  await mount('invocations');
  assert.equal(host.querySelector('.invocation-controls'), null);
  assert.match(
    host.querySelector('.execution-list').textContent,
    /이전 입력·정답 결과/,
  );
  assert.doesNotMatch(
    host.querySelector('.execution-list').textContent,
    /다른 최신 검증 결과/,
  );
  const link = host.querySelector(
    '.problem-sidebar a[href="/problems/p/verification"]',
  );
  assert.equal(link.textContent.trim(), '전체 검증');
  await act(() => link.click());
  await flush();
  assert.ok(host.querySelector('.verification-launcher .invocation-controls'));
  assert.equal(host.querySelector('.execution-launcher'), null);
  assert.match(
    host.querySelector('.execution-list').textContent,
    /다른 최신 검증 결과/,
  );
  assert.doesNotMatch(
    host.querySelector('.execution-list').textContent,
    /이전 입력·정답 결과/,
  );
  assert.deepEqual(requests, []);
});

test('old verification result links move to the new tab and preserve saved jobs and query options', async () => {
  await mount('invocations?job=latest&view=team');
  assert.match(
    host.querySelector('#location').textContent,
    /verification\?job=latest&view=team/,
  );
  assert.match(
    host.querySelector('.execution-detail').textContent,
    /다른 최신 검증 결과/,
  );
  assert.ok(host.querySelector('.verification-launcher'));
  assert.deepEqual(requests, []);
});

test('a generation result link cannot show a mixed result inside the full verification tab', async () => {
  await mount('verification?job=old&view=team');
  assert.match(
    host.querySelector('#location').textContent,
    /invocations\?job=old&view=team/,
  );
  assert.match(
    host.querySelector('.execution-detail').textContent,
    /이전 입력·정답 결과/,
  );
  assert.equal(host.querySelector('.verification-launcher'), null);
  assert.deepEqual(requests, []);
});

test('the solutions shortcut opens verification setup without sending a judge request', async () => {
  await mount('solutions');
  const link = [...host.querySelectorAll('a')].find(
    (el) => el.textContent.trim() === '전체 검증으로 이동',
  );
  assert.ok(link);
  await act(() => link.click());
  await flush();
  assert.ok(host.querySelector('.verification-launcher'));
  assert.deepEqual(requests, []);
  await click('전체 풀이 검증 시작');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].body.kind, 'verify');
  const result = [...host.querySelectorAll('.notice a')].find(
    (el) => el.textContent.trim() === '검증 결과로 이동',
  );
  assert.equal(
    result.getAttribute('href'),
    '/problems/p/verification?job=new-verify',
  );
});

test('read-only users can view the verification history but cannot start a new verification', async () => {
  state.problem.role = 'READ';
  await mount('verification');
  assert.match(
    host.querySelector('.execution-detail').textContent,
    /다른 최신 검증 결과/,
  );
  const start = [
    ...host.querySelectorAll('.verification-launcher button'),
  ].find((el) => el.textContent.trim() === '전체 풀이 검증 시작');
  assert.ok(start.disabled);
  await act(() => start.click());
  assert.deepEqual(requests, []);
});

function liveVerification(status = 'running') {
  const row = job('live-verification', 'verify', '전체 풀이 검증');
  row.status = status;
  const caseRow = (index, verdict, extra = {}) => ({
    testset: 'tests',
    index,
    verdict,
    cpu_ms: 15,
    wall_ms: null,
    memory_kb: 1024,
    comment: '',
    input_sha: 'input',
    answer_sha: 'answer',
    actual_sha: 'actual',
    ...extra,
  });
  row.result.verification_progress = {
    phase: 'judging',
    current: 3,
    total: 8,
    percent: 37,
    completed_solutions: 1,
    total_solutions: 4,
  };
  row.result.solutions = [
    {
      name: 'main.py',
      tag: 'MA',
      state: 'completed',
      matched: true,
      skipped: false,
      completed_tests: 2,
      total_tests: 2,
      cases: [caseRow(1, 'AC'), caseRow(2, 'AC')],
    },
    {
      name: 'wrong.cpp',
      tag: 'WA',
      state: 'running',
      matched: false,
      skipped: false,
      completed_tests: 1,
      total_tests: 2,
      cases: [
        caseRow(1, 'WA', {
          output_truncated: true,
          output_size: 6,
          output_total_bytes: 128,
        }),
      ],
    },
    {
      name: 'slow.cpp',
      tag: 'TL',
      state: 'running',
      matched: false,
      skipped: false,
      completed_tests: 0,
      total_tests: 2,
      cases: [],
    },
    {
      name: 'memory.cpp',
      tag: 'ML',
      state: 'queued',
      matched: false,
      skipped: false,
      completed_tests: 0,
      total_tests: 2,
      cases: [],
    },
  ];
  jobs = [row];
  return row;
}

test('All four solutions and confirmed partial results appear while the full verification is still running', async () => {
  liveVerification();
  await mount('verification?job=live-verification');
  assert.equal(host.querySelectorAll('.solution-result').length, 4);
  assert.equal(host.querySelectorAll('.case-chip').length, 3);
  const progress = host.querySelector('[aria-label="전체 풀이 검증"]');
  assert.equal(progress.value, 37);
  assert.equal(progress.max, 100);
  assert.match(
    host.querySelector('.verification-progress').textContent,
    /3 \/ 8개/,
  );
  assert.match(
    host.querySelectorAll('.solution-result')[1].textContent,
    /검증 중/,
  );
  assert.match(
    host.querySelectorAll('.solution-result')[3].textContent,
    /채점 대기/,
  );
  assert.equal(
    host.querySelectorAll('.solution-result-heading .badge.danger').length,
    0,
  );
  await act(async () => host.querySelectorAll('.case-chip')[2].click());
  await flush();
  const actual = host.querySelector('a[download="actual.partial.out"]');
  assert.equal(actual.getAttribute('href'), '/api/problems/p/blobs/actual');
  assert.ok(
    [...host.querySelectorAll('textarea')].some(
      (item) => item.value === 'Wrong\n',
    ),
  );
  assert.match(
    host.querySelector('.evidence-grid').textContent,
    /전체 128 B.*보관/,
  );
});

test('Polling adds later solution outcomes without waiting for the first solution or reopening the page', async () => {
  const row = liveVerification();
  let poll;
  const previous = window.setTimeout;
  window.setTimeout = (callback, delay, ...args) => {
    if (delay === 1800) {
      poll = callback;
      return 999999;
    }
    return previous.call(window, callback, delay, ...args);
  };
  try {
    await mount('verification?job=live-verification');
    assert.equal(typeof poll, 'function');
    const panels = host.querySelectorAll('details.solution-result');
    assert.equal(panels.length, 4);
    await act(() => panels[0].querySelector('summary').click());
    assert.equal(panels[0].open, false);
    assert.equal(panels[1].open, true);
    row.result.solutions[2].cases.push({
      ...row.result.solutions[1].cases[0],
      verdict: 'TLE',
    });
    row.result.solutions[2].completed_tests = 1;
    row.result.verification_progress = {
      ...row.result.verification_progress,
      current: 4,
      percent: 50,
    };
    await act(async () => poll());
    await flush();
    assert.equal(host.querySelector('[aria-label="전체 풀이 검증"]').value, 50);
    assert.match(
      host.querySelectorAll('.solution-result')[2].textContent,
      /TLE/,
    );
    assert.equal(host.querySelectorAll('.solution-result').length, 4);
    assert.equal(
      host.querySelectorAll('details.solution-result')[0].open,
      false,
    );
    assert.equal(
      host.querySelectorAll('details.solution-result')[1].open,
      true,
    );
    await act(() => panels[0].querySelector('summary').click());
    assert.equal(panels[0].open, true);
  } finally {
    window.setTimeout = previous;
  }
});

test('judge agent summaries show only maximum time and memory without nested disclosure cards', async () => {
  const row = liveVerification('completed');
  row.result.solutions[0].judge_runs = [
    {
      id: 'judge-one',
      testset: 'tests',
      status: 'wrong_answer',
      node_name: 'zoj-judge-agent-04',
      agent_version: '0.2.23',
      testcase_count: 120,
      runtime_ms: 66,
      memory_kb: 5440,
      failed_testcase_order: 13,
      compile_message: null,
      judge_message: 'Raw verdict text',
    },
    {
      id: 'judge-two',
      testset: 'extra',
      status: 'system_error',
      node_name: null,
      agent_version: null,
      testcase_count: 3,
      runtime_ms: null,
      memory_kb: null,
      failed_testcase_order: null,
      compile_message: 'Compiler diagnostic',
      judge_message: null,
    },
  ];
  await mount('verification?job=live-verification');
  const summary = host.querySelector('.solution-judge-summary');
  assert.equal(summary.querySelectorAll('details').length, 0);
  assert.match(
    summary.querySelector('.solution-judge-agent').textContent,
    /zoj-judge-agent-04.*v0.2.23.*120개 테스트/,
  );
  const records = summary.querySelectorAll('.solution-judge-run');
  assert.deepEqual(
    [...records[0].querySelectorAll('dt')].map((el) => el.textContent),
    ['최대 실행 시간', '최대 메모리'],
  );
  assert.match(records[0].textContent, /66ms/);
  assert.equal(records[0].querySelector('.badge'), null);
  assert.doesNotMatch(summary.textContent, /실패 #13|Raw verdict text/);
  assert.deepEqual(
    [...records[1].querySelectorAll('dd')].map((el) => el.textContent),
    ['미제공', '미제공'],
  );
  assert.match(
    records[1].querySelector('.solution-judge-message').textContent,
    /Compiler diagnostic/,
  );
});

test('Cancelled verification preserves the real percentage and labels pending solutions as interrupted', async () => {
  liveVerification('cancelled');
  await mount('verification?job=live-verification');
  assert.equal(host.querySelector('[aria-label="전체 풀이 검증"]').value, 37);
  assert.match(
    host.querySelector('.verification-progress').textContent,
    /검증 중단/,
  );
  assert.match(
    host.querySelectorAll('.solution-result')[1].textContent,
    /검증 중단/,
  );
});

test('selected test preparation requests only the chosen indices and operation', async () => {
  state.document.testsets.tests.script = '';
  state.document.testsets.tests.tests = {
    one: {
      index: 1,
      input_sha: 'input',
      answer_sha: 'answer',
      command: '',
      description: 'one',
      group: '',
      sample: false,
      points: 0,
    },
  };
  await mount('tests');
  await act(() => host.querySelector('[aria-label="테스트 1 선택"]').click());
  await click('선택 정답만 재생성');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].body.kind, 'prepare');
  assert.deepEqual(requests[0].body.options.test_indices, [1]);
  assert.equal(requests[0].body.options.prepare_mode, 'answers');
});
for (const [tab, button, kind] of [
  ['tests', '입력·정답 생성', 'prepare'],
  ['validator', '테스트 실행', 'validator-tests'],
  ['checker', '테스트 실행', 'checker-tests'],
  ['statements', 'HTML · PDF 렌더링', 'render'],
]) {
  test(
    tab +
      ' request card links directly to that saved execution without starting verification',
    async () => {
      await mount(tab);
      await click(button);
      const link = [...host.querySelectorAll('.notice a')].find(
        (a) => a.textContent.trim() === '실행 결과로 이동',
      );
      assert.ok(link);
      assert.equal(
        link.getAttribute('href'),
        '/problems/p/invocations?job=new-' + kind,
      );
      await act(async () => link.click());
      await flush();
      assert.ok(host.textContent.includes('방금 요청한 ' + kind + ' 결과'));
      assert.equal(
        host
          .querySelector('.job-row[aria-pressed="true"]')
          ?.textContent.includes('방금 요청한'),
        true,
      );
      assert.equal(requests.length, 1);
      assert.equal(requests[0].body.kind, kind);
      assert.equal(host.querySelector('.execution-launcher').open, false);
      const sections = [
        ...host.querySelectorAll('.execution-history,.execution-launcher'),
      ];
      assert.ok(sections[0].classList.contains('execution-history'));
    },
  );
}
test('changing job URLs preserves query options, hides old actions during loading, and supports browser back', async () => {
  jobs[0].kind = 'prepare';
  await mount('invocations?job=old&view=team');
  assert.match(
    host.querySelector('.execution-detail').textContent,
    /이전 입력·정답 결과/,
  );
  let resolve;
  detailGate = {
    id: 'latest',
    promise: new Promise((r) => {
      resolve = r;
    }),
  };
  const row = [...host.querySelectorAll('.job-row')].find((el) =>
    el.textContent.includes('다른 최신 검증 결과'),
  );
  await act(async () => row.click());
  await flush();
  assert.match(
    host.querySelector('#location').textContent,
    /job=latest&view=team/,
  );
  assert.doesNotMatch(
    host.querySelector('.execution-detail').textContent,
    /이전 입력·정답 결과|작업 사본에 반영/,
  );
  assert.match(
    host.querySelector('.execution-detail').textContent,
    /불러오는 중/,
  );
  await act(() => resolve(jobs[0]));
  await flush();
  assert.match(
    host.querySelector('.execution-detail').textContent,
    /다른 최신 검증 결과/,
  );
  await click('뒤로 이동');
  assert.match(
    host.querySelector('.execution-detail').textContent,
    /이전 입력·정답 결과/,
  );
  assert.deepEqual(requests, []);
});
test('viewing a failed record keeps its error visible and never starts a new execution', async () => {
  jobs[0] = {
    ...jobs[0],
    status: 'failed',
    result: { summary: 'Validator 입력 조건 불일치' },
  };
  await mount('invocations?job=latest');
  assert.match(
    host.querySelector('.execution-detail').textContent,
    /Validator 입력 조건 불일치/,
  );
  assert.deepEqual(requests, []);
});
test('explicit verification starts once with the chosen testset and environment', async () => {
  await mount('verification');
  assert.ok(host.querySelector('.verification-launcher'));
  assert.equal(host.querySelector('.execution-launcher'), null);
  const select = [...host.querySelectorAll('.invocation-controls label')]
    .find((el) => el.textContent.startsWith('검증 테스트 세트'))
    .querySelector('select');
  await act(() => {
    select.value = 'extra';
    select.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
  await click('전체 풀이 검증 시작');
  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0].body.options, {
    name: '',
    note: '',
    snapshot: 'working_copy',
    test_indices: [],
    solutions: [],
    testset: 'extra',
    verify: true,
    force_prepare: false,
    execution_backend: 'zoj',
  });
  assert.match(host.querySelector('#location').textContent, /job=new-verify/);
  assert.match(
    host.querySelector('.execution-detail').textContent,
    /방금 요청한 verify 결과/,
  );
});
test('verification can explicitly bypass preparation reuse without reusing a judge result', async () => {
  await mount('verification');
  const options = host.querySelector('.invocation-preparation-options');
  assert.equal(options.open, false);
  const checkbox = options.querySelector('input[type="checkbox"]');
  assert.equal(checkbox.checked, false);
  await act(() => checkbox.click());
  await click('전체 풀이 검증 시작');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].body.options.force_prepare, true);
  assert.equal(requests[0].body.reuse, false);
});

test('all testsets is opt-in and clears single-set ranges before verification', async () => {
  await mount('verification');
  const field = (label) =>
    [...host.querySelectorAll('.invocation-controls label')]
      .find((el) => el.textContent.startsWith(label))
      .querySelector('select,input');
  assert.equal(field('검증 테스트 세트').value, 'tests');
  await setControl('테스트 범위', 'range');
  await setControl('테스트 번호·범위', '1-3');
  await setControl('검증 테스트 세트', '');
  assert.equal(field('테스트 범위').disabled, true);
  assert.equal(field('테스트 범위').value, 'all');
  assert.match(
    host.querySelector('.invocation-controls').textContent,
    /포함할 세트: tests, extra/,
  );
  assert.deepEqual(requests, []);
  await click('전체 풀이 검증 시작');
  const options = requests[0].body.options;
  assert.equal(options.all_testsets, true);
  assert.equal(options.testset, 'tests');
  assert.deepEqual(options.test_indices, []);
  assert.equal(requests[0].body.reuse, false);
});

test('switching back to one set restores individual test selection', async () => {
  await mount('verification');
  await setControl('검증 테스트 세트', '');
  await setControl('검증 테스트 세트', 'extra');
  const range = [...host.querySelectorAll('.invocation-controls label')]
    .find((el) => el.textContent.startsWith('테스트 범위'))
    .querySelector('select');
  assert.equal(range.disabled, false);
  await click('전체 풀이 검증 시작');
  assert.equal(requests[0].body.options.testset, 'extra');
  assert.equal(requests[0].body.options.all_testsets, undefined);
});

test('reviewer temporary code uses all sets on the committed revision', async () => {
  state.problem.role = 'READ';
  state.problem.reviewer = true;
  await mount('verification');
  await setControl('검증 테스트 세트', '');
  await act(() => {
    const code = host.querySelector('textarea[aria-label="임시 검수 코드"]');
    Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      'value',
    ).set.call(code, 'print(42)');
    code.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
  await click('임시 코드 검증 시작');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].body.options.snapshot, 'committed');
  assert.equal(requests[0].body.options.all_testsets, true);
  assert.deepEqual(requests[0].body.options.test_indices, []);
  assert.equal(
    requests[0].body.options.temporary_solutions[0].content,
    'print(42)',
  );
});

test('stored all-set verification displays its scope and per-set progress', async () => {
  const row = liveVerification();
  row.result.scope = {
    all_testsets: true,
    testset: 'tests',
    testsets: ['tests', 'samples', 'empty'],
    testset_counts: { tests: 2, samples: 2, empty: 0 },
    solutions: ['main.py', 'wrong.py'],
    test_indices: [],
    test_count: 4,
  };
  row.result.verification_progress.testsets = {
    tests: { current: 1, total: 4, percent: 25 },
    samples: { current: 2, total: 4, percent: 50 },
    empty: { current: 0, total: 0, percent: 0 },
  };
  row.result.solutions[0].cases[1].testset = 'samples';
  row.result.solutions[0].cases[1].index = 1;
  await mount('verification?job=live-verification');
  assert.match(
    host.querySelector('.execution-detail').textContent,
    /전체 세트 \(tests, samples, empty\).*테스트 4개/,
  );
  const sets = [...host.querySelectorAll('.verification-testsets li')];
  assert.equal(sets.length, 3);
  assert.match(sets[0].textContent, /tests1 \/ 4 · 25%/);
  assert.match(sets[1].textContent, /samples2 \/ 4 · 50%/);
  assert.match(sets[2].textContent, /empty실행 대상 없음/);
  const solution = host.querySelector('.solution-result');
  assert.deepEqual(
    [...solution.querySelectorAll('.solution-testset-cases h4')].map(
      (el) => el.textContent,
    ),
    ['tests', 'samples'],
  );
  const chips = [...solution.querySelectorAll('.case-chip')];
  assert.equal(chips.length, 2);
  assert.match(chips[0].title, /tests · #1/);
  assert.match(chips[1].title, /samples · #1/);
  await act(() => chips[1].click());
  await flush();
  assert.match(host.querySelector('dialog').textContent, /samples · 테스트 #1/);
  assert.deepEqual(requests, []);
});

test('preparation counts are separate from measured judging progress and collapse by default', async () => {
  const row = liveVerification();
  row.result.preparation_cache = {
    enabled: true,
    reused: {
      input: 120,
      validator: 120,
      answer: 120,
      checker: 120,
      sample: 0,
    },
    executed: { input: 0, validator: 0, answer: 0, checker: 0, sample: 0 },
  };
  await mount('verification?job=live-verification');
  const summary = host.querySelector('.preparation-summary');
  assert.equal(summary.open, false);
  assert.match(
    summary.querySelector('summary').textContent,
    /480개 단계 재사용 · 0개 단계 실행/,
  );
  assert.match(summary.textContent, /판정·시간·메모리를 재사용하지 않습니다/);
  assert.equal(host.querySelector('[aria-label="전체 풀이 검증"]').value, 37);
});

test('selected verification submits exact solution names and a normalized test range', async () => {
  state.document.solutions['wrong.py'] = {
    ...state.document.solutions['main.py'],
    name: 'wrong.py',
    tag: 'WA',
  };
  await mount('verification');
  const field = (label) =>
    [...host.querySelectorAll('.invocation-controls label')]
      .find((el) => el.textContent.startsWith(label))
      .querySelector('input,select,textarea');
  await act(() => {
    for (const [label, value] of [
      ['대상 풀이', 'selected'],
      ['테스트 범위', 'range'],
    ]) {
      const select = field(label);
      select.value = value;
      select.dispatchEvent(new window.Event('change', { bubbles: true }));
    }
  });
  await flush();
  await act(() => {
    const label = [
      ...host.querySelectorAll('.invocation-select-list label'),
    ].find((el) => el.textContent.includes('wrong.py'));
    label.querySelector('input').click();
    for (const [title, value] of [
      ['테스트 번호·범위', '1-3, 2, 5'],
      ['실행 이름', '경계 확인'],
    ]) {
      const input = field(title);
      Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      ).set.call(input, value);
      input.dispatchEvent(new window.Event('input', { bubbles: true }));
    }
  });
  await click('선택 범위 검증 시작');
  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0].body.options.solutions, ['wrong.py']);
  assert.deepEqual(requests[0].body.options.test_indices, [1, 2, 3, 5]);
  assert.equal(requests[0].body.options.name, '경계 확인');
});
test('test range parsing rejects invalid bounds and deduplicates overlap', () => {
  const { parseTestIndices } = source('lib/invocationOptions.ts');
  assert.deepEqual(parseTestIndices('1-3,2,5~6', 10), [1, 2, 3, 5, 6]);
  for (const value of ['', '0', '10-2', '11', '1; rm', '2.5'])
    assert.throws(() => parseTestIndices(value, 10));
});
test('execution limits reflect the server response rather than fixed UI defaults', async () => {
  await mount('stress');
  const panel = host.querySelector('[aria-label="서버 실행 한도와 처리 현황"]');
  assert.match(panel.textContent, /73회/);
  assert.match(panel.textContent, /작업 전체 최대 10분/);
  assert.match(panel.textContent, /Editor 작업 동시 처리 4개/);
  assert.match(panel.textContent, /진행 중 1개 · 대기 3개/);
  assert.match(panel.textContent, /작업당 동시 2개/);
  assert.match(panel.textContent, /스트레스 시드 병렬 처리작업당 최대 5개/);
});
test('read-only users can view records while new execution buttons stay disabled', async () => {
  state.problem.role = 'READ';
  await mount('invocations?job=old');
  assert.match(
    host.querySelector('.execution-detail').textContent,
    /이전 입력·정답 결과/,
  );
  const buttons = [...host.querySelectorAll('.execution-launcher button')];
  assert.equal(buttons.length, 1);
  assert.ok(buttons.every((el) => el.disabled));
  assert.deepEqual(requests, []);
});
test('a read-only reviewer can verify the committed revision without a working-copy save', async () => {
  state.problem.role = 'READ';
  state.problem.reviewer = true;
  await mount('verification');
  await click('전체 풀이 검증 시작');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].body.options.snapshot, 'committed');
  assert.equal(requests[0].body.revision, state.problem.revision);
  const generation = [
    ...host.querySelectorAll('.execution-launcher button'),
  ].find((el) => el.textContent.includes('입력·정답 생성 시작'));
  assert.equal(generation, undefined);
});
test('stress runs selected solutions against shared inputs with time and collection options', async () => {
  const main = state.document.solutions['main.py'];
  state.document.solutions['wrong.py'] = {
    ...main,
    name: 'wrong.py',
    tag: 'WA',
  };
  state.document.solutions['slow.py'] = { ...main, name: 'slow.py', tag: 'TL' };
  await mount('stress');
  const field = (label) =>
    [...host.querySelectorAll('.stress-controls label')]
      .find((el) => el.textContent.startsWith(label))
      .querySelector('input,select');
  await act(() => {
    const input = field('생성기 명령');
    Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    ).set.call(input, 'gen {seed}');
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    for (const [label, value] of [
      ['실행 기준', 'duration'],
      ['반례 발견 후', 'collect'],
    ]) {
      const select = field(label);
      select.value = value;
      select.dispatchEvent(new window.Event('change', { bubbles: true }));
    }
  });
  await flush();
  assert.equal(field('최대 반복 횟수').max, '73');
  await click('스트레스 테스트 시작');
  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0].body.options.candidates, [
    'wrong.py',
    'slow.py',
  ]);
  assert.equal(requests[0].body.options.duration_seconds, 30);
  assert.equal(requests[0].body.options.counterexample_limit, 5);
  assert.equal(requests[0].body.options.stop_on_first, false);
  assert.deepEqual(requests[0].body.options.counterexample_verdicts, [
    'WA',
    'TLE',
    'MLE',
    'RE',
  ]);
});
test('a rejected request shows no misleading result link', async () => {
  requestError = '실행 요청이 거부되었습니다.';
  await mount('tests');
  await click('입력·정답 생성');
  assert.match(
    host.querySelector('[role="alert"]').textContent,
    /실행 요청이 거부/,
  );
  assert.equal(host.querySelector('.notice a'), null);
});

test('stress history shows saved request conditions without using current source settings', async () => {
  const row = job('stress-saved', 'stress', '첫 반례 발견');
  row.options = {
    generator: 'gen --new-form {seed}',
    reference: '',
    candidates: ['wrong.py'],
    iterations: 999,
    stress_configuration: {
      generator: 'gen --size 100 "{seed}"',
      seed_start: 1,
      seed_step: 1,
      seed_mode: 'placeholder',
      reference: 'saved-main.cpp',
      candidates: [
        { name: 'wrong.py', tag: 'WA' },
        { name: 'slow.py', tag: 'TL' },
      ],
      testset: 'saved-tests',
      iterations: 100,
      duration_seconds: 30,
      stop_on_first: false,
      counterexample_limit: 5,
      counterexample_verdicts: ['WA', 'TLE'],
      time_limit_ms: 1500,
      memory_limit_mb: 256,
      validator: 'saved-validator.cpp',
      extra_validators: ['extra-validator.cpp'],
      checker: 'std::wcmp',
      interactor: '',
    },
  };
  jobs = [row];
  state.document.info.time_limit_ms = 5000;
  state.document.info.memory_limit_mb = 1024;
  await mount('invocations?job=stress-saved');
  const panel = host.querySelector(
    '[aria-label="실행 당시 스트레스 테스트 조건"]',
  );
  assert.ok(panel);
  assert.match(panel.textContent, /saved-main.cpp/);
  assert.match(panel.textContent, /saved-tests/);
  assert.match(panel.textContent, /wrong.py · 오답/);
  assert.match(panel.textContent, /slow.py · 시간 초과/);
  assert.match(panel.textContent, /최대 100회 · 30초/);
  assert.match(panel.textContent, /반례 입력 5개까지 수집/);
  assert.match(panel.textContent, /WA · TLE/);
  assert.match(panel.textContent, /1500ms · 256MiB/);
  assert.match(panel.textContent, /extra-validator.cpp/);
  assert.doesNotMatch(panel.textContent, /5000ms|1024MiB|999회|--new-form/);
  assert.equal(
    panel.querySelector('pre code').textContent,
    'gen --size 100 "{seed}"',
  );
  assert.match(
    host.querySelector('.job-stress-context').title,
    /gen --size 100 "\{seed\}" · 최대 100회 · 30초/,
  );
  assert.deepEqual(requests, []);
});

test('legacy stress records expose stored options and counterexample commands without claiming missing limits', async () => {
  const row = job('legacy-stress', 'stress', '완료');
  row.options = {
    generator: 'gen --size 100',
    candidate: 'old-wrong.py',
    reference: '',
    testset: 'tests',
    iterations: 50,
    duration_seconds: null,
    stop_on_first: true,
    counterexample_verdicts: ['WA'],
  };
  row.result.counterexample = {
    iteration: 3,
    command: 'gen --size 100 3',
    verdict: 'WA',
    input_sha: 'input',
    answer_sha: 'answer',
    actual_sha: 'actual',
    comment: '',
  };
  jobs = [row];
  await mount('stress?job=legacy-stress');
  const panel = host.querySelector('.stress-run-conditions');
  assert.match(panel.textContent, /마지막 인자로 시드 추가/);
  assert.match(panel.textContent, /Main \(파일명 미기록\)/);
  assert.match(panel.textContent, /old-wrong.py/);
  assert.match(panel.textContent, /최대 50회 · 개별 시간 조건 없음/);
  assert.match(panel.textContent, /첫 반례 입력의 모든 비교를 마치고 종료/);
  assert.doesNotMatch(panel.textContent, /풀이별 입력당 제한|생성 요청 시드/);
  assert.equal(
    host.querySelector('.counterexample pre code').textContent,
    'gen --size 100 3',
  );
  assert.deepEqual(requests, []);
});

test('failed stress runs distinguish the last requested seed from completed iterations', async () => {
  const row = job('failed-stress', 'stress', '생성기 오류');
  row.status = 'failed';
  row.options = {
    generator: 'gen {seed}',
    reference: 'original.cpp',
    candidates: ['wrong.py'],
    iterations: 100,
    duration_seconds: 10,
    stop_on_first: false,
    counterexample_limit: 5,
  };
  row.result.stress = {
    iterations_started: 7,
    iterations_completed: 6,
    elapsed_seconds: 8.5,
    duplicates_skipped: 1,
    counterexample_count: 1,
    stop_reason: null,
    last_seed: 7,
    last_command: 'gen 7 --label "<img src=x>"',
  };
  row.result.counterexamples = [
    {
      id: 'example',
      iteration: 2,
      seed: 2,
      command: 'gen 2',
      input_sha: 'in',
      answer_sha: 'ans',
      findings: [
        { solution: 'wrong.py', verdict: 'WA', actual_sha: 'out', comment: '' },
      ],
    },
  ];
  jobs = [row];
  await mount('stress?job=failed-stress');
  const panel = host.querySelector('.stress-run-conditions');
  assert.match(panel.textContent, /생성 요청 시드: 1 ~ 7 · 6회 완료/);
  assert.equal(
    [...panel.querySelectorAll('pre code')][1].textContent,
    'gen 7 --label "<img src=x>"',
  );
  assert.equal(panel.querySelector('img'), null);
  assert.match(
    host.querySelector('.counterexample').textContent,
    /반복 2 · 시드 2/,
  );
  assert.equal(
    host.querySelector('.counterexample pre code').textContent,
    'gen 2',
  );
  assert.deepEqual(requests, []);
});

test('queued stress records show request limits without inventing executed seeds', async () => {
  const row = job('queued-stress', 'stress', '검증 워커 배정 대기');
  row.status = 'queued';
  row.options = {
    generator: 'gen {seed}',
    candidates: ['wrong.py'],
    iterations: 50,
    duration_seconds: null,
    stop_on_first: true,
  };
  jobs = [row];
  await mount('stress?job=queued-stress');
  const panel = host.querySelector('.stress-run-conditions');
  assert.match(panel.textContent, /최대 50회/);
  assert.doesNotMatch(panel.textContent, /생성 요청 시드|50회 완료/);
  assert.equal(panel.querySelector('.stress-seed-progress'), null);
  assert.deepEqual(requests, []);
});

test('polling new jobs does not replace the record currently being viewed', async () => {
  const nativeInterval = window.setInterval;
  let refresh;
  window.setInterval = (callback) => {
    refresh = callback;
    return 0;
  };
  try {
    await mount('verification');
    assert.match(
      host.querySelector('.execution-detail').textContent,
      /다른 최신 검증 결과/,
    );
    jobs.unshift(job('another-user', 'verify', '동료의 새로운 검증'));
    await act(async () => {
      await refresh();
    });
    await flush();
    assert.match(
      host.querySelector('.execution-detail').textContent,
      /다른 최신 검증 결과/,
    );
    assert.doesNotMatch(
      host.querySelector('.execution-detail').textContent,
      /동료의 새로운 검증/,
    );
    assert.deepEqual(requests, []);
  } finally {
    window.setInterval = nativeInterval;
  }
});

function discoveryLimits() {
  advancedLimits = {
    stress_patterns: 20,
    stress_counterexamples: 200,
    minimize_attempts: 200,
    minimize_seconds: 60,
    minimize_input_bytes: 1048576,
  };
}
function control(label, selector = 'input,select') {
  const field = [...host.querySelectorAll('label')].find((element) =>
    element.textContent.trim().startsWith(label),
  );
  assert.ok(field, label);
  const input = field.querySelector(selector);
  assert.ok(input, label);
  return input;
}
async function setControl(label, value) {
  const input = control(label);
  await act(() => {
    if (input.tagName === 'SELECT') {
      input.value = value;
      input.dispatchEvent(new window.Event('change', { bubbles: true }));
    } else {
      Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      ).set.call(input, String(value));
      input.dispatchEvent(new window.Event('input', { bubbles: true }));
    }
  });
  await flush();
}
function addGroup() {
  state.document.testsets.tests.groups_enabled = true;
  state.document.testsets.tests.groups.small = {
    points_policy: 'COMPLETE_GROUP',
    feedback_policy: 'COMPLETE',
    dependencies: [],
  };
}

test('stress pattern builder submits modes, integer ranges, seeds, group, focus and reduction together', async () => {
  discoveryLimits();
  addGroup();
  state.document.solutions['wrong.py'] = {
    ...state.document.solutions['main.py'],
    name: 'wrong.py',
    tag: 'WA',
  };
  await mount('stress');
  await act(() => {
    host.querySelector('.stress-pattern-builder').open = true;
  });
  await setControl('명령 템플릿', 'gen {mode} {N} {lo} {hi} {seed}');
  await setControl('mode 목록', 'random, negative');
  await setControl('N 최솟값', 2);
  await setControl('N 최댓값', 9);
  await setControl('값 범위 하한', -10);
  await setControl('값 범위 상한', 10);
  await click('조합을 패턴에 적용');
  assert.equal(host.querySelectorAll('.stress-pattern-row').length, 2);
  assert.equal(control('생성기 명령').value, 'gen random [2..9] -10 10 {seed}');
  await setControl('시작 시드', 41);
  await setControl('시드 증가량', 2);
  await setControl('검증·등록 그룹', 'small');
  await setControl('반례 발견 후', 'all');
  assert.equal(control('미검출 풀이에 집중').checked, true);
  assert.equal(control('미검출 풀이에 집중').disabled, true);
  await act(() => control('발견한 반례 자동 축소').click());
  await click('스트레스 테스트 시작');
  assert.equal(requests.length, 1);
  const options = requests[0].body.options;
  assert.deepEqual(options.patterns, [
    { name: 'mode random', command: 'gen random [2..9] -10 10 {seed}' },
    { name: 'mode negative', command: 'gen negative [2..9] -10 10 {seed}' },
  ]);
  assert.equal(options.seed_start, 41);
  assert.equal(options.seed_step, 2);
  assert.equal(options.group, 'small');
  assert.equal(options.stop_mode, 'all_candidates');
  assert.equal(options.focus_uncovered, true);
  assert.equal(options.minimize, true);
});

test('an uncovered retry continues seeds and never sends server-owned metadata back as options', async () => {
  discoveryLimits();
  state.document.solutions['slow.py'] = {
    ...state.document.solutions['main.py'],
    name: 'slow.py',
    tag: 'TL',
  };
  const row = job('retry-stress', 'stress', '반복 횟수 한도');
  row.options = {
    generator: 'gen {seed}',
    reference: 'main.py',
    candidates: ['other.py', 'slow.py'],
    seed_start: 100,
    seed_step: 2,
    iterations: 10,
    testset: 'tests',
    duration_seconds: 30,
    runtime_revision: 'server-only',
    source_document_hash: 'server-only',
    permission_mode: 'write',
    stress_configuration: { generator: 'gen {seed}' },
  };
  row.result.stress = {
    iterations_started: 4,
    iterations_completed: 4,
    elapsed_seconds: 2,
    counterexample_count: 1,
    duplicates_skipped: 0,
    stop_reason: 'iterations',
    last_seed: 106,
  };
  row.result.uncovered_candidates = ['slow.py'];
  jobs = [row];
  await mount('stress?job=retry-stress');
  assert.match(host.querySelector('.stress-uncovered').textContent, /slow.py/);
  await click('미검출 풀이만 다음 시드부터 실행');
  assert.equal(requests.length, 1);
  const options = requests[0].body.options;
  assert.deepEqual(options.candidates, ['slow.py']);
  assert.equal(options.seed_start, 108);
  assert.equal(options.stop_mode, 'all_candidates');
  for (const key of [
    'runtime_revision',
    'source_document_hash',
    'permission_mode',
    'stress_configuration',
  ])
    assert.equal(key in options, false);
});

test('counterexample filters, exact cover and reduced group registration preserve their selected evidence', async () => {
  discoveryLimits();
  addGroup();
  const row = job('collected-stress', 'stress', '수집 완료');
  row.options = { generator: 'gen {seed}', testset: 'tests', group: 'small' };
  const a = 'a'.repeat(32),
    b = 'b'.repeat(32),
    c = 'c'.repeat(32);
  const finding = (solution, verdict) => ({
    solution,
    verdict,
    actual_sha: 'actual',
    comment: '',
  });
  const example = (id, findings) => ({
    id,
    iteration: 1,
    seed: 1,
    command: 'gen 1',
    input_sha: 'input',
    answer_sha: 'answer',
    findings,
  });
  const first = example(a, [
    finding('wrong.py', 'WA'),
    finding('slow.py', 'TLE'),
  ]);
  first.minimized = {
    input_sha: 'reduced-input',
    answer_sha: 'reduced-answer',
    input_bytes: 5,
    findings: first.findings,
  };
  first.minimization = {
    status: 'finished',
    attempts: 8,
    accepted_steps: 2,
    original_bytes: 40,
    final_bytes: 5,
    elapsed_seconds: 1,
  };
  row.result.counterexamples = [
    first,
    example(b, [finding('wrong.py', 'WA')]),
    example(c, [finding('crash.cpp', 'RE')]),
  ];
  row.result.coverage = {
    method: 'exact',
    example_ids: [a, c],
    covered_pairs: 3,
    pairs: [],
  };
  jobs = [row];
  await mount('stress?job=collected-stress');
  await setControl('관측 판정으로 분류', 'TLE');
  assert.equal(host.querySelectorAll('.counterexample').length, 1);
  assert.match(
    host.querySelector('.counterexample').textContent,
    /검증된 축소본/,
  );
  await click('최소 커버 선택 · 2개');
  assert.deepEqual(requests, []);
  assert.equal(control('등록할 테스트 그룹').value, 'small');
  await act(() => control('검증된 축소본 보기·등록에 사용').click());
  assert.match(
    host.querySelector('.counterexample').textContent,
    /이 반례를 생성한 명령/,
  );
  await act(() => control('검증된 축소본 보기·등록에 사용').click());
  await click('선택한 2개 반례를 테스트에 추가');
  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0].body.counterexample_ids, [a, c]);
  assert.equal(requests[0].body.use_minimized, true);
  assert.equal(requests[0].body.group, 'small');
});

test('pattern statistics use compared unique inputs instead of attempted generations', async () => {
  const row = job('pattern-stress', 'stress', '완료');
  row.result.pattern_summaries = [
    {
      index: 0,
      name: 'small',
      command: 'gen [1..10]',
      attempts: 10,
      valid_inputs: 5,
      duplicates_skipped: 5,
      compared_inputs: 5,
      counterexample_inputs: 2,
      findings: 3,
      solution_findings: { 'wrong.py': 2, 'slow.py': 1 },
    },
  ];
  jobs = [row];
  await mount('stress?job=pattern-stress');
  const statistics = host.querySelector('.stress-pattern-statistics');
  assert.match(statistics.textContent, /40.0%/);
  assert.doesNotMatch(statistics.textContent, /20.0%/);
  assert.match(statistics.textContent, /wrong.py 2회/);
});

test('the builder rejects inverted ranges and unbounded combinations without generating commands', () => {
  const { composeStressPatterns, retryStressOptions } = source(
    'lib/stressOptions.ts',
  );
  const values = {
    template: 'gen {mode} {N} {lo} {hi} {seed}',
    modes: 'one,two',
    nMin: 1,
    nMax: 10,
    valueMin: -1,
    valueMax: 2,
    limit: 20,
  };
  assert.throws(
    () => composeStressPatterns({ ...values, nMin: 20 }),
    /올바른 정수/,
  );
  assert.throws(
    () => composeStressPatterns({ ...values, limit: 1 }),
    /최대 1개/,
  );
  assert.throws(
    () => composeStressPatterns({ ...values, template: 'gen "{mode}" {seed}' }),
    /독립된 인자/,
  );
  assert.throws(
    () => composeStressPatterns({ ...values, template: 'gen {toString}' }),
    /지원하지 않는 자리표시자/,
  );
  assert.equal(
    retryStressOptions(
      { options: {}, result: { stress: { iterations_started: 4 } } },
      ['wrong'],
    ).seed_start,
    5,
  );
  assert.throws(
    () =>
      retryStressOptions(
        {
          options: { seed_step: 1 },
          result: { stress: { last_seed: Number.MAX_SAFE_INTEGER } },
        },
        ['wrong'],
      ),
    /정수 범위/,
  );
});

async function remoteCommit(revision) {
  await act(async () =>
    revisionRequests.at(-1).resolve({
      revision,
      author: '공동 출제자',
      message: '최댓값 테스트 보강',
      created_at: 1778506713,
    }),
  );
  await flush();
}
async function editStatement(value) {
  const field = host.querySelector('textarea[aria-label="문제 지문 · LaTeX"]');
  assert.ok(field);
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      'value',
    ).set.call(field, value);
    field.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
}

test('A remote commit announces itself over the workspace without reloading or replacing an unsaved statement', async () => {
  await mount('statements');
  await editStatement('아직 저장하지 않은 지문');
  await remoteCommit(2);
  const banner = host.querySelector('[aria-label="새 커밋 안내"]');
  assert.match(banner.textContent, /새로운 변경사항이 있습니다/);
  assert.match(banner.textContent, /공동 출제자.*r2.*업데이트를 눌러/);
  assert.match(banner.textContent, /최댓값 테스트 보강/);
  assert.match(banner.textContent, /작성 중인 변경/);
  assert.equal(
    host.querySelector('textarea[aria-label="문제 지문 · LaTeX"]').value,
    '아직 저장하지 않은 지문',
  );
  assert.equal(workspaceReads, 1);
  assert.deepEqual(requests, []);
  assert.match(host.querySelector('.working-state').textContent, /공유 r2/);
});

test('The notice update button saves the current draft before merging and clears after loading the new base', async () => {
  await mount('statements');
  saveEnabled = true;
  await editStatement('내 지문은 유지');
  state.problem.revision = 2;
  updateSnapshot = global.structuredClone(state);
  updateSnapshot.problem.modified = false;
  updateSnapshot.base_revision = 2;
  updateSnapshot.document.info.name = '동료가 수정한 제목';
  updateSnapshot.document.statements.korean.legend = '내 지문은 유지';
  await remoteCommit(2);
  await act(async () =>
    host.querySelector('.revision-update-notice .primary').click(),
  );
  await flush();
  assert.deepEqual(
    requests.map((row) => row.url),
    ['/problems/p/working-copy', '/problems/p/update'],
  );
  assert.equal(
    requests[0].body.document.statements.korean.legend,
    '내 지문은 유지',
  );
  assert.equal(requests[1].body.version, 2);
  assert.equal(host.querySelector('.revision-update-notice'), null);
  assert.equal(host.querySelector('h1').textContent, '동료가 수정한 제목');
  assert.equal(
    host.querySelector('textarea[aria-label="문제 지문 · LaTeX"]').value,
    '내 지문은 유지',
  );
  assert.match(
    host.querySelector('.working-state').textContent,
    /내 작업 사본 r2/,
  );
});

test('A conflicting update keeps both the local statement and the pending revision notice', async () => {
  await mount('statements');
  saveEnabled = true;
  await editStatement('충돌해도 보존할 지문');
  updateFailure = new (source('lib/api.ts').ApiError)(409, {
    message: '같은 항목을 수정한 변경이 있습니다.',
    conflicts: ['statements/korean/legend'],
  });
  await remoteCommit(2);
  await act(async () =>
    host.querySelector('.revision-update-notice .primary').click(),
  );
  await flush();
  assert.ok(host.querySelector('.revision-update-notice'));
  assert.match(
    host.querySelector('.workspace-main').textContent,
    /같은 항목.*충돌 해결/,
  );
  assert.equal(
    host.querySelector('textarea[aria-label="문제 지문 · LaTeX"]').value,
    '충돌해도 보존할 지문',
  );
  assert.equal(workspaceReads, 1);
});

test('Dismissing one revision does not hide a later commit or the toolbar update state', async () => {
  await mount('statements');
  await remoteCommit(2);
  await act(async () =>
    host.querySelector('[aria-label="새 커밋 안내 닫기"]').click(),
  );
  assert.equal(host.querySelector('.revision-update-notice'), null);
  assert.match(
    host.querySelector('.working-state').textContent,
    /업데이트 가능/,
  );
  await act(async () => window.dispatchEvent(new window.Event('focus')));
  await flush();
  assert.match(revisionRequests.at(-1).url, /after=2&/);
  await remoteCommit(3);
  assert.match(
    host.querySelector('.revision-update-notice').textContent,
    /공유 r3/,
  );
});

test('Read-only collaborators see new commits but do not get a false notice from an unused old working copy', async () => {
  state.problem.role = 'READ';
  state.base_revision = 0;
  await mount('statements');
  assert.equal(host.querySelector('.revision-update-notice'), null);
  assert.match(
    host.querySelector('.working-state').textContent,
    /현재 보는 리비전 r1/,
  );
  await remoteCommit(2);
  assert.ok(host.querySelector('.revision-update-notice'));
  assert.equal(workspaceReads, 1);
  state.problem.revision = 2;
  state.document.statements.korean.legend = '공유된 최신 지문';
  await act(async () =>
    host.querySelector('.revision-update-notice .primary').click(),
  );
  await flush();
  assert.equal(host.querySelector('.revision-update-notice'), null);
  assert.equal(
    host.querySelector('textarea[aria-label="문제 지문 · LaTeX"]').value,
    '공유된 최신 지문',
  );
  assert.equal(
    requests.length,
    0,
    'Viewing an update must not merge a stale private working copy',
  );
});

test('Hidden windows abort their watch and resume once on return without applying stale replies', async () => {
  await mount('statements');
  assert.equal(revisionRequests.length, 1);
  const original = revisionRequests[0];
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: 'hidden',
  });
  await act(async () =>
    document.dispatchEvent(new window.Event('visibilitychange')),
  );
  assert.equal(original.signal.aborted, true);
  await act(async () =>
    original.resolve({
      revision: 9,
      author: '오래된 요청',
      message: '',
      created_at: 0,
    }),
  );
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: 'visible',
  });
  await act(async () => {
    document.dispatchEvent(new window.Event('visibilitychange'));
    window.dispatchEvent(new window.Event('focus'));
  });
  await flush();
  assert.equal(revisionRequests.length, 2);
  await remoteCommit(2);
  assert.match(
    host.querySelector('.revision-update-notice').textContent,
    /공유 r2/,
  );
  assert.doesNotMatch(
    host.querySelector('.revision-update-notice').textContent,
    /r9/,
  );
});

test('Losing access stops the watch instead of repeatedly requesting a private problem', async () => {
  await mount('statements');
  await act(async () =>
    revisionRequests[0].reject(
      new (source('lib/api.ts').ApiError)(404, {
        message: '문제를 찾을 수 없습니다.',
      }),
    ),
  );
  await act(async () => window.dispatchEvent(new window.Event('focus')));
  await flush();
  assert.equal(revisionRequests.length, 1);
});

test('A temporary network failure retries and reconnect events do not create duplicate watches', async () => {
  await mount('statements');
  const scheduled = [];
  const originalTimeout = window.setTimeout;
  window.setTimeout = (callback, delay, ...args) => {
    if (delay === 2000) {
      scheduled.push(callback);
      return 0;
    }
    return originalTimeout.call(window, callback, delay, ...args);
  };
  try {
    await act(async () =>
      revisionRequests[0].reject(new Error('Network unavailable')),
    );
    assert.equal(scheduled.length, 1);
    assert.equal(revisionRequests.length, 1);
    await act(async () => scheduled[0]());
    assert.equal(revisionRequests.length, 2);
    await act(async () => {
      window.dispatchEvent(new window.Event('online'));
      window.dispatchEvent(new window.Event('focus'));
    });
    assert.equal(revisionRequests.length, 2);
    await remoteCommit(2);
    assert.match(
      host.querySelector('.revision-update-notice').textContent,
      /공유 r2/,
    );
    assert.equal(workspaceReads, 1);
  } finally {
    window.setTimeout = originalTimeout;
  }
});
