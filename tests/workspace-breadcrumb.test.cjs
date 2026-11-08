const { test, beforeEach, afterEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><body></body>', {
  url: 'https://editor.test/problems/p/overview',
});
global.window = dom.window;
global.document = dom.window.document;
global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { act, createElement: h } = React;
const { createRoot } = require('react-dom/client');
const Router = require('react-router-dom');
let folders, calls, respond, root, host;
const cache = new Map();
function source(relative) {
  const filename = path.resolve(__dirname, '../src', relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const native = loaded.require.bind(loaded);
  loaded.require = (id) => {
    if (id.endsWith('/api'))
      return {
        api: (url, options) => {
          calls.push({ url, signal: options.signal });
          return respond(url, options);
        },
      };
    if (id.startsWith('.')) {
      const next = ['.ts', '.tsx']
        .map((ext) => path.resolve(path.dirname(filename), id + ext))
        .find(fs.existsSync);
      return source(path.relative(path.resolve(__dirname, '../src'), next));
    }
    return native(id);
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
const Breadcrumb = source('components/WorkspaceBreadcrumb.tsx').default;
function Location() {
  const location = Router.useLocation();
  return h('output', { id: 'location' }, location.pathname + location.search);
}
const base = { problemId: 'p', folderId: null, title: '문제 제목' };
async function render(props = {}) {
  await act(async () =>
    root.render(
      h(
        Router.MemoryRouter,
        { initialEntries: ['/problems/p/overview'] },
        h(Breadcrumb, { ...base, ...props }),
        h(Location),
      ),
    ),
  );
}
function current() {
  return host.querySelector('[aria-current="page"]');
}
function links() {
  return [...host.querySelectorAll('nav a')];
}
function nested(count = 2) {
  return Array.from({ length: count }, (_, i) => ({
    id: `f${i}`,
    name: `폴더 ${i + 1}`,
    parent_id: i ? `f${i - 1}` : null,
  }));
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
beforeEach(() => {
  folders = [];
  calls = [];
  respond = async () => folders;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
after(() => dom.window.close());

test('A problem outside folders shows My Problems and the actual current title without a folder request', async () => {
  await render();
  assert.equal(
    host.querySelector('nav').getAttribute('aria-label'),
    '문제 위치',
  );
  assert.equal(current().textContent, '문제 제목');
  assert.deepEqual(
    links().map((a) => [a.textContent, a.getAttribute('href')]),
    [['내 문제', '/problems']],
  );
  assert.equal(host.querySelectorAll('ol li').length, 2);
  assert.deepEqual(calls, []);
});

test('Nested personal folder links lead to the exact folder list and root link returns to My Problems', async () => {
  folders = [
    { id: 'top', name: '개인 폴더', parent_id: null },
    { id: 'child+#/', name: '하위 폴더', parent_id: 'top' },
  ];
  await render({ folderId: 'child+#/' });
  assert.deepEqual(
    links().map((a) => [a.textContent, a.getAttribute('href')]),
    [
      ['내 문제', '/problems'],
      ['개인 폴더', '/problems?folder=top'],
      ['하위 폴더', '/problems?folder=child%2B%23%2F'],
    ],
  );
  for (const link of links().slice(1)) {
    await act(async () => link.click());
    assert.equal(
      host.querySelector('#location').textContent,
      link.getAttribute('href'),
    );
  }
  await act(async () => links()[0].click());
  assert.equal(host.querySelector('#location').textContent, '/problems');
  assert.deepEqual(
    calls.map((call) => call.url),
    ['/folders'],
  );
  assert.equal(host.querySelectorAll('li > [aria-hidden="true"]').length, 3);
});

test('Shared folder paths use only the authorized folder response', async () => {
  folders = [
    {
      id: 'shared',
      parent_id: null,
      name: '공유 제작팀',
      workspace_id: 'team',
      workspace_role: 'VIEWER',
    },
    {
      id: 'drafts',
      parent_id: 'shared',
      name: '출제 중',
      workspace_id: 'team',
      workspace_role: 'VIEWER',
    },
    { id: 'unrelated', parent_id: null, name: '다른 개인 폴더' },
  ];
  await render({ folderId: 'drafts' });
  assert.deepEqual(
    links().map((a) => a.textContent),
    ['내 문제', '공유 제작팀', '출제 중'],
  );
  assert.doesNotMatch(host.textContent, /다른 개인 폴더/);
  assert.deepEqual(
    calls.map((call) => call.url),
    ['/folders'],
  );
});

test('An edited current problem title updates immediately without refetching folder metadata', async () => {
  folders = nested();
  await render({ folderId: 'f1' });
  await render({ folderId: 'f1', title: '지금 편집한 문제 제목' });
  assert.equal(current().textContent, '지금 편집한 문제 제목');
  assert.equal(current().title, '지금 편집한 문제 제목');
  assert.equal(calls.length, 1);
});

test('A folder lookup failure quietly preserves root and title navigation', async () => {
  respond = async () => {
    throw new Error('권한이 없거나 연결할 수 없습니다.');
  };
  await render({ folderId: 'private' });
  assert.deepEqual(
    links().map((a) => a.textContent),
    ['내 문제'],
  );
  assert.equal(current().textContent, base.title);
  assert.equal(host.querySelector('[role="alert"]'), null);
});

for (const [name, rows, id] of [
  ['missing folder', nested(), 'unknown'],
  [
    'missing parent',
    [{ id: 'child', parent_id: 'hidden-owner-folder', name: '하위' }],
    'child',
  ],
  [
    'cycle',
    [
      { id: 'a', parent_id: 'b', name: 'A' },
      { id: 'b', parent_id: 'a', name: 'B' },
    ],
    'a',
  ],
  ['self cycle', [{ id: 'a', parent_id: 'a', name: 'A' }], 'a'],
  ['over-depth path', nested(13), 'f12'],
  ['malformed response', { folders: nested() }, 'f1'],
  ['malformed folder', [null, { id: 'child', name: '하위' }], 'child'],
]) {
  test(`An invalid ${name} falls back without displaying a misleading partial path`, async () => {
    folders = rows;
    await render({ folderId: id });
    assert.deepEqual(
      links().map((a) => a.textContent),
      ['내 문제'],
    );
    assert.equal(current().textContent, base.title);
  });
}

test('All 12 folder levels and long current names retain accessible full text and titles', async () => {
  folders = nested(12).map((folder) => ({
    ...folder,
    name: `긴 폴더 이름 ${folder.id} ` + '폴더'.repeat(100),
  }));
  const title = '아주긴문제제목'.repeat(100);
  await render({ folderId: 'f11', title });
  assert.equal(links().length, 13);
  assert.equal(host.querySelectorAll('li').length, 14);
  assert.equal(current().textContent, title);
  for (let i = 0; i < folders.length; i++) {
    assert.equal(links()[i + 1].textContent, folders[i].name);
    assert.equal(links()[i + 1].title, folders[i].name);
  }
});

for (const change of ['folder', 'problem', 'outside']) {
  test(`Late folder responses cannot replace navigation after a ${change} transition`, async () => {
    const old = deferred();
    respond = () => old.promise;
    await render({ folderId: 'old' });
    const previousSignal = calls[0].signal;
    folders = [{ id: 'new', parent_id: null, name: '새 위치' }];
    respond = async () => folders;
    const props =
      change === 'folder'
        ? { folderId: 'new' }
        : change === 'problem'
          ? { folderId: 'new', problemId: 'another', title: '다른 문제' }
          : { folderId: null };
    await render(props);
    assert.ok(previousSignal.aborted);
    await act(async () =>
      old.resolve([{ id: 'old', parent_id: null, name: '오래된 위치' }]),
    );
    assert.doesNotMatch(host.textContent, /오래된 위치/);
    assert.deepEqual(
      links().map((a) => a.textContent),
      change === 'outside' ? ['내 문제'] : ['내 문제', '새 위치'],
    );
    assert.equal(current().textContent, props.title || base.title);
  });
}

test('Changing problems with the same folder id refreshes permissions and ignores the previous response', async () => {
  const old = deferred();
  respond = () => old.promise;
  await render({ folderId: 'same' });
  const previousSignal = calls[0].signal;
  respond = async () => [];
  await render({ folderId: 'same', problemId: 'another', title: '다른 문제' });
  assert.ok(previousSignal.aborted);
  assert.equal(calls.length, 2);
  await act(async () =>
    old.resolve([{ id: 'same', parent_id: null, name: '이전 문제의 폴더' }]),
  );
  assert.deepEqual(
    links().map((a) => a.textContent),
    ['내 문제'],
  );
  assert.equal(current().textContent, '다른 문제');
});

test('Unmounting the workspace aborts the metadata request and ignores a late response', async () => {
  const old = deferred();
  respond = () => old.promise;
  await render({ folderId: 'old' });
  const signal = calls[0].signal;
  await act(async () => root.render(null));
  assert.ok(signal.aborted);
  await act(async () =>
    old.resolve([{ id: 'old', parent_id: null, name: '오래된 위치' }]),
  );
  assert.equal(host.querySelector('nav'), null);
});
