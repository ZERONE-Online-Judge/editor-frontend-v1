const { test, afterEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<body></body>', {
  url: 'https://editor.test',
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
const { act, createElement: h } = React;
const { createRoot } = require('react-dom/client');
const { MemoryRouter } = require('react-router-dom');
let responder,
  calls = [];
class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const cache = new Map();
function load(relative) {
  if (cache.has(relative)) return cache.get(relative).exports;
  const filename = path.resolve(__dirname, '../src', relative);
  const m = new Module(filename, module);
  m.filename = filename;
  m.paths = Module._nodeModulePaths(path.dirname(filename));
  const native = m.require.bind(m);
  m.require = (id) => {
    if (id.endsWith('.css')) return {};
    if (id.endsWith('/api')) {
      const request = async (method, url, body) => {
        calls.push({ method, url, body });
        return responder(method, url, body);
      };
      return {
        api: (url) => request('GET', url),
        post: (url, body) => request('POST', url, body),
        ApiError,
        time: () => '11월 9일 18:00',
      };
    }
    if (id.startsWith('.')) {
      const found = ['.ts', '.tsx']
        .map((ext) => path.resolve(path.dirname(filename), id + ext))
        .find(fs.existsSync);
      return load(path.relative(path.resolve(__dirname, '../src'), found));
    }
    return native(id);
  };
  cache.set(relative, m);
  m._compile(
    ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText,
    filename,
  );
  return m.exports;
}
const Export = load('components/FolderPackageExport.tsx').default;
const folder = { id: 'folder-a', name: '대회 문제', parent_id: null };
function item(index, overrides = {}) {
  return {
    problem_id: `problem-${index}`,
    name: `문제 ${index}`,
    slug: `problem-${index}`,
    revision: index,
    folder_path: ['대회 문제'],
    archive_path: `problem-${index}.zip`,
    status: 'ready',
    job_id: `job-${index}`,
    reused: true,
    progress: 100,
    error: null,
    ...overrides,
  };
}
function record(overrides = {}) {
  return {
    id: 'export-a',
    folder_id: folder.id,
    folder_name: folder.name,
    include_descendants: true,
    options: {
      export_format: 'zoj',
      verify: true,
      statement_language: 'korean',
    },
    status: 'completed',
    created_at: 1,
    finished_at: 2,
    total: 1,
    ready: 1,
    failed: 0,
    pending: 0,
    progress: 100,
    download_url: '/api/folder-package-exports/export-a/download',
    items: [item(1)],
    ...overrides,
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
const cleanup = new Set();
let timers = new Map(),
  nextTimer = 10000;
const nativeTimeout = window.setTimeout.bind(window);
const nativeClearTimeout = window.clearTimeout.bind(window);
window.setTimeout = (callback, delay, ...args) => {
  if (delay === 2000 || delay === 5000) {
    const id = nextTimer++;
    timers.set(id, { callback, delay });
    return id;
  }
  return nativeTimeout(callback, delay, ...args);
};
window.clearTimeout = (id) => {
  timers.delete(id);
  nativeClearTimeout(id);
};
afterEach(async () => {
  for (const close of [...cleanup]) await close();
  timers.clear();
});
after(() => dom.window.close());
async function mount(initial = {}) {
  calls = [];
  let change;
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  function Harness() {
    const [state, setState] = React.useState({
      exportId: null,
      folder,
      account: 'owner',
      ...initial,
    });
    change = (patch) => setState((old) => ({ ...old, ...patch }));
    return h(
      MemoryRouter,
      null,
      h(Export, {
        key: `${state.account}/${state.folder.id}`,
        folder: state.folder,
        exportId: state.exportId,
        onSelect: (id) => change({ exportId: id }),
        onClose: () => change({ closed: true }),
      }),
    );
  }
  await act(async () => root.render(h(Harness)));
  const close = async () => {
    await act(async () => root.unmount());
    host.remove();
    cleanup.delete(close);
  };
  cleanup.add(close);
  return {
    host,
    change: async (patch) => act(async () => change(patch)),
    close,
  };
}
function button(host, text) {
  const found = [...host.querySelectorAll('button')].find(
    (node) => node.textContent.trim() === text,
  );
  assert.ok(found, `Missing button: ${text}`);
  return found;
}
async function click(node) {
  await act(async () => node.click());
}
async function tick(delay) {
  const entry = [...timers.entries()].find(
    ([, timer]) => timer.delay === delay,
  );
  assert.ok(entry, `Expected ${delay}ms poll`);
  timers.delete(entry[0]);
  await act(async () => entry[1].callback());
}

test('a double click creates one durable request with matching package defaults', async () => {
  const pending = deferred();
  responder = (method, url) =>
    method === 'POST'
      ? pending.promise
      : url.startsWith('/folders/')
        ? { items: [] }
        : record({
            status: 'running',
            ready: 0,
            progress: 5,
            download_url: null,
          });
  const view = await mount();
  assert.equal(view.host.querySelector('select').value, 'zoj');
  assert.equal(
    [...view.host.querySelectorAll('input[type=checkbox]')].every(
      (node) => node.checked,
    ),
    true,
  );
  await act(async () => {
    const start = button(view.host, '패키지 준비');
    start.click();
    start.click();
  });
  assert.equal(calls.filter((call) => call.method === 'POST').length, 1);
  assert.deepEqual(calls.find((call) => call.method === 'POST').body, {
    include_descendants: true,
    export_format: 'zoj',
    verify: true,
    statement_language: 'korean',
  });
  await act(async () =>
    pending.resolve(
      record({ status: 'running', ready: 0, download_url: null }),
    ),
  );
  assert.match(view.host.textContent, /창을 닫아도 준비가 계속/);
  await tick(2000);
  assert.equal(calls.filter((call) => call.method === 'POST').length, 1);
});

test('recent and reload flows reopen partial exports with 10-item pages and real result links', async () => {
  const data = record({
    status: 'partial',
    total: 12,
    ready: 11,
    failed: 1,
    items: Array.from({ length: 12 }, (_, i) =>
      item(
        i + 1,
        i === 11
          ? {
              status: 'failed',
              error: {
                code: 'forbidden',
                message: '패키지 내보내기 권한이 없습니다.',
              },
            }
          : {},
      ),
    ),
  });
  responder = (method, url) =>
    url.startsWith('/folders/') ? { items: [data] } : data;
  const view = await mount();
  await click(view.host.querySelector('.folder-export-reopen'));
  assert.equal(
    view.host.querySelectorAll('.folder-export-items > li').length,
    10,
  );
  assert.equal(
    view.host.querySelector('a[download]').getAttribute('href'),
    data.download_url,
  );
  assert.equal(
    view.host.querySelector('.folder-export-items a').getAttribute('href'),
    '/problems/problem-1/invocations?job=job-1',
  );
  await click(
    view.host.querySelector(
      'button[aria-label="폴더 패키지 결과 다음 페이지"]',
    ),
  );
  assert.equal(
    view.host.querySelectorAll('.folder-export-items > li').length,
    2,
  );
  assert.match(view.host.textContent, /패키지 내보내기 권한이 없습니다/);
  await view.close();
  const reload = await mount({ exportId: data.id });
  assert.ok(reload.host.querySelector('a[download]'));
  assert.equal(
    calls.some((call) => call.method === 'POST'),
    false,
  );
});

test('temporary network errors keep polling until completion', async () => {
  let attempt = 0;
  responder = (method, url) => {
    if (url.startsWith('/folders/')) return { items: [] };
    attempt++;
    if (attempt === 2) throw new Error('network unavailable');
    return record(
      attempt === 1 ? { status: 'running', ready: 0, download_url: null } : {},
    );
  };
  const view = await mount({ exportId: 'export-a' });
  await tick(2000);
  assert.match(view.host.textContent, /network unavailable/);
  await tick(5000);
  assert.ok(view.host.querySelector('a[download]'));
  assert.doesNotMatch(view.host.textContent, /network unavailable/);
});

test('access denial clears cached detail and history and rejects older successful responses', async () => {
  const staleHistory = deferred();
  let historyCount = 0;
  responder = (method, url) => {
    if (url.startsWith('/folders/')) {
      historyCount++;
      return historyCount === 1 ? staleHistory.promise : { items: [] };
    }
    return record({ status: 'running', download_url: '/sensitive-download' });
  };
  const view = await mount({ exportId: 'export-a' });
  assert.match(view.host.textContent, /문제 1/);
  responder = () => {
    throw new ApiError(403, '접근 권한이 해제되었습니다.');
  };
  await tick(2000);
  assert.doesNotMatch(view.host.textContent, /문제 1/);
  assert.equal(view.host.querySelector('a[download]'), null);
  await act(async () => staleHistory.resolve({ items: [record()] }));
  await view.change({ exportId: null });
  assert.equal(view.host.querySelector('.folder-export-reopen'), null);
  assert.equal(
    [...view.host.querySelectorAll('button')].some(
      (node) => node.textContent === '패키지 준비',
    ),
    false,
  );
  assert.match(view.host.textContent, /접근 권한이 해제/);
});

test('history denial hides previously completed downloads while stale detail is pending', async () => {
  const pending = deferred();
  let denyHistory = false;
  responder = (method, url) => {
    if (url.startsWith('/folders/')) {
      if (denyHistory) throw new ApiError(401, '다시 로그인하세요.');
      return { items: [record()] };
    }
    return url.endsWith('export-b') ? pending.promise : record();
  };
  const view = await mount({ exportId: 'export-a' });
  assert.ok(view.host.querySelector('a[download]'));
  denyHistory = true;
  await view.change({ exportId: 'export-b' });
  await act(async () => pending.resolve(record({ id: 'export-b' })));
  assert.equal(view.host.querySelector('a[download]'), null);
  assert.doesNotMatch(view.host.textContent, /문제 1/);
  assert.match(view.host.textContent, /다시 로그인/);
});

test('switching records during a pending POST preserves selection and resets the launch button', async () => {
  const pending = deferred();
  responder = (method, url) =>
    method === 'POST'
      ? pending.promise
      : url.startsWith('/folders/')
        ? { items: [record({ id: 'older' })] }
        : record({ id: 'older' });
  const view = await mount();
  await click(button(view.host, '패키지 준비'));
  await click(view.host.querySelector('.folder-export-reopen'));
  await act(async () => pending.resolve(record({ id: 'created-late' })));
  assert.ok(view.host.querySelector('a[download]'));
  await click(button(view.host, '새로 내보내기'));
  assert.equal(button(view.host, '패키지 준비').disabled, false);
});

test('account and folder replacement ignore an old launch response', async () => {
  const pending = deferred();
  responder = (method) => (method === 'POST' ? pending.promise : { items: [] });
  const view = await mount();
  await click(button(view.host, '패키지 준비'));
  await view.change({
    account: 'other',
    folder: { ...folder, id: 'folder-b', name: '새 폴더' },
  });
  await act(async () => pending.resolve(record()));
  assert.match(view.host.textContent, /새 폴더/);
  assert.equal(view.host.querySelector('a[download]'), null);
  assert.equal(button(view.host, '패키지 준비').disabled, false);
  assert.equal(
    calls.some((call) => call.url.startsWith('/folder-package-exports/')),
    false,
  );
});
