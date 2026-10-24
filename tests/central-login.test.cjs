const { URL } = require('node:url');
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'),
  path = require('node:path'),
  Module = require('node:module'),
  ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<body></body>', {
  url: 'https://editor.zoj.kr/login?next=%2Fproblems%2Fabc%2Ffiles%3Ffile%3Dmain.cpp%23source',
});
global.window = dom.window;
global.document = dom.window.document;
global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react'),
  { act } = React,
  { createRoot } = require('react-dom/client');
class ApiError extends Error {
  constructor(status) {
    super('failed');
    this.status = status;
  }
}
function compile(relative, mocks = {}) {
  const file = path.resolve(__dirname, '../src', relative),
    m = new Module(file, module);
  m.filename = file;
  m.paths = Module._nodeModulePaths(path.dirname(file));
  const native = m.require.bind(m);
  m.require = (id) => mocks[id] || native(id);
  m._compile(
    ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText,
    file,
  );
  return m.exports;
}
const helpers = compile('lib/sharedLogin.ts');
let mode, error, moves, calls, user;
const mocks = {
  'react-router-dom': {
    Navigate: (p) => React.createElement('p', null, 'Navigate ' + p.to),
  },
  '../lib/api': {
    api: async (url) => {
      calls.push(url);
      if (error) throw new ApiError(error);
      return { mode };
    },
    ApiError,
  },
  '../lib/authContext': { useAuth: () => ({ user, loading: false }) },
  '../lib/sharedLogin': {
    ...helpers,
    redirectToSharedLogin: () => moves.push(helpers.sharedLoginUrl()),
  },
  './LocalLogin': {
    default: () => React.createElement('p', null, 'Local development login'),
  },
};
for (const mock of Object.values(mocks))
  if ('default' in mock) mock.__esModule = true;
const Login = compile('pages/Login.tsx', mocks).default;
after(() => dom.window.close());
async function mount() {
  moves = [];
  calls = [];
  user = null;
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(React.createElement(Login)));
  return {
    host,
    close: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}
test('Shared mode opens the complete ZOJ flow without collecting email or password in Editor', async () => {
  mode = 'zoj';
  error = null;
  const v = await mount();
  try {
    assert.deepEqual(calls, ['/auth/config']);
    assert.equal(v.host.querySelector('input'), null);
    const url = new URL(moves[0], 'https://editor.zoj.kr');
    assert.equal(url.pathname, '/api/auth/redirect');
    assert.equal(
      url.searchParams.get('next'),
      '/problems/abc/files?file=main.cpp#source',
    );
    assert.match(v.host.textContent, /패스키/);
  } finally {
    await v.close();
  }
});
test('Local mode remains available for independent development', async () => {
  mode = 'local';
  error = null;
  const v = await mount();
  try {
    assert.match(v.host.textContent, /Local development login/);
    assert.equal(moves.length, 0);
  } finally {
    await v.close();
  }
});
test('Auth outages do not silently fall back to a legacy login', async () => {
  error = 503;
  const v = await mount();
  try {
    assert.match(v.host.textContent, /확인하지 못했습니다/);
    assert.doesNotMatch(v.host.textContent, /Local development/);
    assert.equal(moves.length, 0);
  } finally {
    await v.close();
  }
});
test('An old API fallback still redirects when the upgraded server rejects legacy login', async () => {
  error = 404;
  const v = await mount();
  try {
    assert.match(v.host.textContent, /Local development/);
    await act(async () =>
      window.dispatchEvent(new window.Event('zoj-central-login-required')),
    );
    assert.equal(moves.length, 1);
  } finally {
    await v.close();
  }
});
test('Return paths reject external targets and authentication loops', () => {
  for (const route of [
    '//evil.test',
    'https://evil.test',
    '/\\evil.test',
    '/api/auth/redirect',
    '/login',
    '/problems/../../logout',
  ])
    assert.equal(helpers.safeEditorPath(route), '/problems');
});
