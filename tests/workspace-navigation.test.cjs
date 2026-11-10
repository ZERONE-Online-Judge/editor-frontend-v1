const { test, afterEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<body></body>', {
  pretendToBeVisual: true,
  url: 'https://editor.example.test/',
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
function mediaQuery(matches) {
  const listeners = new Set();
  return {
    matches,
    listeners,
    addEventListener: (type, callback) => listeners.add(callback),
    removeEventListener: (type, callback) => listeners.delete(callback),
    set(matches) {
      this.matches = matches;
      for (const listener of listeners) listener({ matches });
    },
  };
}
const desktop = mediaQuery(false);
const hover = mediaQuery(false);
const reducedMotion = mediaQuery(true);
window.matchMedia = (query) => {
  if (query === '(min-width: 768px)') return desktop;
  if (query === '(hover: hover) and (pointer: fine)') return hover;
  if (query === '(prefers-reduced-motion: reduce)') return reducedMotion;
  throw new Error(`Unexpected media query: ${query}`);
};
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
  loaded.require = (id) =>
    mocks[id] ||
    (id.endsWith('/largeText')
      ? load('lib/largeText.ts')
      : id.endsWith('/textFormat')
        ? load('lib/textFormat.ts')
        : native(id));
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
  hover.matches = false;
  reducedMotion.matches = true;
  window.localStorage.clear();
  for (const query of [desktop, hover, reducedMotion])
    assert.equal(query.listeners.size, 0);
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
    rail: () => host.querySelector('.workspace-navigation-rail'),
    navigation: () => host.querySelector('.workspace-navigation'),
    pin: () => host.querySelector('.workspace-sidebar-toggle'),
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
  assert.equal(
    v.toggle().getAttribute('aria-label'),
    '작업 메뉴 열기 · 테스트 · 생성 스크립트',
  );
  assert.equal(v.toggle().getAttribute('aria-expanded'), 'false');
  assert.equal(v.host.querySelector('dialog'), null);
  const dialog = await v.open();
  assert.equal(v.toggle().getAttribute('aria-expanded'), 'true');
  assert.equal(dialog.querySelectorAll('nav a').length, 18);
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
  const links = [...dialog.querySelectorAll('a')];
  const singleIndex = links.findIndex((link) =>
    link.getAttribute('href').endsWith('/verification-single'),
  );
  assert.ok(singleIndex >= 0);
  assert.ok(
    links[singleIndex + 1].getAttribute('href').endsWith('/verification'),
  );
  await act(async () => links[singleIndex].click());
  assert.equal(v.host.querySelector('dialog'), null);
  assert.match(v.toggle().getAttribute('aria-label'), /단일 검증/);
  dialog = await v.open();
  await act(async () =>
    dialog.querySelector('a[href$="/verification"]').click(),
  );
  assert.equal(v.host.querySelector('dialog'), null);
  assert.match(v.toggle().getAttribute('aria-label'), /전체 검증/);
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
  assert.match(v.toggle().getAttribute('aria-label'), /테스트 · 생성 스크립트/);
});

test('Returning to desktop dismisses the drawer and releases background scrolling', async () => {
  const v = await mount();
  document.body.style.overflow = 'clip';
  await v.open();
  await act(async () => {
    desktop.set(true);
  });
  assert.equal(v.host.querySelector('dialog'), null);
  assert.equal(document.body.style.overflow, 'clip');
  document.body.style.overflow = '';
  assert.equal(v.host.querySelectorAll('.problem-sidebar a').length, 18);
});

function pointer(target, type, pointerType = 'mouse', relatedTarget = null) {
  const event = new window.MouseEvent(type, {
    bubbles: true,
    relatedTarget,
  });
  Object.defineProperty(event, 'pointerType', { value: pointerType });
  target.dispatchEvent(event);
}

async function press(target, pointerType = 'touch') {
  await act(async () => {
    pointer(target, 'pointerdown', pointerType);
    target.focus();
    pointer(target, 'pointerup', pointerType);
    target.click();
  });
}

test('Desktop icon navigation opens on fine-pointer hover and closes on exit', async () => {
  desktop.matches = true;
  hover.matches = true;
  const v = await mount();
  assert.equal(v.navigation().getAttribute('data-expanded'), 'false');
  assert.equal(v.pin().getAttribute('aria-pressed'), 'false');
  assert.equal(v.pin().getAttribute('aria-label'), '작업 메뉴 고정');
  await act(async () => pointer(v.rail(), 'pointerover'));
  assert.equal(v.navigation().getAttribute('data-expanded'), 'true');
  await act(async () =>
    pointer(v.rail(), 'pointerout', 'mouse', document.body),
  );
  assert.equal(v.navigation().getAttribute('data-expanded'), 'false');
  assert.equal(
    window.localStorage.getItem('zoj.editor.sidebarCollapsed'),
    null,
  );
});

test('Touch-only tablet navigation pins and collapses by click without hover', async () => {
  desktop.matches = true;
  const v = await mount();
  await act(async () => pointer(v.rail(), 'pointerover', 'touch'));
  assert.equal(v.navigation().getAttribute('data-expanded'), 'false');
  await act(async () => pointer(v.rail(), 'pointerover', 'mouse'));
  assert.equal(v.navigation().getAttribute('data-expanded'), 'false');
  await press(v.pin());
  assert.equal(v.navigation().getAttribute('data-expanded'), 'true');
  assert.equal(v.pin().getAttribute('aria-label'), '작업 메뉴 접기');
  assert.equal(v.pin().getAttribute('aria-pressed'), 'true');
  assert.equal(
    window.localStorage.getItem('zoj.editor.sidebarCollapsed'),
    'false',
  );
  await press(v.pin());
  assert.equal(v.pin().getAttribute('aria-pressed'), 'false');
  assert.equal(v.navigation().getAttribute('data-expanded'), 'false');
  assert.equal(
    window.localStorage.getItem('zoj.editor.sidebarCollapsed'),
    'true',
  );
  const link = v.rail().querySelector('a[aria-current="page"]');
  await act(async () => {
    v.pin().dispatchEvent(
      new window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true }),
    );
    link.focus();
  });
  assert.equal(v.navigation().getAttribute('data-expanded'), 'true');
  assert.equal(v.pin().getAttribute('aria-pressed'), 'false');
});

test('Pinned navigation survives remount while hover never changes the preference', async () => {
  desktop.matches = true;
  hover.matches = true;
  let v = await mount();
  await press(v.pin(), 'mouse');
  await v.close();
  v = await mount();
  assert.equal(v.pin().getAttribute('aria-pressed'), 'true');
  await act(async () =>
    pointer(v.rail(), 'pointerout', 'mouse', document.body),
  );
  assert.equal(v.navigation().getAttribute('data-expanded'), 'true');
});

test('Keyboard focus expands the icon navigation until focus leaves it', async () => {
  desktop.matches = true;
  const v = await mount();
  await act(async () => v.pin().focus());
  assert.equal(v.navigation().getAttribute('data-expanded'), 'true');
  assert.equal(v.pin().getAttribute('aria-pressed'), 'false');
  const link = v.rail().querySelector('a[aria-current="page"]');
  await act(async () => link.focus());
  assert.equal(v.navigation().getAttribute('data-expanded'), 'true');
  await act(async () => link.blur());
  assert.equal(v.navigation().getAttribute('data-expanded'), 'false');
});

test('Mobile closing animates while keeping the background locked, then restores focus', async () => {
  reducedMotion.matches = false;
  const v = await mount();
  const dialog = await v.open();
  await act(async () =>
    dialog.querySelector('button[aria-label="닫기"]').click(),
  );
  assert.equal(v.toggle().getAttribute('aria-expanded'), 'false');
  assert.equal(
    v.host
      .querySelector('.workspace-menu-modal')
      .classList.contains('is-closing'),
    true,
  );
  assert.equal(document.body.style.overflow, 'hidden');
  await act(
    async () => new Promise((resolve) => window.setTimeout(resolve, 220)),
  );
  assert.equal(v.host.querySelector('dialog'), null);
  assert.equal(document.body.style.overflow, '');
  assert.equal(document.activeElement, v.toggle());
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
