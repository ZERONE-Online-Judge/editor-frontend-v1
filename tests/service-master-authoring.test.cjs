const { test, beforeEach, afterEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { URL } = require('node:url');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<body></body>', {
  url: 'https://editor.zoj.kr/service-master/problems',
});
global.window = dom.window;
global.document = dom.window.document;
global.FormData = dom.window.FormData;
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
let user, calls, respond, root, host;
class ApiError extends Error {
  constructor(status) {
    super('서비스 마스터 권한이 필요합니다.');
    this.status = status;
  }
}
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
    if (id.endsWith('/authContext')) return { useAuth: () => ({ user }) };
    if (id.endsWith('/api'))
      return {
        ApiError,
        api: (url, options = {}) => {
          calls.push({ url, options });
          return respond(url, options);
        },
      };
    if (id.startsWith('.')) {
      const file = ['.ts', '.tsx']
        .map((ext) => path.resolve(path.dirname(filename), id + ext))
        .find(fs.existsSync);
      assert.ok(file, id);
      return source(path.relative(path.resolve(__dirname, '../src'), file));
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
const Page = source('pages/ServiceMasterProblems.tsx').default;
const author = {
  id: 'author',
  display_name: '공동 출제자',
  email: 'author@example.test',
  handle: 'author',
};
function problem(id = 'p') {
  return {
    id,
    slug: 'problem-' + id,
    name: '함께 만드는 문제 ' + id,
    deleted: false,
    owner: author,
    created_at: 1794200000,
    updated_at: 1794200100,
    revision: 3,
    editor_count: 2,
    last_activity_at: 1794200200,
    last_activity_type: 'working_copy',
    last_actor: { ...author, display_name: '최근 작업자' },
  };
}
function list(items = [problem()], page = 1) {
  return { items, total: 11, page, page_size: 10, pages: 2 };
}
beforeEach(() => {
  user = { ...author, id: 'master', is_service_master: true };
  calls = [];
  respond = async () => list();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
after(() => dom.window.close());
async function render(entry = '/service-master/problems') {
  await act(async () =>
    root.render(h(MemoryRouter, { initialEntries: [entry] }, h(Page))),
  );
}
async function click(label) {
  const button = [...host.querySelectorAll('button')].find(
    (el) =>
      el.textContent.trim() === label ||
      el.getAttribute('aria-label') === label,
  );
  assert.ok(button, label);
  await act(async () => button.click());
}

test('ordinary users and client-like truthy claims never request the administrator directory', async () => {
  for (const capability of [false, undefined, 'true', 1]) {
    user = { ...user, is_service_master: capability };
    await render();
    assert.match(host.textContent, /서비스 마스터 전용/);
    assert.equal(calls.length, 0);
  }
});
test('masters see owners and real last-save context with ten-item server pagination', async () => {
  await render();
  const request = new URL(calls[0].url, 'https://editor.test');
  assert.equal(request.pathname, '/service-master/problems');
  assert.equal(request.searchParams.get('page_size'), '10');
  assert.match(host.textContent, /공동 출제자/);
  assert.match(host.textContent, /author@example.test/);
  assert.match(host.textContent, /최근 작업자/);
  assert.match(host.textContent, /작업 사본 저장/);
  await click('문제 제작 현황 다음 페이지');
  assert.equal(
    new URL(calls.at(-1).url, 'https://editor.test').searchParams.get('page'),
    '2',
  );
  assert.ok(
    calls.every(
      (call) => !call.options.method || call.options.method === 'GET',
    ),
  );
});
test('search and sort reset pagination while preserving other administrator filters', async () => {
  await render(
    '/service-master/problems?page=2&deleted=true&sort=owner&q=author',
  );
  const input = host.querySelector('input[name=q]');
  input.value = '다른 생성자';
  await act(async () =>
    host
      .querySelector('form')
      .dispatchEvent(
        new window.Event('submit', { bubbles: true, cancelable: true }),
      ),
  );
  let params = new URL(calls.at(-1).url, 'https://editor.test').searchParams;
  assert.equal(params.get('q'), '다른 생성자');
  assert.equal(params.get('page'), '1');
  assert.equal(params.get('deleted'), 'true');
  assert.equal(params.get('sort'), 'owner');
  const selects = host.querySelectorAll('select');
  await act(async () => {
    selects[1].value = 'created';
    selects[1].dispatchEvent(new window.Event('change', { bubbles: true }));
  });
  params = new URL(calls.at(-1).url, 'https://editor.test').searchParams;
  assert.equal(params.get('sort'), 'created');
  assert.equal(params.get('q'), '다른 생성자');
});
test('details show current editors and their saved working revisions without opening a problem workspace', async () => {
  respond = async (url) =>
    url.includes('/problems/p')
      ? {
          problem: problem(),
          editors: [
            {
              user: author,
              role: 'OWNER',
              last_saved_at: null,
              working_revision: 3,
            },
            {
              user: {
                ...author,
                id: 'translator',
                display_name: '번역 제작자',
              },
              role: 'READ',
              last_saved_at: 1794200200,
              working_revision: 2,
            },
          ],
          last_commit: { number: 3, created_at: 1794200100, author },
        }
      : list();
  await render();
  await click('함께 만드는 문제 p 제작자 상세');
  assert.match(host.querySelector('dialog').textContent, /번역 제작자/);
  assert.match(host.querySelector('dialog').textContent, /저장 기록 없음/);
  assert.match(host.querySelector('dialog').textContent, /작업 기준 r2/);
  assert.ok(calls.every((call) => call.url.startsWith('/service-master/')));
  assert.equal(host.querySelector('a[href^="/problems/p"]'), null);
});
test('a denied refresh clears prior metadata instead of preserving private cached rows', async () => {
  await render();
  assert.match(host.textContent, /함께 만드는 문제/);
  respond = async () => {
    throw new Error('서비스 마스터 권한이 필요합니다.');
  };
  await click('새로고침');
  assert.match(
    host.querySelector('[role=alert]').textContent,
    /서비스 마스터 권한/,
  );
  assert.doesNotMatch(host.textContent, /함께 만드는 문제|author@example.test/);
});
test('pending responses cannot leak metadata after permission loss or account changes', async () => {
  let release;
  respond = () =>
    new Promise((resolve) => {
      release = resolve;
    });
  await render();
  user = { ...user, is_service_master: false };
  await render();
  assert.equal(calls[0].options.signal.aborted, true);
  await act(async () => release(list()));
  assert.doesNotMatch(host.textContent, /함께 만드는 문제|author@example.test/);
  user = { ...user, id: 'new-master', is_service_master: true };
  respond = async () => list([problem('new')]);
  await render();
  assert.match(host.textContent, /함께 만드는 문제 new/);
  assert.doesNotMatch(host.textContent, /함께 만드는 문제 p/);
});

test('a denied detail hides all directory metadata even while the account claim remains stale', async () => {
  for (const status of [401, 403]) {
    user = { ...user, id: `master-${status}` };
    respond = async () => list();
    await render();
    assert.match(host.textContent, /author@example.test/);
    respond = async () => {
      throw new ApiError(status);
    };
    await click('함께 만드는 문제 p 제작자 상세');
    assert.match(host.textContent, /접근 권한이 변경되었거나 로그인이 만료/);
    assert.doesNotMatch(
      host.textContent,
      /함께 만드는 문제|author@example.test/,
    );
    assert.equal(host.querySelector('dialog'), null);
    const count = calls.length;
    await render();
    assert.equal(calls.length, count);
    assert.doesNotMatch(
      host.textContent,
      /함께 만드는 문제|author@example.test/,
    );
  }
  user = { ...user, id: 'another-master' };
  respond = async () => list([problem('new')]);
  await render();
  assert.match(host.textContent, /함께 만드는 문제 new/);
  assert.equal(host.querySelector('dialog'), null);
});
