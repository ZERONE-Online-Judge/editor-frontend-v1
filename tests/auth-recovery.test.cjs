const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<body></body>', {
  url: 'https://editor.zoj.kr/login?next=%2Fproblems%2Fdemo',
  pretendToBeVisual: true,
});
global.window = dom.window;
global.document = dom.window.document;
global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
let handler, controls, requests, redirects, moves, streams;
class ApiError extends Error {
  constructor(status) {
    super('Request failed');
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
const router = {
  Navigate: ({ to }) => {
    React.useEffect(() => {
      redirects.push(to);
    }, [to]);
    return React.createElement('p', null, 'Redirecting to ' + to);
  },
  Outlet: () =>
    React.createElement('p', { 'data-workspace': true }, 'Protected workspace'),
  useLocation: () => ({
    pathname: '/problems/demo/tests',
    search: '?page=2',
    hash: '#test-3',
  }),
};
const cache = new Map();
function source(relative) {
  const file = path.resolve(__dirname, '../src', relative);
  if (cache.has(file)) return cache.get(file).exports;
  const loaded = new Module(file, module);
  loaded.filename = file;
  loaded.paths = Module._nodeModulePaths(path.dirname(file));
  const native = loaded.require.bind(loaded);
  loaded.require = (id) => {
    if (id === 'react-router-dom') return router;
    if (id.endsWith('/api'))
      return {
        ApiError,
        api: (url, options = {}) => {
          requests.push({ url, options });
          return handler(url, options);
        },
        post: async () => ({}),
      };
    if (id.endsWith('/sharedLogin'))
      return {
        editorReturnPath: () => '/problems/demo',
        sharedLoginUrl: () => '/api/auth/redirect?next=%2Fproblems%2Fdemo',
        redirectToSharedLogin: () => moves.push('central'),
      };
    if (id.endsWith('/LocalLogin'))
      return {
        __esModule: true,
        default: () => React.createElement('p', null, 'Local login'),
      };
    if (id.startsWith('.')) {
      const resolved = ['.ts', '.tsx']
        .map((ext) => path.resolve(path.dirname(file), id + ext))
        .find((candidate) => fs.existsSync(candidate));
      assert.ok(resolved, `Could not resolve ${id}`);
      return source(path.relative(path.resolve(__dirname, '../src'), resolved));
    }
    return native(id);
  };
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
const { AuthProvider } = source('lib/auth.tsx');
const { useAuth } = source('lib/authContext.ts');
const { AUTH_REQUEST_TIMEOUT_MS } = source('lib/authRequest.ts');
const Guard = source('components/AuthGuard.tsx').default;
const Login = source('pages/Login.tsx').default;
function deadlineClock() {
  const originalSet = global.setTimeout,
    originalClear = global.clearTimeout;
  const timers = new Map();
  global.setTimeout = (callback, delay, ...args) => {
    if (delay !== AUTH_REQUEST_TIMEOUT_MS)
      return originalSet(callback, delay, ...args);
    const id = {};
    timers.set(id, () => callback(...args));
    return id;
  };
  global.clearTimeout = (id) => {
    if (!timers.delete(id)) originalClear(id);
  };
  return {
    get pending() {
      return timers.size;
    },
    expire: async () =>
      act(async () => {
        const pending = [...timers.values()];
        timers.clear();
        for (const callback of pending) callback();
      }),
    close: () => {
      global.setTimeout = originalSet;
      global.clearTimeout = originalClear;
      assert.equal(timers.size, 0, 'Deadline timers must be cleaned up');
    },
  };
}
async function mount(Component = Guard) {
  requests = [];
  redirects = [];
  moves = [];
  streams = [];
  function Probe() {
    controls = useAuth();
    return null;
  }
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () =>
    root.render(
      React.createElement(
        AuthProvider,
        null,
        React.createElement(Probe),
        React.createElement(Component),
      ),
    ),
  );
  return {
    host,
    close: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}
const user = {
  id: 'editor',
  account_id: 'central',
  email: 'author@example.com',
  display_name: 'Author',
};
after(() => {
  delete global.EventSource;
  dom.window.close();
});

test('a stuck initial check reaches a recoverable error in 12 seconds and aborts the request', async () => {
  const clock = deadlineClock();
  handler = () => new Promise(() => {});
  const view = await mount();
  try {
    assert.equal(controls.loading, true);
    assert.match(view.host.textContent, /계정을 확인하고 있습니다/);
    assert.equal(redirects.length, 0);
    await clock.expire();
    assert.equal(controls.loading, false);
    assert.match(
      view.host.querySelector('[role="alert"]').textContent,
      /응답이 늦어지고/,
    );
    assert.equal(requests[0].options.signal.aborted, true);
    assert.equal(redirects.length, 0);
    assert.equal(moves.length, 0);
    assert.equal(view.host.querySelector('a'), null);
  } finally {
    await view.close();
    clock.close();
  }
});

test('retry stays on the requested page and a recovered login opens the workspace', async () => {
  const clock = deadlineClock();
  handler = async () => {
    throw new ApiError(503);
  };
  const view = await mount();
  try {
    assert.ok(controls.connectionError);
    assert.equal(redirects.length, 0);
    handler = async () => user;
    await act(async () => view.host.querySelector('button').click());
    assert.equal(controls.user, user);
    assert.equal(controls.loading, false);
    assert.equal(controls.connectionError, null);
    assert.ok(view.host.querySelector('[data-workspace]'));
    assert.equal(redirects.length, 0);
    assert.equal(requests.filter(({ url }) => url === '/auth/me').length, 2);
    assert.equal(clock.pending, 0);
  } finally {
    await view.close();
    clock.close();
  }
});

test('only an actual 401 redirects a protected page, preserving its complete destination', async () => {
  const clock = deadlineClock();
  handler = async () => {
    throw new ApiError(401);
  };
  const view = await mount();
  try {
    assert.equal(controls.connectionError, null);
    assert.equal(controls.loading, false);
    assert.deepEqual(redirects, [
      '/login?next=%2Fproblems%2Fdemo%2Ftests%3Fpage%3D2%23test-3',
    ]);
    assert.equal(view.host.querySelector('[role="alert"]'), null);
  } finally {
    await view.close();
    clock.close();
  }
});

test('initial network errors and non-401 HTTP errors never become an anonymous login redirect', async () => {
  const clock = deadlineClock();
  for (const failure of [
    new TypeError('Network error'),
    new ApiError(403),
    new ApiError(500),
    new ApiError(503),
  ]) {
    handler = async () => {
      throw failure;
    };
    const view = await mount(Login);
    try {
      assert.equal(controls.loading, false);
      assert.ok(controls.connectionError);
      assert.ok(view.host.querySelector('[role="alert"]'));
      assert.deepEqual(
        requests.map(({ url }) => url),
        ['/auth/me'],
      );
      assert.equal(moves.length, 0);
      assert.equal(view.host.querySelector('a'), null);
      await act(async () =>
        window.dispatchEvent(new window.Event('zoj-central-login-required')),
      );
      assert.equal(moves.length, 0);
    } finally {
      await view.close();
    }
  }
  clock.close();
});

test('a 401 reaches the existing central login flow only after account verification completes', async () => {
  const clock = deadlineClock();
  let rejectAccount;
  handler = (url) =>
    url === '/auth/me'
      ? new Promise((_, reject) => {
          rejectAccount = reject;
        })
      : Promise.resolve({ mode: 'zoj' });
  const view = await mount(Login);
  try {
    assert.deepEqual(
      requests.map(({ url }) => url),
      ['/auth/me'],
    );
    assert.equal(view.host.querySelector('a'), null);
    await act(async () => rejectAccount(new ApiError(401)));
    assert.deepEqual(
      requests.map(({ url }) => url),
      ['/auth/me', '/auth/config'],
    );
    assert.deepEqual(moves, ['central']);
  } finally {
    await view.close();
    clock.close();
  }
});

test('a stalled login configuration check also times out and can be retried without a redirect loop', async () => {
  const clock = deadlineClock();
  handler = (url) =>
    url === '/auth/me'
      ? Promise.reject(new ApiError(401))
      : new Promise(() => {});
  const view = await mount(Login);
  try {
    assert.equal(clock.pending, 1);
    await clock.expire();
    assert.match(view.host.textContent, /로그인 연결을 확인하지 못했습니다/);
    assert.equal(view.host.querySelector('a'), null);
    assert.equal(moves.length, 0);
    assert.equal(requests.at(-1).options.signal.aborted, true);
    handler = async () => ({ mode: 'zoj' });
    await act(async () => view.host.querySelector('button').click());
    assert.deepEqual(moves, ['central']);
  } finally {
    await view.close();
    clock.close();
  }
});

test('late success from a timed-out attempt cannot overwrite a recovered account', async () => {
  const clock = deadlineClock();
  let resolveOld;
  handler = () =>
    new Promise((resolve) => {
      resolveOld = resolve;
    });
  const view = await mount();
  try {
    await clock.expire();
    handler = async () => user;
    await act(async () => view.host.querySelector('button').click());
    await act(async () =>
      resolveOld({ ...user, id: 'old', email: 'old@example.com' }),
    );
    assert.equal(controls.user, user);
    assert.equal(controls.connectionError, null);
    assert.ok(view.host.querySelector('[data-workspace]'));
  } finally {
    await view.close();
    clock.close();
  }
});

test('manual authentication wins over old failures and logout wins over pending focus checks', async () => {
  const clock = deadlineClock();
  let rejectBoot, resolveFocus;
  handler = () =>
    new Promise((_, reject) => {
      rejectBoot = reject;
    });
  const view = await mount();
  try {
    await act(async () => controls.setUser(user));
    await act(async () => rejectBoot(new ApiError(503)));
    assert.equal(controls.user, user);
    assert.equal(controls.connectionError, null);
    handler = () =>
      new Promise((resolve) => {
        resolveFocus = resolve;
      });
    await act(async () => window.dispatchEvent(new window.Event('focus')));
    await act(async () => controls.logout());
    await act(async () => resolveFocus(user));
    assert.equal(controls.user, null);
    assert.equal(controls.connectionError, null);
    assert.ok(streams.every((stream) => stream.closed));
  } finally {
    await view.close();
    clock.close();
  }
});

test('a focus timeout preserves the known account and does not block a later refresh', async () => {
  const clock = deadlineClock();
  handler = async () => user;
  const view = await mount();
  try {
    handler = () => new Promise(() => {});
    await act(async () => window.dispatchEvent(new window.Event('focus')));
    await clock.expire();
    assert.equal(controls.user, user);
    assert.equal(controls.connectionError, null);
    assert.ok(view.host.querySelector('[data-workspace]'));
    handler = async () => ({ ...user, display_name: 'Refreshed' });
    await act(async () => window.dispatchEvent(new window.Event('focus')));
    assert.equal(controls.user.display_name, 'Refreshed');
  } finally {
    await view.close();
    clock.close();
  }
});

test('unmount aborts pending account requests and cleans every timeout', async () => {
  const clock = deadlineClock();
  handler = () => new Promise(() => {});
  const view = await mount();
  const signal = requests[0].options.signal;
  await view.close();
  assert.equal(signal.aborted, true);
  clock.close();
});

test('retry invalidates an older focus response and new focus checks wait for the retry result', async () => {
  const clock = deadlineClock();
  handler = () => new Promise(() => {});
  const view = await mount();
  try {
    await clock.expire();
    let resolveOldFocus, rejectRetry;
    handler = () =>
      new Promise((resolve) => {
        resolveOldFocus = resolve;
      });
    await act(async () => window.dispatchEvent(new window.Event('focus')));
    handler = () =>
      new Promise((_, reject) => {
        rejectRetry = reject;
      });
    await act(async () => {
      controls.retryAuthentication();
      window.dispatchEvent(new window.Event('focus'));
    });
    assert.equal(
      requests.length,
      3,
      'A retry must not start a competing focus check',
    );
    await act(async () => resolveOldFocus(user));
    assert.equal(controls.user, null);
    assert.equal(controls.loading, true);
    await act(async () => rejectRetry(new ApiError(401)));
    assert.equal(controls.user, null);
    assert.equal(controls.loading, false);
    assert.equal(controls.connectionError, null);
    assert.equal(redirects.length, 1);
  } finally {
    await view.close();
    clock.close();
  }
});

test('focus cannot overtake an unfinished initial account check', async () => {
  const clock = deadlineClock();
  let rejectBoot;
  handler = () =>
    new Promise((_, reject) => {
      rejectBoot = reject;
    });
  const view = await mount();
  try {
    await act(async () => window.dispatchEvent(new window.Event('focus')));
    assert.equal(requests.length, 1);
    await act(async () => rejectBoot(new ApiError(401)));
    assert.equal(controls.user, null);
    assert.equal(controls.connectionError, null);
    assert.equal(redirects.length, 1);
  } finally {
    await view.close();
    clock.close();
  }
});
