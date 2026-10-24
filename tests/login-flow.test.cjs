const { test, after } = require('node:test');
const { URLSearchParams } = require('node:url');
const assert = require('node:assert/strict');
const fs = require('node:fs'),
  path = require('node:path'),
  Module = require('node:module'),
  ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<body></body>', {
  pretendToBeVisual: true,
  url: 'https://editor.zoj.kr/login',
});
global.window = dom.window;
global.document = dom.window.document;
global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react'),
  { act } = React;
const { createRoot } = require('react-dom/client');
let available,
  calls = [];
class ApiError extends Error {}
const mocks = {
  'react-router-dom': {
    useSearchParams: () => [new URLSearchParams()],
    Navigate: () => null,
  },
  '../lib/authContext': {
    useAuth: () => ({ user: null, loading: false, setUser: () => {} }),
  },
  '../lib/api': {
    ApiError,
    post: async (url, values) => {
      calls.push({ url, values });
      return url === '/auth/login-options'
        ? { password_available: available }
        : {};
    },
  },
  '../components/ui': {
    Icon: () => null,
    Notice: ({ children }) => React.createElement('p', null, children),
    Modal: () => null,
  },
  './ui': {
    Notice: ({ children }) => React.createElement('p', null, children),
    Modal: () => null,
  },
  './PasswordForm': { __esModule: true, default: () => null },
};
const cache = new Map();
function source(relative) {
  const file = path.resolve(__dirname, '../src', relative);
  if (cache.has(file)) return cache.get(file).exports;
  const loaded = new Module(file, module);
  loaded.filename = file;
  loaded.paths = Module._nodeModulePaths(path.dirname(file));
  const native = loaded.require.bind(loaded);
  loaded.require = (id) =>
    (id.endsWith('.css') ? {} : mocks[id]) ||
    (id.startsWith('.')
      ? source(
          path.relative(
            path.resolve(__dirname, '../src'),
            ['.tsx', '.ts']
              .map((ext) => path.resolve(path.dirname(file), id + ext))
              .find((candidate) => fs.existsSync(candidate)),
          ),
        )
      : native(id));
  cache.set(file, loaded);
  loaded._compile(
    ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText,
    file,
  );
  return loaded.exports;
}
const Login = source('pages/LocalLogin.tsx').default;
async function mount() {
  calls = [];
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(React.createElement(Login)));
  return async () => {
    await act(async () => root.unmount());
    host.remove();
  };
}
async function enterEmail() {
  const input = document.querySelector('input[type=email]');
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    ).set.call(input, 'author@example.com');
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
  await act(async () =>
    document
      .querySelector('form')
      .dispatchEvent(
        new window.Event('submit', { bubbles: true, cancelable: true }),
      ),
  );
}
test('Email first chooses password without sending mail, and offers OTP instead', async () => {
  available = true;
  const close = await mount();
  assert.equal(document.querySelectorAll('input').length, 1);
  assert.equal(document.querySelector('input[type=password]'), null);
  await enterEmail();
  assert.ok(document.querySelector('input[type=password]'));
  assert.deepEqual(
    calls.map((c) => c.url),
    ['/auth/login-options'],
  );
  const fallback = [...document.querySelectorAll('button')].find(
    (b) => b.textContent === '이메일로 대신 로그인',
  );
  assert.ok(fallback);
  await act(async () => fallback.click());
  assert.deepEqual(
    calls.map((c) => c.url),
    ['/auth/login-options', '/auth/code'],
  );
  assert.equal(document.querySelector('input[type=password]'), null);
  assert.ok(document.querySelector('input[autocomplete="one-time-code"]'));
  await close();
});
test('An email without a password proceeds directly to OTP', async () => {
  available = false;
  const close = await mount();
  await enterEmail();
  assert.deepEqual(
    calls.map((c) => c.url),
    ['/auth/login-options', '/auth/code'],
  );
  assert.ok(document.querySelector('input[autocomplete="one-time-code"]'));
  assert.equal(document.querySelector('input[type=password]'), null);
  await close();
});
after(() => dom.window.close());
