const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<body></body>', {
  pretendToBeVisual: true,
  url: 'https://editor.zoj.kr',
});
global.window = dom.window;
global.document = dom.window.document;
global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const context = React.createContext(null);
let handler,
  controls,
  streams = [];
class ApiError extends Error {
  constructor(status) {
    super('failed');
    this.status = status;
  }
}
class Stream {
  constructor() {
    this.listeners = {};
    streams.push(this);
  }
  addEventListener(name, callback) {
    this.listeners[name] = callback;
  }
  close() {
    this.closed = true;
  }
}
global.EventSource = Stream;
const mocks = {
  './api': { api: () => handler(), post: async () => ({}), ApiError },
  './authContext': { AuthContext: context },
};
const file = path.resolve(__dirname, '../src/lib/auth.tsx');
const loaded = new Module(file, module);
loaded.filename = file;
loaded.paths = Module._nodeModulePaths(path.dirname(file));
const native = loaded.require.bind(loaded);
loaded.require = (id) => mocks[id] || native(id);
loaded._compile(
  ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText,
  file,
);
function View() {
  controls = React.useContext(context);
  return React.createElement('p', null, controls.user?.email || 'anonymous');
}
async function mount() {
  streams = [];
  const div = document.createElement('div');
  document.body.append(div);
  const root = createRoot(div);
  await act(async () =>
    root.render(
      React.createElement(
        loaded.exports.AuthProvider,
        null,
        React.createElement(View),
      ),
    ),
  );
  return async () => {
    await act(async () => root.unmount());
    div.remove();
  };
}
const user = {
  id: 'local',
  account_id: 'central',
  email: 'shared@example.com',
  handle: 'author',
  display_name: 'Shared',
};
test('Focus restores another service login and transient outages preserve it', async () => {
  handler = async () => {
    throw new ApiError(401);
  };
  const close = await mount();
  assert.equal(controls.user, null);
  handler = async () => user;
  await act(async () => window.dispatchEvent(new window.Event('focus')));
  assert.equal(controls.user.email, user.email);
  handler = async () => {
    throw new ApiError(503);
  };
  await act(async () => window.dispatchEvent(new window.Event('focus')));
  assert.equal(controls.user.email, user.email);
  await close();
});
test('Central revocation logs out the active Editor view', async () => {
  handler = async () => user;
  const close = await mount();
  assert.equal(streams.length, 1);
  handler = async () => {
    throw new ApiError(401);
  };
  await act(async () => streams[0].listeners.session_revoked());
  assert.equal(controls.user, null);
  assert.equal(streams[0].closed, true);
  await close();
});
test('An old boot request cannot overwrite a manually completed login', async () => {
  let resolve;
  handler = () =>
    new Promise((r) => {
      resolve = r;
    });
  const close = await mount();
  await act(async () => controls.setUser(user));
  await act(async () => resolve({ ...user, email: 'previous@example.com' }));
  assert.equal(controls.user.email, user.email);
  await close();
});
after(() => dom.window.close());
