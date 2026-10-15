const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<body></body>', { pretendToBeVisual: true });
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
const Router = require('react-router-dom');
let requests, failure;
const report = {
  format: 'polygon',
  files: 8,
  solutions: 2,
  tests: 90,
  statement_languages: ['korean'],
  warnings: ['gen.cpp: 지원하지 않는 언어는 C++20으로 가져왔습니다.'],
  preserved_files: [{ path: 'stresses/001', name: 'polygon-stresses--001' }],
};
const cache = new Map();
function source(relative) {
  const filename = path.resolve(__dirname, '../src', relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const native = loaded.require.bind(loaded);
  loaded.require = (id) => {
    if (id.endsWith('/authContext'))
      return { useAuth: () => ({ user: { id: 'owner', handle: 'author' } }) };
    if (id.endsWith('/api'))
      return {
        api: async (url, options = {}) => {
          requests.push({ url, options });
          if (url.startsWith('/imports?')) {
            if (failure) throw new Error('가져오기 실패: 중복 파일명');
            return { id: 'imported', import_report: report };
          }
          if (url.startsWith('/problems?') || url === '/folders') return [];
          throw new Error('Unexpected request ' + url);
        },
        bytes: () => '1 KiB',
        time: () => '',
      };
    if (id.endsWith('/SharedFolders'))
      return {
        FolderInvitations: () => null,
        NewSharedFolder: () => null,
        SharedFolderMembers: () => null,
      };
    if (id.startsWith('.')) {
      const child = ['.ts', '.tsx']
        .map((ext) => path.resolve(path.dirname(filename), id + ext))
        .find((p) => fs.existsSync(p));
      return source(path.relative(path.resolve(__dirname, '../src'), child));
    }
    return native(id);
  };
  cache.set(filename, loaded);
  loaded._compile(
    ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText,
    filename,
  );
  return loaded.exports;
}
const Problems = source('pages/Problems.tsx').default;
function Location() {
  return h('output', { id: 'location' }, Router.useLocation().pathname);
}
async function click(host, text) {
  const button = [...host.querySelectorAll('button')].find(
    (el) => el.textContent.trim() === text,
  );
  assert.ok(button, text);
  await act(async () => button.click());
}
async function setup() {
  requests = [];
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () =>
    root.render(
      h(
        Router.MemoryRouter,
        { initialEntries: ['/problems'] },
        h(Location),
        h(Problems),
      ),
    ),
  );
  await click(host, '패키지 가져오기');
  const modal = host.querySelector('dialog');
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value',
  ).set;
  await act(async () => {
    const inputs = modal.querySelectorAll('input:not([type=file])');
    ['Imported problem', 'imported-problem'].forEach((value, index) => {
      setter.call(inputs[index], value);
      inputs[index].dispatchEvent(new window.Event('input', { bubbles: true }));
    });
    const file = modal.querySelector('input[type=file]');
    Object.defineProperty(file, 'files', {
      configurable: true,
      value: [new window.File(['fixture'], 'original.zip')],
    });
    file.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
  return {
    host,
    close: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}
test('Import preserves the ZIP and folder request and lets the user inspect conversion details before opening', async () => {
  failure = false;
  const { host, close } = await setup();
  try {
    await click(host, '문제 등록');
    assert.match(host.textContent, /문제 가져오기 완료/);
    assert.match(host.textContent, /90개/);
    assert.match(host.textContent, /C\+\+20/);
    assert.equal(host.querySelector('#location').textContent, '/problems');
    const request = requests.find((row) => row.url.startsWith('/imports?'));
    assert.match(request.url, /name=Imported%20problem&slug=imported-problem/);
    assert.equal(request.options.body.name, 'original.zip');
    assert.equal(request.options.method, 'POST');
    await act(async () =>
      host.querySelector('.package-import-originals summary').click(),
    );
    assert.match(
      host.querySelector('.package-import-originals').textContent,
      /stresses\/001/,
    );
    await click(host, '문제 열기');
    assert.equal(
      host.querySelector('#location').textContent,
      '/problems/imported/overview',
    );
    assert.equal(
      requests.filter((row) => row.url.startsWith('/imports?')).length,
      1,
    );
  } finally {
    await close();
  }
});
test('Failed imports keep the original file and form instead of showing a success report', async () => {
  failure = true;
  const { host, close } = await setup();
  try {
    await click(host, '문제 등록');
    assert.match(host.querySelector('[role=alert]').textContent, /중복 파일명/);
    assert.match(host.textContent, /original.zip/);
    assert.equal(host.querySelector('.package-import-summary'), null);
    assert.equal(host.querySelector('#location').textContent, '/problems');
  } finally {
    await close();
  }
});
after(() => dom.window.close());
