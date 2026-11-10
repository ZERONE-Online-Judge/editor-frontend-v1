const { test, beforeEach, afterEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { URL } = require('node:url');
const { setImmediate } = require('node:timers');
const ts = require('typescript');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<body></body>', { url: 'http://editor.test' });
global.window = dom.window;
global.document = dom.window.document;
global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const Router = require('react-router-dom');
const h = React.createElement;
let workspace, user, jobs, requests, gates, failure, category;
let root, host, intervals, originalSetInterval, originalClearInterval;
const modules = new Map();

function source(relative) {
  const file = path.resolve(__dirname, '../src', relative);
  if (modules.has(file)) return modules.get(file).exports;
  const loaded = new Module(file, module);
  loaded.filename = file;
  loaded.paths = Module._nodeModulePaths(path.dirname(file));
  const native = loaded.require.bind(loaded);
  loaded.require = (name) => {
    if (name.endsWith('.css')) return {};
    if (name.endsWith('/workspace')) return { useWorkspace: () => workspace };
    if (name.endsWith('/authContext')) return { useAuth: () => ({ user }) };
    if (name.endsWith('/api'))
      return {
        api: get,
        time: (value) => new Date(value * 1000).toISOString(),
      };
    if (name.endsWith('/ui'))
      return {
        Icon: ({ name: icon }) => h('span', { 'data-icon': icon }),
        Badge: ({ children }) => h('span', { className: 'badge' }, children),
        Notice: ({ children }) => h('div', { role: 'alert' }, children),
        Empty: ({ title, description }) =>
          h('div', null, h('p', null, title), description),
      };
    if (name.startsWith('.')) {
      const resolved = ['.ts', '.tsx']
        .map((ext) => path.resolve(path.dirname(file), name + ext))
        .find((candidate) => fs.existsSync(candidate));
      assert.ok(resolved, `${file}: ${name}`);
      return source(path.relative(path.resolve(__dirname, '../src'), resolved));
    }
    return native(name);
  };
  modules.set(file, loaded);
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

function deferred() {
  let resolve, reject;
  const promise = new Promise((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
function job(id, kind = 'verify', overrides = {}) {
  return {
    id,
    problem_id: 'p',
    kind,
    status: 'completed',
    document_hash: 'a'.repeat(64),
    workspace_version: 3,
    revision: 2,
    options: { solutions: ['answer.cpp'], testset: 'tests' },
    created_at: 1794283200,
    started_at: 1794283201,
    finished_at: 1794283202,
    result: {},
    requested_by: 'colleague',
    requester: {
      id: 'colleague',
      display_name: '검수 동료',
      handle: 'colleague',
    },
    outcome: {
      execution: 'completed',
      assessment: {
        kind: 'expectations',
        status: 'passed',
        code: 'expectations_match',
        partial: false,
      },
    },
    ...overrides,
  };
}
function page(items, current = 1) {
  const pages = Math.max(1, Math.ceil(items.length / 10));
  const selected = Math.min(current, pages);
  return {
    items: items.slice((selected - 1) * 10, selected * 10),
    page: selected,
    page_size: 10,
    total: items.length,
    pages,
  };
}
async function get(url) {
  requests.push(url);
  const parsed = new URL(url, 'http://editor.test');
  assert.match(parsed.pathname, /^\/problems\/[^/]+\/jobs$/);
  const gateIndex = gates.findIndex((gate) => gate.when(parsed));
  if (gateIndex >= 0) return gates.splice(gateIndex, 1)[0].promise;
  if (failure) throw new Error(failure);
  const problemId = decodeURIComponent(parsed.pathname.split('/')[2]);
  const kind = parsed.searchParams.get('category');
  const items = jobs.filter(
    (row) =>
      row.problem_id === problemId &&
      (kind === 'all' ||
        (kind === 'prepare'
          ? row.kind === 'prepare'
          : source('lib/executionCategories.ts').jobCategory(row).id === kind)),
  );
  return page(items, Number(parsed.searchParams.get('page')));
}
const RecentExecutions = () =>
  h(source('components/RecentExecutions.tsx').default, { category });
function Location() {
  const value = Router.useLocation();
  return h('output', { 'data-location': true }, value.pathname + value.search);
}
async function flush() {
  for (let i = 0; i < 3; i++)
    await act(async () => new Promise((resolve) => setImmediate(resolve)));
}
async function render() {
  await act(async () =>
    root.render(
      h(
        Router.MemoryRouter,
        { initialEntries: ['/problems/p/verification'] },
        h(RecentExecutions),
        h(Location),
      ),
    ),
  );
  await flush();
}
function rows() {
  return [...host.querySelectorAll('.recent-execution-link')];
}
async function click(label) {
  const target = [...host.querySelectorAll('button,a')].find(
    (element) =>
      element.getAttribute('aria-label') === label ||
      element.textContent.trim() === label,
  );
  assert.ok(target, label);
  await act(async () => target.click());
  await flush();
}
async function poll() {
  await act(async () => {
    for (const callback of [...intervals.values()]) await callback();
  });
  await flush();
}

beforeEach(() => {
  user = { id: 'me', display_name: '작성자', handle: 'writer' };
  workspace = {
    data: {
      problem: { id: 'p', role: 'READ', permissions: [] },
      document_hash: 'a'.repeat(64),
    },
    document: {},
    dirty: false,
    editable: false,
  };
  jobs = [];
  requests = [];
  gates = [];
  failure = '';
  category = 'verify';
  intervals = new Map();
  let nextTimer = 0;
  originalSetInterval = window.setInterval;
  originalClearInterval = window.clearInterval;
  window.setInterval = (callback, delay) => {
    assert.equal(delay, 3000);
    intervals.set(++nextTimer, callback);
    return nextTimer;
  };
  window.clearInterval = (timer) => intervals.delete(timer);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  assert.equal(intervals.size, 0, 'unmount clears polling');
  host.remove();
  window.setInterval = originalSetInterval;
  window.clearInterval = originalClearInterval;
});
after(() => dom.window.close());

test('recent history requests server-filtered pages of ten and links the exact saved job', async () => {
  jobs = Array.from({ length: 23 }, (_, index) => job(`record-${index}`));
  jobs.unshift(job('different-kind', 'stress'));
  await render();
  assert.equal(rows().length, 10);
  const query = new URL(requests[0], 'http://editor.test').searchParams;
  assert.deepEqual(Object.fromEntries(query), {
    page: '1',
    page_size: '10',
    kind: 'all',
    category: 'verify',
    relation: 'all',
    current_hash: 'a'.repeat(64),
  });
  assert.ok(host.querySelector('section[aria-label="최근 실행 기록"]'));
  assert.match(host.querySelector('.pagination-range').textContent, /23.*1–10/);
  assert.equal(
    [...host.querySelectorAll('a')]
      .find((link) => link.textContent.includes('전체 기록 보기'))
      .getAttribute('href'),
    '/problems/p/invocations?history_category=verify',
  );
  await click('최근 실행 기록 다음 페이지');
  assert.equal(rows().length, 10);
  assert.match(host.querySelector('.pagination-range').textContent, /11–20/);
  const link = new URL(rows()[0].href);
  assert.equal(link.pathname, '/problems/p/invocations');
  assert.equal(link.searchParams.get('job'), 'record-10');
  assert.equal(link.searchParams.get('history_category'), 'verify');
  assert.equal(link.searchParams.get('history_page'), '2');
  await act(async () => rows()[0].click());
  await flush();
  const location = new URL(
    host.querySelector('[data-location]').textContent,
    'http://editor.test',
  );
  assert.equal(location.pathname, '/problems/p/invocations');
  assert.equal(location.searchParams.get('job'), 'record-10');
  assert.equal(location.searchParams.get('history_page'), '2');
});

test('read-only collaborators see both independent outcomes, original requesters, and saved-source relations', async () => {
  workspace.dirty = true;
  jobs = [
    job('normalized', 'verify', {
      document_hash: 'b'.repeat(64),
      options: { source_document_hash: 'a'.repeat(64) },
    }),
    job('applied', 'verify', {
      document_hash: 'c'.repeat(64),
      application: { document_hash: 'a'.repeat(64) },
      requester: { id: 'me', display_name: '작성자', handle: 'writer' },
    }),
    job('previous', 'verify', { document_hash: 'd'.repeat(64) }),
  ];
  await render();
  assert.equal(rows().length, 3);
  assert.match(rows()[0].textContent, /검수 동료/);
  assert.match(rows()[1].textContent, /작성자 \(나\)/);
  assert.match(rows()[0].textContent, /현재 저장본/);
  assert.match(rows()[1].textContent, /결과 반영본/);
  assert.match(rows()[2].textContent, /다른 자료/);
  const outcome = rows()[0].querySelector('.job-outcome.is-compact');
  assert.ok(outcome);
  assert.match(outcome.textContent, /실행.*완료.*결과.*예상 일치/);
  assert.match(
    rows()[0].getAttribute('aria-label') || rows()[0].title,
    /검수 동료/,
  );
  assert.equal(
    host.querySelector('button:not(.pagination-buttons button)'),
    null,
  );
});

test('all preparation modes appear under prepare while unrelated jobs stay excluded', async () => {
  category = 'prepare';
  jobs = ['full', 'inputs', 'validate', 'answers'].map((mode) =>
    job(mode, 'prepare', { options: { prepare_mode: mode } }),
  );
  jobs.push(job('unrelated', 'verify'));
  await render();
  assert.equal(rows().length, 4);
  const ids = rows().map((row) => new URL(row.href).searchParams.get('job'));
  assert.deepEqual(ids, ['full', 'inputs', 'validate', 'answers']);
});

test('full and single verification stay separate for paginated and legacy array responses', async () => {
  const full = job('full-verification');
  const single = job('single-verification', 'verify', {
    // An older response can keep the broad kind/category while retaining the
    // saved request flag. Classification must still use that exact snapshot.
    category: 'verify',
    options: { single_verification: true, solutions: ['temporary.cpp'] },
  });
  jobs = [full, single];
  for (const legacy of [false, true]) {
    for (const [nextCategory, expected] of [
      ['verify', 'full-verification'],
      ['verify-single', 'single-verification'],
    ]) {
      if (legacy)
        gates.push({ when: () => true, promise: Promise.resolve(jobs) });
      category = nextCategory;
      await render();
      assert.equal(rows().length, 1);
      const target = new URL(rows()[0].href);
      assert.equal(target.searchParams.get('job'), expected);
      assert.equal(target.searchParams.get('history_category'), nextCategory);
    }
  }
});

test('loading and empty states are distinct without starting a job', async () => {
  const pending = deferred();
  gates.push({ when: () => true, promise: pending.promise });
  await render();
  assert.match(host.textContent, /실행 기록을 불러오는 중입니다/);
  assert.doesNotMatch(host.textContent, /아직 실행 기록이 없습니다/);
  await act(async () => pending.resolve(page([])));
  await flush();
  assert.match(host.textContent, /아직 실행 기록이 없습니다/);
  assert.equal(rows().length, 0);
  assert.equal(requests.length, 1);
});

test('polling updates status without navigating or replacing an explicitly clicked job', async () => {
  jobs = [job('running', 'verify', { status: 'running', outcome: undefined })];
  await render();
  assert.match(rows()[0].textContent, /진행 중/);
  const before = host.querySelector('[data-location]').textContent;
  jobs = [job('newer'), job('running')];
  await poll();
  assert.equal(host.querySelector('[data-location]').textContent, before);
  await act(async () => rows()[1].click());
  await flush();
  const selected = host.querySelector('[data-location]').textContent;
  jobs.unshift(job('newest'));
  await poll();
  assert.equal(host.querySelector('[data-location]').textContent, selected);
  assert.equal(
    new URL('http://editor.test' + selected).searchParams.get('job'),
    'running',
  );
});

test('same-scope request errors retain rows and manual retry recovers', async () => {
  jobs = [job('retained')];
  await render();
  failure = '일시적인 연결 오류';
  await poll();
  assert.match(host.textContent, /일시적인 연결 오류/);
  assert.equal(rows().length, 1);
  failure = '';
  jobs = [job('recovered')];
  await click('다시 불러오기');
  assert.doesNotMatch(host.textContent, /일시적인 연결 오류/);
  assert.equal(new URL(rows()[0].href).searchParams.get('job'), 'recovered');
});

test('late category responses cannot overwrite the new category or its first page', async () => {
  jobs = Array.from({ length: 15 }, (_, index) => job(`verify-${index}`));
  jobs.push(job('stress-record', 'stress'));
  await render();
  await click('최근 실행 기록 다음 페이지');
  const pending = deferred();
  gates.push({
    when: (url) => url.searchParams.get('category') === 'verify',
    promise: pending.promise,
  });
  await poll();
  category = 'stress';
  await render();
  assert.equal(
    new URL(requests.at(-1), 'http://editor.test').searchParams.get('page'),
    '1',
  );
  await act(async () => pending.resolve(page([job('stale-verify')], 1)));
  await flush();
  assert.equal(rows().length, 1);
  assert.equal(
    new URL(rows()[0].href).searchParams.get('job'),
    'stress-record',
  );
});

test('changing problem ignores old pending responses and never displays the old problem rows', async () => {
  const pending = deferred();
  gates.push({
    when: (url) => url.pathname.includes('/p/'),
    promise: pending.promise,
  });
  jobs = [job('other-problem', 'verify', { problem_id: 'q' })];
  await render();
  workspace = {
    ...workspace,
    data: {
      ...workspace.data,
      problem: { ...workspace.data.problem, id: 'q' },
    },
  };
  await render();
  assert.equal(new URL(rows()[0].href).pathname, '/problems/q/invocations');
  await act(async () => pending.resolve(page([job('old-problem')])));
  await flush();
  assert.equal(
    new URL(rows()[0].href).searchParams.get('job'),
    'other-problem',
  );
});

test('account and saved-document changes reset pagination and invalidate account-specific rows', async () => {
  jobs = Array.from({ length: 15 }, (_, index) => job(`record-${index}`));
  await render();
  await click('최근 실행 기록 다음 페이지');
  const pending = deferred();
  gates.push({ when: () => true, promise: pending.promise });
  user = { id: 'other', display_name: '다른 사용자' };
  await render();
  assert.equal(rows().length, 0);
  assert.match(host.textContent, /실행 기록을 불러오는 중입니다/);
  assert.equal(
    new URL(requests.at(-1), 'http://editor.test').searchParams.get('page'),
    '1',
  );
  await act(async () => pending.resolve(page(jobs)));
  await flush();
  await click('최근 실행 기록 다음 페이지');
  workspace = {
    ...workspace,
    data: { ...workspace.data, document_hash: 'e'.repeat(64) },
  };
  await render();
  const query = new URL(requests.at(-1), 'http://editor.test').searchParams;
  assert.equal(query.get('page'), '1');
  assert.equal(query.get('current_hash'), 'e'.repeat(64));
  assert.match(rows()[0].textContent, /다른 자료/);
});

test('canonical links safely encode unusual job IDs without losing the chosen category', async () => {
  category = 'package';
  jobs = [job('saved/id & ? value', 'package')];
  await render();
  const target = new URL(rows()[0].href);
  assert.equal(target.pathname, '/problems/p/invocations');
  assert.equal(target.searchParams.get('job'), 'saved/id & ? value');
  assert.equal(target.searchParams.get('history_category'), 'package');
});

test('unmount cancels polling and ignores completion of an in-flight request', async () => {
  const pending = deferred();
  gates.push({ when: () => true, promise: pending.promise });
  await render();
  await act(async () => root.unmount());
  assert.equal(intervals.size, 0);
  await act(async () => pending.resolve(page([job('late')])));
  await flush();
  assert.equal(host.textContent, '');
  // afterEach can safely unmount an already unmounted root.
});
