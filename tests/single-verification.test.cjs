const { test, beforeEach, afterEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { setImmediate } = require('node:timers');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<body></body>', { url: 'https://editor.test' });
global.window = dom.window;
global.document = dom.window.document;
global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { act, createElement: h } = React;
const { createRoot } = require('react-dom/client');
let workspace,
  environment,
  environmentGate,
  requests,
  revisionGates,
  runs,
  runGate,
  host,
  root;
class ApiError extends Error {}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const set = () => ({ tests: {}, script: '', groups: {} });
const doc = (sets = ['tests']) => ({
  testsets: Object.fromEntries(sets.map((name) => [name, set()])),
  solutions: {
    'saved.cpp': { name: 'saved.cpp', language: 'cpp17', tag: 'OK' },
    'main.cpp': { name: 'main.cpp', language: 'cpp17', tag: 'MA' },
  },
});
const modules = new Map();
function source(relative) {
  const filename = path.resolve(__dirname, '../src', relative);
  if (modules.has(filename)) return modules.get(filename).exports;
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const native = loaded.require.bind(loaded);
  loaded.require = (name) => {
    if (name.endsWith('.css')) return {};
    if (name.endsWith('/workspace')) return { useWorkspace: () => workspace };
    if (name.endsWith('/RecentExecutions'))
      return {
        __esModule: true,
        default: ({ category }) =>
          h('output', { 'data-recent': category }, category),
      };
    if (name.endsWith('/Select'))
      return { __esModule: true, default: (props) => h('select', props) };
    if (name.endsWith('/JudgeCompatibilityNotice'))
      return {
        __esModule: true,
        default: ({ error }) => h('div', { role: 'alert' }, error.message),
      };
    if (name.endsWith('/api'))
      return { ...source('lib/api.ts'), api: get, ApiError };
    if (name.endsWith('/ui'))
      return {
        SectionHeading: ({ title, description }) =>
          h('header', null, h('h2', null, title), description),
        Icon: () => h('span'),
        Notice: ({ children }) => h('div', { role: 'alert' }, children),
        CodeEditor: ({ label, value, onChange, readOnly }) =>
          h(
            'label',
            null,
            label,
            h('textarea', {
              'aria-label': label,
              value,
              readOnly,
              onChange: (e) => onChange(e.target.value),
            }),
          ),
      };
    if (name.startsWith('.')) {
      const target = ['.ts', '.tsx']
        .map((ext) => path.resolve(path.dirname(filename), name + ext))
        .find((file) => fs.existsSync(file));
      return source(path.relative(path.resolve(__dirname, '../src'), target));
    }
    return native(name);
  };
  modules.set(filename, loaded);
  loaded._compile(
    ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    }).outputText,
    filename,
  );
  return loaded.exports;
}
async function get(url) {
  requests.push(url);
  if (url === '/execution-environment')
    return environmentGate ? environmentGate.promise : environment;
  if (revisionGates.has(url)) return revisionGates.get(url).promise;
  if (/\/revisions\//.test(url)) return doc(['committed']);
  throw new Error('Unexpected request: ' + url);
}
const Page = source('pages/workspace/SingleVerification.tsx').default;
const { singleVerificationFilename } = source('lib/singleVerification.ts');
beforeEach(() => {
  environment = { zoj_configured: true, limits: { tests_per_set: 50 } };
  environmentGate = null;
  revisionGates = new Map();
  requests = [];
  runs = [];
  runGate = null;
  workspace = {
    data: {
      problem: { id: 'p', revision: 3, permissions: ['execute', 'edit_tests'] },
    },
    document: doc(),
    busy: false,
    run: async (...args) => {
      runs.push(args);
      return runGate ? runGate.promise : { id: 'job' };
    },
  };
  host = document.createElement('main');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
after(() => dom.window.close());
async function flush() {
  for (let i = 0; i < 3; i++) await act(async () => new Promise(setImmediate));
}
async function render() {
  await act(async () => root.render(h(Page)));
  await flush();
}
const field = (label) => host.querySelector(`[aria-label="${label}"]`);
const button = (text) =>
  [...host.querySelectorAll('button')].find(
    (item) => item.textContent === text,
  );
async function input(label, value) {
  const element = field(label);
  const proto =
    element.tagName === 'TEXTAREA'
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(element, value);
    element.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
}
async function select(label, value) {
  await act(async () => {
    field(label).value = value;
    field(label).dispatchEvent(new window.Event('change', { bubbles: true }));
  });
  await flush();
}
async function click(element) {
  assert.ok(element);
  await act(async () => element.click());
  await flush();
}

test('filename base uses exactly the six ZOJ extensions and rejects directories, dotted names and oversized names', () => {
  for (const [language, extension] of Object.entries({
    c99: '.c',
    cpp17: '.cpp',
    python3: '.py',
    pypy3: '.py',
    java8: '.java',
    kotlin: '.kt',
  }))
    assert.equal(
      singleVerificationFilename(' Main.cpp ', language),
      'Main' + extension,
    );
  for (const base of [
    '',
    '../main',
    'dir/main',
    'dir\\main',
    '.hidden',
    'main.test',
    'main..cpp',
    '한글',
    'a'.repeat(100),
  ])
    assert.throws(() => singleVerificationFilename(base, 'python3'));
});

test('single page offers six common judge languages and only executable expectations, with a single-category history', async () => {
  await render();
  assert.deepEqual(
    [...field('단일 검증 언어').options].map((o) => o.value),
    ['c99', 'cpp17', 'python3', 'pypy3', 'java8', 'kotlin'],
  );
  const tags = [...field('단일 검증 기대 판정').options].map((o) => o.value);
  assert.equal(tags.includes('MA'), false);
  assert.equal(tags.includes('NR'), false);
  assert.equal(tags.includes('PE'), false);
  assert.equal(tags.length, 8);
  assert.ok(host.querySelector('[data-recent="verify-single"]'));
  assert.equal(button('이 코드만 검증').disabled, true);
  await input('단일 검증 파일명', '../secret');
  assert.match(host.textContent, /폴더 경로/);
  await input('검증할 코드', 'print(1)');
  assert.equal(button('이 코드만 검증').disabled, true);
  assert.equal(runs.length, 0);
});

test('pasted code executes as the only temporary target with one extension and guards duplicate clicks until settled', async () => {
  await render();
  await input('단일 검증 파일명', 'review.py');
  await select('단일 검증 언어', 'cpp17');
  await select('단일 검증 기대 판정', 'WA');
  await input('검증할 코드', 'int main() { return 1; }');
  assert.ok(host.textContent.includes('review.cpp'));
  runGate = deferred();
  await act(async () => {
    button('이 코드만 검증').click();
    button('이 코드만 검증')?.click();
  });
  assert.equal(runs.length, 1);
  assert.deepEqual(runs[0], [
    'verify',
    {
      single_verification: true,
      execution_backend: 'zoj',
      snapshot: 'working_copy',
      testset: 'tests',
      testsets: ['tests'],
      test_indices: [],
      verify: true,
      force_prepare: false,
      solutions: ['review.cpp'],
      temporary_solutions: [
        {
          name: 'review.cpp',
          language: 'cpp17',
          tag: 'WA',
          content: 'int main() { return 1; }',
        },
      ],
    },
  ]);
  assert.equal(JSON.stringify(runs).includes('saved.cpp'), false);
  assert.equal(field('검증할 코드').readOnly, true);
  await act(async () => runGate.resolve({ id: 'job' }));
  assert.equal(button('이 코드만 검증').disabled, false);
});

test('execute-only reviewers load committed source and select that source testsets and a parsed test range', async () => {
  workspace.data.problem.permissions = ['execute'];
  const gate = deferred();
  revisionGates.set('/problems/p/revisions/3', gate);
  await render();
  await input('검증할 코드', 'print(1)');
  assert.equal(field('단일 검증 자료').value, 'committed');
  assert.equal(field('단일 검증 자료').options[0].disabled, true);
  assert.equal(button('이 코드만 검증').disabled, true);
  await act(async () => gate.resolve(doc(['committed', 'extra'])));
  await flush();
  await click(field('단일 검증 테스트 세트: committed'));
  await select('단일 검증 테스트 범위', 'range');
  await input('단일 검증 테스트 번호', '3-4, 1');
  await input('단일 검증 파일명', 'Main.java');
  await select('단일 검증 언어', 'java8');
  await click(button('이 코드만 검증'));
  assert.equal(runs[0][1].snapshot, 'committed');
  assert.deepEqual(runs[0][1].testsets, ['committed']);
  assert.deepEqual(runs[0][1].test_indices, [1, 3, 4]);
  assert.equal(runs[0][1].solutions[0], 'Main.java');
});

test('a late committed revision response cannot replace the newer source or enable an unselected testset', async () => {
  const older = deferred(),
    newer = deferred();
  revisionGates.set('/problems/p/revisions/3', older);
  revisionGates.set('/problems/p/revisions/4', newer);
  await render();
  await select('단일 검증 자료', 'committed');
  workspace = {
    ...workspace,
    data: { problem: { ...workspace.data.problem, revision: 4 } },
  };
  await render();
  await act(async () => newer.resolve(doc(['new'])));
  await flush();
  await act(async () => older.resolve(doc(['old'])));
  await flush();
  assert.ok(field('단일 검증 테스트 세트: new'));
  assert.equal(field('단일 검증 테스트 세트: old'), null);
  await input('검증할 코드', 'print(1)');
  assert.equal(button('이 코드만 검증').disabled, true);
  await click(field('단일 검증 테스트 세트: new'));
  assert.equal(button('이 코드만 검증').disabled, false);
});

test('environment loading and failed lookup block requests, and retry can recover without losing pasted code', async () => {
  environmentGate = deferred();
  await render();
  await input('검증할 코드', 'print(1)');
  assert.equal(button('이 코드만 검증').disabled, true);
  await act(async () => environmentGate.reject(new Error('연결 실패')));
  await flush();
  assert.match(host.textContent, /채점 환경을 확인하지 못했습니다/);
  assert.equal(button('이 코드만 검증').disabled, true);
  environmentGate = null;
  await click(button('다시 확인'));
  assert.equal(field('검증할 코드').value, 'print(1)');
  assert.equal(button('이 코드만 검증').disabled, false);
  await click(button('이 코드만 검증'));
  assert.equal(runs.length, 1);
});

test('a different problem resets the temporary form and ignores stale committed data', async () => {
  const old = deferred();
  revisionGates.set('/problems/p/revisions/3', old);
  await render();
  await input('검증할 코드', 'old secret');
  await select('단일 검증 자료', 'committed');
  workspace = {
    ...workspace,
    data: { problem: { id: 'next', revision: 1, permissions: ['execute'] } },
    document: doc(['next']),
  };
  await render();
  await act(async () => old.resolve(doc(['old'])));
  await flush();
  assert.equal(field('검증할 코드').value, '');
  assert.equal(field('단일 검증 파일명').value, 'review');
  assert.equal(field('단일 검증 테스트 세트: old'), null);
  assert.equal(button('이 코드만 검증').disabled, true);
});

test('multiple testsets always send all tests from the selected sets, and a request error allows correction and retry', async () => {
  workspace.document = doc(['tests', 'extra']);
  await render();
  await input('검증할 코드', 'print(1)');
  await select('단일 검증 테스트 범위', 'range');
  await input('단일 검증 테스트 번호', '1-2');
  await click(field('단일 검증 테스트 세트: extra'));
  assert.equal(field('단일 검증 테스트 범위').disabled, true);
  assert.equal(field('단일 검증 테스트 번호'), null);
  runGate = deferred();
  await click(button('이 코드만 검증'));
  assert.deepEqual(runs[0][1].testsets, ['tests', 'extra']);
  assert.deepEqual(runs[0][1].test_indices, []);
  await act(async () =>
    runGate.reject(new Error('실행 대기열이 가득 찼습니다.')),
  );
  assert.match(host.textContent, /실행 대기열이 가득/);
  assert.equal(button('이 코드만 검증').disabled, false);
  runGate = null;
  await click(button('이 코드만 검증'));
  assert.equal(runs.length, 2);
});

test('missing execution permission and an unconfigured judge never start a verification', async () => {
  workspace.data.problem.permissions = [];
  await render();
  assert.equal(field('검증할 코드').readOnly, true);
  assert.equal(button('이 코드만 검증').disabled, true);
  assert.match(host.textContent, /실행 권한이 필요/);
  workspace = {
    ...workspace,
    data: {
      problem: {
        ...workspace.data.problem,
        permissions: ['execute', 'edit_tests'],
      },
    },
  };
  environment = { zoj_configured: false };
  await render();
  await input('검증할 코드', 'print(1)');
  assert.equal(button('이 코드만 검증').disabled, true);
  assert.match(host.textContent, /채점기 연결이 설정되지 않았습니다/);
  assert.equal(runs.length, 0);
});
