const { test, afterEach, after } = require('node:test');
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
const desktopListeners = new Set();
const desktop = {
  matches: false,
  addEventListener: (type, callback) => desktopListeners.add(callback),
  removeEventListener: (type, callback) => desktopListeners.delete(callback),
};
window.matchMedia = () => desktop;
const React = require('react');
const { act, createElement: h } = React;
const { createRoot } = require('react-dom/client');
const Router = require('react-router-dom');
function load(relative, mocks = {}) {
  const filename = path.resolve(__dirname, '../src', relative);
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const native = loaded.require.bind(loaded);
  loaded.require = (id) => mocks[id] || native(id);
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
const Navigation = load('components/WorkspaceNavigation.tsx', {
  './ui': load('components/ui.tsx'),
}).default;
const cleanup = new Set();
afterEach(async () => {
  for (const close of [...cleanup]) await close();
  desktop.matches = false;
  assert.equal(desktopListeners.size, 0);
  assert.equal(document.body.style.overflow, '');
});
after(() => dom.window.close());
async function mount(overrides = {}) {
  let discarded = 0;
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  function Page() {
    const { problemId, tab } = Router.useParams();
    return h(Navigation, {
      key: `${problemId}/${tab}`,
      problemId,
      tab,
      required: 2,
      recommended: 1,
      pendingPreparations: 3,
      busy: false,
      onDiscard: () => discarded++,
      ...overrides,
    });
  }
  await act(async () =>
    root.render(
      h(
        Router.MemoryRouter,
        { initialEntries: ['/problems/demo/tests'] },
        h(
          Router.Routes,
          null,
          h(Router.Route, {
            path: '/problems/:problemId/:tab',
            element: h(Page),
          }),
        ),
      ),
    ),
  );
  const close = async () => {
    await act(async () => root.unmount());
    host.remove();
    cleanup.delete(close);
  };
  cleanup.add(close);
  const toggle = () => host.querySelector('.workspace-menu-toggle');
  return {
    host,
    close,
    toggle,
    discarded: () => discarded,
    open: async () => {
      await act(async () => {
        toggle().focus();
        toggle().click();
      });
      return host.querySelector('dialog[open]');
    },
  };
}

test('Hamburger identifies the current work and opens grouped, active navigation', async () => {
  const v = await mount();
  assert.match(v.toggle().textContent, /테스트 · 검증.*테스트 · 생성 스크립트/);
  assert.equal(v.toggle().getAttribute('aria-expanded'), 'false');
  assert.equal(v.host.querySelector('dialog'), null);
  const dialog = await v.open();
  assert.equal(v.toggle().getAttribute('aria-expanded'), 'true');
  assert.equal(dialog.querySelectorAll('nav a').length, 17);
  assert.equal(dialog.querySelectorAll('.sidebar-group').length, 3);
  assert.match(
    dialog.querySelector('.nav-readiness').textContent,
    /필수 2 · 권장 1/,
  );
  assert.equal(dialog.querySelector('.nav-count').textContent, '미반영 3');
  const selected = dialog.querySelector('a[aria-current=page]');
  assert.equal(selected.getAttribute('href'), '/problems/demo/tests');
  assert.equal(document.activeElement, selected);
  assert.equal(document.body.style.overflow, 'hidden');
});

test('Choosing a task navigates and dismisses the menu, including the current task', async () => {
  const v = await mount();
  let dialog = await v.open();
  await act(async () =>
    dialog.querySelector('a[href$="/verification"]').click(),
  );
  assert.equal(v.host.querySelector('dialog'), null);
  assert.match(v.toggle().textContent, /전체 검증/);
  assert.equal(document.body.style.overflow, '');
  dialog = await v.open();
  await act(async () => dialog.querySelector('a[aria-current=page]').click());
  assert.equal(v.host.querySelector('dialog'), null);
  assert.equal(v.toggle().getAttribute('aria-expanded'), 'false');
});

test('Escape and the close button restore focus without changing the selected task', async () => {
  const v = await mount();
  let dialog = await v.open();
  const cancel = new window.Event('cancel', { cancelable: true });
  await act(async () => dialog.dispatchEvent(cancel));
  assert.equal(cancel.defaultPrevented, true);
  assert.equal(v.host.querySelector('dialog'), null);
  assert.equal(document.activeElement, v.toggle());
  dialog = await v.open();
  await act(async () =>
    dialog.querySelector('button[aria-label="닫기"]').click(),
  );
  assert.equal(v.host.querySelector('dialog'), null);
  assert.equal(document.activeElement, v.toggle());
  assert.match(v.toggle().textContent, /테스트 · 생성 스크립트/);
});

test('Returning to desktop dismisses the drawer and releases background scrolling', async () => {
  const v = await mount();
  document.body.style.overflow = 'clip';
  await v.open();
  await act(async () => {
    desktop.matches = true;
    for (const listener of desktopListeners) listener();
  });
  assert.equal(v.host.querySelector('dialog'), null);
  assert.equal(document.body.style.overflow, 'clip');
  document.body.style.overflow = '';
  assert.equal(v.host.querySelectorAll('.problem-sidebar a').length, 17);
});

test('Revert stays available in the menu and respects the busy state', async () => {
  const v = await mount();
  const dialog = await v.open();
  await act(async () => dialog.querySelector('.sidebar-bottom button').click());
  assert.equal(v.discarded(), 1);
  assert.equal(v.host.querySelector('dialog'), null);
  await v.close();
  const busy = await mount({ busy: true });
  const busyDialog = await busy.open();
  assert.equal(
    busyDialog.querySelector('.sidebar-bottom button').disabled,
    true,
  );
  await act(async () =>
    busyDialog.querySelector('.sidebar-bottom button').click(),
  );
  assert.equal(busy.discarded(), 0);
});
