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
const React = require('react');
const { act, createElement: h } = React;
const { createRoot } = require('react-dom/client');
let status, requests, opened;
const mocks = {
  '../lib/api': {
    api: async (path) => {
      requests.push(path);
      return status();
    },
  },
  './ui': { Icon: () => h('svg') },
};
const filename = path.resolve(
  __dirname,
  '../src/components/PasswordSetupGuidance.tsx',
);
const loaded = new Module(filename, module);
loaded.filename = filename;
loaded.paths = Module._nodeModulePaths(path.dirname(filename));
const native = loaded.require.bind(loaded);
loaded.require = (id) => mocks[id] || (id.endsWith('.css') ? {} : native(id));
loaded._compile(
  ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText,
  filename,
);
const Guidance = loaded.exports.default;
async function mount() {
  requests = [];
  opened = 0;
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const render = (user = 'author') =>
    act(async () =>
      root.render(
        user ? h(Guidance, { key: user, onSetup: () => opened++ }) : null,
      ),
    );
  await render();
  return {
    host,
    render,
    close: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}
const button = (view, name) =>
  [...view.host.querySelectorAll('button')].find(
    (item) =>
      item.textContent === name || item.getAttribute('aria-label') === name,
  );
test('Show only after the server confirms a missing password and open settings only on request', async () => {
  status = async () => ({ has_password: false });
  const view = await mount();
  assert.deepEqual(requests, ['/auth/password']);
  assert.ok(view.host.querySelector('[role="status"]'));
  assert.equal(opened, 0);
  await act(async () => button(view, '비밀번호 설정').click());
  assert.equal(opened, 1);
  assert.equal(view.host.querySelector('[role="status"]'), null);
  await view.close();
});
test('Existing passwords and status failures do not show prompts', async () => {
  for (const handler of [
    async () => ({ has_password: true }),
    async () => {
      throw new Error('offline');
    },
  ]) {
    status = handler;
    const view = await mount();
    assert.equal(view.host.querySelector('[role="status"]'), null);
    await view.close();
  }
});
test('Dismiss across navigation rerenders, then show again after a new login', async () => {
  status = async () => ({ has_password: false });
  const view = await mount();
  await act(async () => button(view, '비밀번호 설정 안내 닫기').click());
  await view.render();
  assert.equal(view.host.querySelector('[role="status"]'), null);
  assert.equal(requests.length, 1);
  await view.render(null);
  await view.render();
  assert.ok(view.host.querySelector('[role="status"]'));
  await view.close();
});
test('Ignore a previous account status result after an account switch', async () => {
  let resolvePrevious;
  status = () =>
    new Promise((resolve) => {
      resolvePrevious = resolve;
    });
  const view = await mount();
  const previous = resolvePrevious;
  status = async () => ({ has_password: true });
  await view.render('second-author');
  await act(async () => previous({ has_password: false }));
  assert.equal(view.host.querySelector('[role="status"]'), null);
  await view.close();
});
after(() => dom.window.close());
