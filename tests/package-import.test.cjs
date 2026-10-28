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
let requests, failure, archiveLimit, compatibility, applyFailure;
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
    if (id.endsWith('.css')) return {};
    if (id.endsWith('/authContext'))
      return { useAuth: () => ({ user: { id: 'owner', handle: 'author' } }) };
    if (id.endsWith('/api'))
      return {
        api: async (url, options = {}) => {
          requests.push({ url, options });
          if (url === '/imports/limits')
            return {
              archive_bytes: archiveLimit,
              entry_bytes: 16 * 1024 ** 2,
              uncompressed_bytes: 16 * 1024 ** 3,
            };
          if (url.startsWith('/imports?')) {
            if (failure) throw new Error('가져오기 실패: 중복 파일명');
            return {
              id: 'imported',
              document_hash: 'a'.repeat(64),
              import_report: {
                ...report,
                ...(compatibility ? { zoj_compatibility: compatibility } : {}),
              },
            };
          }
          if (url === '/problems/imported/import-language-settings') {
            if (applyFailure)
              throw new Error(
                '문제에 새 변경이 있습니다. 문제를 열어 현재 언어 설정을 확인하세요.',
              );
            return {
              revision: 1,
              applied: JSON.parse(options.body).changes.length,
            };
          }
          if (url.startsWith('/problems?') || url === '/folders') return [];
          throw new Error('Unexpected request ' + url);
        },
        bytes: (value) =>
          value >= 1024 ** 2 ? `${value / 1024 ** 2}MiB` : '1 KiB',
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
  const location = Router.useLocation();
  return h('output', { id: 'location' }, location.pathname + location.search);
}
async function click(host, text) {
  const button = [...host.querySelectorAll('button')].find(
    (el) => el.textContent.trim() === text,
  );
  assert.ok(button, text);
  await act(async () => button.click());
}
async function setup(limit = 2 * 1024 ** 3, plan = null, entry = '/problems') {
  archiveLimit = limit;
  compatibility = plan;
  applyFailure = false;
  requests = [];
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () =>
    root.render(
      h(
        Router.MemoryRouter,
        { initialEntries: [entry] },
        h(Location),
        h(Problems),
      ),
    ),
  );
  if (!entry.includes('action=import')) await click(host, '패키지 가져오기');
  assert.match(host.textContent, /ZIP 최대/);
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
test('An import link opens the dialog without uploading and is consumed when dismissed', async () => {
  const { host, close } = await setup(
    2 * 1024 ** 3,
    null,
    '/problems?folder=root&action=import',
  );
  assert.match(host.querySelector('dialog').textContent, /Polygon Linux ZIP/);
  assert.equal(
    requests.some((r) => r.options.method === 'POST'),
    false,
  );
  await click(host, '취소');
  assert.equal(host.querySelector('dialog'), null);
  assert.equal(
    host.querySelector('#location').textContent,
    '/problems?folder=root',
  );
  await click(host, '패키지 가져오기');
  assert.ok(host.querySelector('dialog'));
  await close();
});
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
test('Upload limits come from the server and oversized ZIP files are rejected before POST', async () => {
  failure = false;
  const { host, close } = await setup(64 * 1024 ** 2);
  try {
    assert.match(host.textContent, /ZIP 최대 64MiB/);
    const file = new window.File(['fixture'], 'oversized.zip');
    Object.defineProperty(file, 'size', { value: 65 * 1024 ** 2 });
    await act(async () => {
      const input = host.querySelector('input[type=file]');
      Object.defineProperty(input, 'files', {
        configurable: true,
        value: [file],
      });
      input.dispatchEvent(new window.Event('change', { bubbles: true }));
    });
    const submit = [...host.querySelectorAll('button')].find(
      (button) => button.textContent.trim() === '문제 등록',
    );
    assert.equal(submit.disabled, true);
    assert.match(host.querySelector('[role=alert]').textContent, /64MiB/);
    assert.equal(
      requests.filter((row) => row.url.startsWith('/imports?')).length,
      0,
    );
  } finally {
    await close();
  }
});

const languagePlan = {
  changes: [
    {
      kind: 'solution',
      name: 'wrong.cpp',
      from_language: 'cpp20',
      from_label: 'C++20',
      to_language: 'cpp17',
      to_label: 'C++17',
    },
    {
      kind: 'checker',
      name: 'check.c',
      from_language: 'c17',
      from_label: 'C17',
      to_language: 'c99',
      to_label: 'C99',
    },
  ],
  issues: [],
};

test('Import asks for explicit per-file confirmation and applies only checked language settings', async () => {
  failure = false;
  const { host, close } = await setup(undefined, languagePlan);
  try {
    await click(host, '문제 등록');
    assert.match(
      host.querySelector('dialog').textContent,
      /ZOJ 채점기 호환성 맞추기/,
    );
    assert.match(host.textContent, /wrong.cpp.*C\+\+20.*C\+\+17/);
    assert.match(host.textContent, /check.c.*C17.*C99/);
    assert.match(host.textContent, /원본은 r0/);
    assert.equal(
      requests.filter((row) => row.url.endsWith('/import-language-settings'))
        .length,
      0,
    );
    const checker = host.querySelector('[aria-label="check.c 언어 변경"]');
    assert.equal(checker.checked, true);
    await act(async () => checker.click());
    await click(host, '선택한 1개 적용 후 열기');
    const request = requests.find((row) =>
      row.url.endsWith('/import-language-settings'),
    );
    assert.equal(request.options.method, 'POST');
    assert.deepEqual(JSON.parse(request.options.body), {
      document_hash: 'a'.repeat(64),
      changes: [{ kind: 'solution', name: 'wrong.cpp', language: 'cpp17' }],
    });
    assert.equal(
      host.querySelector('#location').textContent,
      '/problems/imported/overview',
    );
  } finally {
    await close();
  }
});

test('Imported code can keep its original language without any language update request', async () => {
  failure = false;
  const { host, close } = await setup(undefined, languagePlan);
  try {
    await click(host, '문제 등록');
    await click(host, '현재 언어로 열기');
    assert.equal(
      requests.filter((row) => row.url.endsWith('/import-language-settings'))
        .length,
      0,
    );
    assert.equal(
      host.querySelector('#location').textContent,
      '/problems/imported/overview',
    );
  } finally {
    await close();
  }
});

test('Stale language updates keep the selection and existing import available without uploading again', async () => {
  failure = false;
  const { host, close } = await setup(undefined, languagePlan);
  try {
    await click(host, '문제 등록');
    applyFailure = true;
    await click(host, '선택한 2개 적용 후 열기');
    assert.match(host.querySelector('[role=alert]').textContent, /새 변경/);
    assert.equal(
      host.querySelector('[aria-label="wrong.cpp 언어 변경"]').checked,
      true,
    );
    assert.equal(host.querySelector('#location').textContent, '/problems');
    assert.equal(
      requests.filter((row) => row.url.startsWith('/imports?')).length,
      1,
    );
    await click(host, '현재 언어로 열기');
    assert.equal(
      host.querySelector('#location').textContent,
      '/problems/imported/overview',
    );
  } finally {
    await close();
  }
});

test('Unconvertible checker languages remain unselected and cannot be blindly changed', async () => {
  failure = false;
  const { host, close } = await setup(undefined, {
    changes: [
      {
        kind: 'checker',
        name: 'check.kt',
        from_language: 'kotlin',
        from_label: 'Kotlin',
        to_language: null,
        to_label: null,
      },
    ],
    issues: [],
  });
  try {
    await click(host, '문제 등록');
    assert.equal(
      host.querySelector('[aria-label="check.kt 언어 변경"]').disabled,
      true,
    );
    const apply = [...host.querySelectorAll('button')].find(
      (button) => button.textContent.trim() === '선택한 0개 적용 후 열기',
    );
    assert.equal(apply.disabled, true);
    assert.match(host.textContent, /자동 변경 제안 없음/);
    await click(host, '현재 언어로 열기');
    assert.equal(
      requests.filter((row) => row.url.endsWith('/import-language-settings'))
        .length,
      0,
    );
  } finally {
    await close();
  }
});
after(() => dom.window.close());
