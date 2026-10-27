const { test, after, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'),
  path = require('node:path'),
  Module = require('node:module'),
  ts = require('typescript');
const { JSDOM } = require('jsdom');
const { URL } = require('node:url');
const console = require('node:console');
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
const cache = new Map(),
  cleanups = new Set();
function source(relative) {
  if (cache.has(relative)) return cache.get(relative).exports;
  const filename = path.resolve(__dirname, '../src', relative),
    m = new Module(filename, module);
  m.filename = filename;
  m.paths = Module._nodeModulePaths(path.dirname(filename));
  const native = m.require.bind(m);
  m.require = (id) => {
    if (id.endsWith('.css')) return {};
    if (id.endsWith('/authContext'))
      return { useAuth: () => ({ user: { id: 'owner', handle: 'owner' } }) };
    if (id.endsWith('/api'))
      return {
        api: async (url, options = {}) => {
          calls.push({ url, options });
          return responder(url, options);
        },
        time: () => '10월 27일',
      };
    if (id === './RevisionChanges')
      return {
        __esModule: true,
        default: () => h('div', { 'data-full-diff': true }, '상세 비교'),
      };
    if (id.startsWith('.')) {
      const found = ['.ts', '.tsx']
        .map((ext) => path.resolve(path.dirname(filename), id + ext))
        .find(fs.existsSync);
      return source(path.relative(path.resolve(__dirname, '../src'), found));
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
const Preview = source('components/RevisionPreview.tsx').default;
const Notice = source('components/RevisionNotice.tsx').default;
const History = source('components/SharedFolderHistory.tsx').default;
const preview = (number = 2, message = '경계값 처리 수정') => ({
  from_revision: number - 1,
  to_revision: number,
  commits: {
    total: 1,
    items: [{ number, author: '공동 출제자', message, created_at: 1 }],
  },
  changes: {
    total: 1,
    items: [
      {
        path: 'solutions/main.cpp',
        label: 'main.cpp',
        kind: 'changed',
        content_label: '파일 내용',
        lines: [
          { kind: 'remove', text: '-return 1;' },
          { kind: 'add', text: '+return 0;' },
        ],
        truncated: false,
        binary: false,
        unavailable: false,
        additional_contents: 0,
      },
    ],
  },
});
async function mount(Component, props = {}, entry = '/') {
  calls = [];
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const render = (next) =>
    act(async () =>
      root.render(
        h(MemoryRouter, { initialEntries: [entry] }, h(Component, next)),
      ),
    );
  await render(props);
  const close = async () => {
    await act(async () => root.unmount());
    host.remove();
    cleanups.delete(close);
  };
  cleanups.add(close);
  return { host, render, close };
}
const click = async (view, label) => {
  const button = [...view.host.querySelectorAll('button')].find(
    (el) =>
      el.textContent.trim() === label ||
      el.getAttribute('aria-label') === label,
  );
  assert.ok(button, label);
  await act(async () => button.click());
};
afterEach(async () => {
  for (const close of [...cleanups]) await close();
});
after(() => dom.window.close());

test('The update notice shows commit content and a real diff while preserving one-click update and dismiss', async () => {
  responder = () => preview();
  let updated = 0;
  const view = await mount(Notice, {
    problemId: 'p',
    baseRevision: 1,
    revision: 2,
    head: { revision: 2, author: '공동 출제자' },
    dirty: true,
    busy: false,
    onUpdate: () => updated++,
  });
  assert.match(view.host.textContent, /경계값 처리 수정/);
  assert.match(view.host.textContent, /main.cpp.*-return 1;.*\+return 0;/s);
  assert.match(view.host.textContent, /작성 중인 변경/);
  assert.match(calls[0].url, /from_revision=1&to_revision=2/);
  await click(view, '업데이트');
  assert.equal(updated, 1);
  await click(view, '새 커밋 안내 닫기');
  assert.equal(view.host.textContent, '');
});

test('Preview errors can retry and never disable the update action', async () => {
  responder = () => {
    throw new Error('일시적인 연결 오류');
  };
  let updated = 0;
  const view = await mount(Notice, {
    problemId: 'p',
    baseRevision: 1,
    revision: 2,
    head: null,
    dirty: false,
    busy: false,
    onUpdate: () => updated++,
  });
  assert.match(view.host.textContent, /미리보기를 불러오지 못했습니다/);
  await click(view, '업데이트');
  assert.equal(updated, 1);
  responder = () => preview();
  await click(view, '다시 불러오기');
  assert.match(view.host.textContent, /경계값 처리 수정/);
});

test('Navigation aborts stale previews and keeps another problem commit out of the new view', async () => {
  let resolveOld;
  responder = (url) =>
    url.includes('/old/')
      ? new Promise((resolve) => {
          resolveOld = resolve;
        })
      : preview(3, '새 문제 커밋');
  const view = await mount(Preview, { problemId: 'old', from: 1, to: 2 });
  const oldRequest = calls[0];
  await view.render({ problemId: 'new', from: 2, to: 3 });
  assert.equal(oldRequest.options.signal.aborted, true);
  await act(async () => resolveOld(preview(2, '예전 문제 커밋')));
  assert.match(view.host.textContent, /새 문제 커밋/);
  assert.doesNotMatch(view.host.textContent, /예전 문제 커밋/);
});

test('Full comparison loads committed snapshots only after explicitly opening it', async () => {
  responder = (url) =>
    url.includes('/revision-preview?') ? preview() : { info: { name: '자료' } };
  const view = await mount(Preview, { problemId: 'p', from: 1, to: 2 });
  assert.equal(calls.length, 1);
  await click(view, '전체 변경 보기');
  assert.ok(view.host.querySelector('dialog[open]'));
  assert.deepEqual(
    calls.slice(1).map((c) => c.url),
    ['/problems/p/revisions/1', '/problems/p/revisions/2'],
  );
  assert.match(view.host.textContent, /상세 비교/);
});

test('Team histories page ten commits and request a diff only for the expanded commit', async () => {
  responder = (url) => {
    if (url.includes('revision-preview')) return preview();
    const page = Number(
      new URL(url, 'https://editor.test').searchParams.get('page'),
    );
    return {
      total: 11,
      page,
      page_size: 10,
      pages: 2,
      items: Array.from({ length: page === 1 ? 10 : 1 }, (_, i) => ({
        problem_id: 'p',
        problem_name: '팀 문제',
        slug: 'team-task',
        folder_path: ['팀', '예선'],
        number: page === 1 ? 10 - i : 0,
        message: `변경 ${page === 1 ? 10 - i : 0}`,
        author: '공동 출제자',
        created_at: 1,
        minor: false,
        changes: {
          total: 1,
          items: [
            { path: 'solutions/main.cpp', label: 'main.cpp', kind: 'changed' },
          ],
        },
      })),
    };
  };
  const view = await mount(History, { folderId: 'team' });
  assert.equal(
    view.host.querySelectorAll('.folder-history-list > li').length,
    10,
  );
  assert.match(calls[0].url, /page=1&page_size=10/);
  assert.equal(calls.filter((c) => c.url.includes('preview')).length, 0);
  await click(view, '변경 내용 보기');
  assert.equal(calls.filter((c) => c.url.includes('preview')).length, 1);
  assert.equal(
    view.host.querySelector('a').getAttribute('href'),
    '/problems/p/revisions',
  );
  assert.match(view.host.textContent, /팀 \/ 예선/);
  await click(view, '팀 폴더 리비전 다음 페이지');
  assert.equal(
    view.host.querySelectorAll('.folder-history-list > li').length,
    1,
  );
  assert.match(calls.at(-1).url, /page=2&page_size=10/);
});

test('Bounded and binary previews clearly explain why full changes are not inline', async () => {
  const data = preview();
  data.commits.total = 12;
  data.changes.total = 8;
  data.changes.items[0] = {
    ...data.changes.items[0],
    binary: true,
    truncated: true,
    additional_contents: 1,
  };
  responder = () => data;
  const view = await mount(Preview, { problemId: 'p', from: 0, to: 12 });
  assert.match(view.host.textContent, /전체 12개 커밋 중 최근 1개/);
  assert.match(view.host.textContent, /바이너리 파일/);
  assert.match(view.host.textContent, /변경 8개 중 1개/);
  assert.match(view.host.textContent, /일부 변경만 표시/);
});

test('The real team folder page retains its overview while switching into revision history', async () => {
  const Problems = source('pages/Problems.tsx').default;
  responder = (url) => {
    if (url === '/folders')
      return [
        {
          id: 'team',
          name: '공동 출제',
          parent_id: null,
          workspace_id: 'team',
          workspace_role: 'OWNER',
          can_create: true,
          can_edit: true,
          can_manage: true,
        },
      ];
    if (url.startsWith('/problems?') || url.includes('/invitations')) return [];
    if (url.endsWith('/members'))
      return {
        role: 'OWNER',
        members: [
          {
            user_id: 'owner',
            display_name: '출제자',
            handle: 'owner',
            role: 'OWNER',
          },
        ],
        invitations: [],
      };
    if (url.includes('/revisions?'))
      return { items: [], total: 0, page: 1, page_size: 10, pages: 1 };
    throw new Error(url);
  };
  const errors = [],
    original = console.error;
  console.error = (...args) => errors.push(args.join(' '));
  try {
    const view = await mount(Problems, {}, '/problems?folder=team');
    assert.match(view.host.textContent, /함께하는 구성원/);
    await click(view, '리비전');
    assert.ok(view.host.querySelector('[aria-label="팀 폴더 협업 현황"]'));
    assert.ok(view.host.querySelector('[aria-label="팀 폴더 리비전"]'));
    assert.match(view.host.textContent, /공유한 리비전이 없습니다/);
    assert.ok(
      !errors.some((message) => /same key/.test(message)),
      errors.join('\n'),
    );
    await click(view, '문제 목록');
    assert.ok(!view.host.querySelector('[aria-label="팀 폴더 리비전"]'));
    assert.ok(view.host.querySelector('[aria-label="팀 폴더 협업 현황"]'));
  } finally {
    console.error = original;
  }
});
