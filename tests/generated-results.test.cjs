const { test, beforeEach, afterEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<body></body>', { url: 'http://editor.test' });
global.window = dom.window;
global.document = dom.window.document;
global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { act, createElement: h } = React;
const { createRoot } = require('react-dom/client');
let requests, impl;
const cache = new Map();
function load(relative) {
  const file = path.resolve(__dirname, '../src', relative);
  if (cache.has(file)) return cache.get(file).exports;
  const m = new Module(file, module);
  m.filename = file;
  m.paths = Module._nodeModulePaths(path.dirname(file));
  const native = m.require.bind(m);
  m.require = (id) => {
    if (id.endsWith('/api'))
      return {
        blobPreview: (problem, sha, signal) => {
          requests.push({ problem, sha, signal });
          return impl(sha);
        },
      };
    if (id.endsWith('/ui'))
      return {
        Badge: ({ children }) => h('span', null, children),
        Notice: ({ children }) => h('p', { role: 'status' }, children),
        CodeEditor: ({ label, value, readOnly }) =>
          h('textarea', { 'aria-label': label, value, readOnly }),
      };
    if (id.endsWith('/Downloads'))
      return { BlobDownload: () => null, DownloadActions: () => null };
    if (id.endsWith('/downloads')) return { testDownloads: () => [] };
    if (id.endsWith('/Select'))
      return {
        default: ({ children, ...props }) => h('select', props, children),
      };
    if (id.startsWith('.')) {
      const next = ['.ts', '.tsx']
        .map((ext) => path.resolve(path.dirname(file), id + ext))
        .find(fs.existsSync);
      return load(path.relative(path.resolve(__dirname, '../src'), next));
    }
    return native(id);
  };
  cache.set(file, m);
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
const Preview = load('pages/workspace/GeneratedTestResults.tsx').default;
let root, host;
beforeEach(() => {
  requests = [];
  impl = async (sha) => ({ text: sha, truncated: false, binary: false });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(() => root.unmount());
  host.remove();
});
after(() => dom.window.close());
const job = (tests) => ({ id: 'job', result: { testsets: { tests } } });
async function render(value) {
  await act(async () => {
    root.render(h(Preview, { job: value, problemId: 'p' }));
  });
}
async function click(label) {
  const b = host.querySelector(`[aria-label="${label}"]`);
  assert.ok(b, label);
  await act(async () => b.click());
}

test('switching inputs aborts stale reads and never replaces the newly selected values', async () => {
  const pending = {};
  impl = (sha) =>
    new Promise((resolve) => {
      pending[sha] = resolve;
    });
  await render(
    job([
      { index: 1, input_sha: 'old-in', answer_sha: 'old-out' },
      { index: 2, input_sha: 'new-in', answer_sha: 'new-out' },
    ]),
  );
  await click('tests #2 입력·정답 미리보기');
  assert.ok(requests.slice(0, 2).every((r) => r.signal.aborted));
  await act(async () => {
    for (const sha of ['new-in', 'new-out'])
      pending[sha]({ text: sha, truncated: false, binary: false });
  });
  await act(async () => {
    for (const sha of ['old-in', 'old-out'])
      pending[sha]({ text: sha, truncated: false, binary: false });
  });
  assert.deepEqual(
    [...host.querySelectorAll('textarea')].map((v) => v.value),
    ['new-in', 'new-out'],
  );
  assert.ok([...host.querySelectorAll('textarea')].every((v) => v.readOnly));
});

test('empty, binary, truncated, missing and failed previews each have explicit feedback', async () => {
  impl = async (sha) => {
    if (sha === 'bad') throw new Error('출력을 불러오지 못했습니다.');
    return { text: '', binary: sha === 'binary', truncated: sha === 'large' };
  };
  await render(
    job([
      { index: 1, input_sha: 'empty', answer_sha: 'binary' },
      { index: 2, input_sha: 'large', answer_sha: 'bad' },
      { index: 3 },
    ]),
  );
  assert.match(host.textContent, /빈 파일입니다/);
  assert.match(host.textContent, /텍스트로 표시할 수 없는 파일/);
  await click('tests #2 입력·정답 미리보기');
  assert.match(host.textContent, /앞부분만 표시/);
  assert.match(host.textContent, /출력을 불러오지 못했습니다/);
  await click('tests #3 입력·정답 미리보기');
  assert.match(host.textContent, /아직 생성된 입력이 없습니다/);
  assert.match(host.textContent, /아직 생성된 정답이 없습니다/);
});

test('many generated tests are paginated and only the selected pair is fetched', async () => {
  await render(
    job(
      Array.from({ length: 120 }, (_, i) => ({
        index: i + 1,
        input_sha: 'in' + i,
        answer_sha: 'out' + i,
      })),
    ),
  );
  assert.equal(
    host.querySelectorAll('.generated-test-picker button').length,
    50,
  );
  assert.equal(requests.length, 2);
  await click('생성 테스트 다음 페이지');
  assert.equal(
    host.querySelector('.generated-test-picker button').textContent.trim(),
    '#51',
  );
  assert.equal(requests.length, 2);
  await click('tests #51 입력·정답 미리보기');
  assert.deepEqual(
    requests.slice(-2).map((v) => v.sha),
    ['in50', 'out50'],
  );
});
