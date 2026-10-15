const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { URL } = require('node:url');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<body></body>', { url: 'http://editor.test' });
global.window = dom.window;
global.document = dom.window.document;
global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { act, createElement: h } = React;
const { createRoot } = require('react-dom/client');
function load(relative, mocks = {}) {
  const filename = path.resolve(__dirname, '../src', relative);
  const m = new Module(filename, module);
  m.filename = filename;
  m.paths = Module._nodeModulePaths(path.dirname(filename));
  const native = m.require.bind(m);
  m.require = (id) => mocks[id] || native(id);
  m._compile(
    ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText,
    filename,
  );
  return m.exports;
}
const api = load('lib/api.ts');
const downloads = load('lib/downloads.ts', { './api': api });

test('Test archives keep real file hashes and skip missing generation without substituting display examples', () => {
  const files = downloads.testDownloads('small', [
    {
      index: 2,
      input_sha: 'input',
      answer_sha: 'empty-answer',
      statement_input: 'DISPLAY',
      statement_output: 'DISPLAY',
    },
    { index: 3, input_sha: null, answer_sha: null },
    { index: 4, input_sha: 'input-only', answer_sha: null },
  ]);
  assert.deepEqual(files, [
    { path: 'tests/small/0002.in', sha256: 'input' },
    { path: 'tests/small/0002.out', sha256: 'empty-answer' },
    { path: 'tests/small/0004.in', sha256: 'input-only' },
  ]);
});

test('Code archives separate solutions and resources without renaming original code', () => {
  assert.deepEqual(
    downloads.sourceDownloads([
      { file: { name: 'Main.java', sha256: 'solution' }, isSolution: true },
      { file: { name: 'Main.java', sha256: 'grader' }, isSolution: false },
    ]),
    [
      { path: 'solutions/Main.java', sha256: 'solution' },
      { path: 'files/Main.java', sha256: 'grader' },
    ],
  );
});

function examples() {
  return [
    {
      id: 'one',
      input_sha: 'original-input',
      answer_sha: 'original-answer',
      findings: [{ solution: 'wrong.cpp', actual_sha: 'original-output' }],
      minimized: {
        input_sha: 'reduced-input',
        answer_sha: 'reduced-answer',
        findings: [
          { solution: 'wrong.cpp', actual_sha: 'reduced-output' },
          { solution: 'slow.py', actual_sha: 'slow-output' },
        ],
      },
    },
    { id: 'two', input_sha: 'input-2', answer_sha: 'answer-2', findings: [] },
  ];
}

test('Selected counterexamples retain stable numbers and distinguish reduced evidence from originals', () => {
  const input = examples();
  const before = JSON.stringify(input);
  const reduced = downloads.counterexampleDownloads(input, true, ['one']);
  assert.deepEqual(
    reduced.map((file) => file.sha256),
    ['reduced-input', 'reduced-answer', 'reduced-output', 'slow-output'],
  );
  assert.ok(
    reduced.every((file) =>
      file.path.startsWith('counterexamples/0001-reduced/'),
    ),
  );
  assert.deepEqual(
    downloads
      .counterexampleDownloads(input, false, ['one'])
      .map((file) => file.sha256),
    ['original-input', 'original-answer', 'original-output'],
  );
  assert.equal(
    downloads.counterexampleDownloads(input, true, ['two'])[0].path,
    'counterexamples/0002-original/input.in',
  );
  assert.equal(JSON.stringify(input), before);
});

test('Actual outputs use distinct bounded portable paths even for legacy names', () => {
  const input = examples();
  input[0].minimized.findings = [
    { solution: '비교 ../풀이', actual_sha: 'one' },
    { solution: 'a'.repeat(100), actual_sha: 'two' },
    { solution: 'a'.repeat(100), actual_sha: 'three' },
    { solution: 'absent.py', actual_sha: null },
  ];
  const paths = downloads
    .counterexampleDownloads(input, true, ['one'])
    .map((file) => file.path);
  assert.equal(paths.length, 5);
  assert.equal(new Set(paths).size, paths.length);
  for (const filename of paths)
    for (const segment of filename.split('/')) {
      assert.ok(segment.length <= 100);
      assert.match(segment, /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/);
      assert.ok(!segment.includes('..'));
    }
});

test('ZIP requests keep credentials and CSRF protection and save one archive', async () => {
  const previous = {
    fetch: global.fetch,
    create: URL.createObjectURL,
    revoke: URL.revokeObjectURL,
    click: window.HTMLAnchorElement.prototype.click,
    timeout: window.setTimeout,
  };
  let request, saved, released, timer, content;
  try {
    global.fetch = async (url, options) => {
      request = { url, options };
      return { ok: true, blob: async () => new Blob(['ZIP bytes']) };
    };
    URL.createObjectURL = (blob) => {
      content = blob;
      return 'blob:download';
    };
    URL.revokeObjectURL = (url) => {
      released = url;
    };
    window.setTimeout = (callback) => {
      timer = callback;
    };
    window.HTMLAnchorElement.prototype.click = function () {
      saved = { href: this.href, filename: this.download };
    };
    const files = [{ path: 'files/main.cpp', sha256: 'code' }];
    await downloads.downloadArchive('p', files, 'codes.zip');
    assert.equal(request.url, '/api/problems/p/downloads');
    assert.equal(request.options.credentials, 'same-origin');
    assert.equal(request.options.headers['X-Editor-Request'], '1');
    assert.deepEqual(JSON.parse(request.options.body), {
      files,
      filename: 'codes.zip',
    });
    assert.deepEqual(saved, { href: 'blob:download', filename: 'codes.zip' });
    assert.equal(await content.text(), 'ZIP bytes');
    assert.equal(document.querySelectorAll('a').length, 0);
    assert.equal(released, undefined);
    timer();
    assert.equal(released, 'blob:download');
  } finally {
    global.fetch = previous.fetch;
    URL.createObjectURL = previous.create;
    URL.revokeObjectURL = previous.revoke;
    window.HTMLAnchorElement.prototype.click = previous.click;
    window.setTimeout = previous.timeout;
  }
});

test('An expired download session surfaces the API error rather than saving an error page', async () => {
  const previous = global.fetch;
  global.fetch = async () => ({
    ok: false,
    status: 401,
    json: async () => ({
      error: {
        code: 'authentication_required',
        message: '로그인이 필요합니다.',
      },
    }),
  });
  try {
    await assert.rejects(
      downloads.downloadArchive('p', [], 'files.zip'),
      (error) =>
        error instanceof api.ApiError &&
        error.status === 401 &&
        error.message === '로그인이 필요합니다.',
    );
  } finally {
    global.fetch = previous;
  }
});

test('Download controls submit precisely the selected or complete files, prevent duplicate clicks, and show failures', async () => {
  let calls = [],
    finish;
  const pending = new Promise((resolve) => {
    finish = resolve;
  });
  const { DownloadActions } = load('components/Downloads.tsx', {
    '../lib/downloads': {
      downloadArchive: async (...args) => {
        calls.push(args);
        if (calls.length === 1) await pending;
        else throw new Error('다운로드 실패');
      },
    },
    './ui': {
      Icon: () => null,
      Notice: ({ children }) => h('aside', null, children),
    },
  });
  const files = [
    { path: '1.in', sha256: 'one' },
    { path: '2.in', sha256: 'two' },
  ];
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () =>
    root.render(
      h(DownloadActions, {
        problemId: 'p',
        files,
        selectedFiles: [files[1]],
        filename: 'tests.zip',
      }),
    ),
  );
  try {
    await act(async () => host.querySelectorAll('button')[0].click());
    assert.deepEqual(calls[0], ['p', [files[1]], 'tests.zip']);
    assert.ok(
      [...host.querySelectorAll('button')].every((button) => button.disabled),
    );
    await act(async () => finish());
    await act(async () => host.querySelectorAll('button')[1].click());
    assert.deepEqual(calls[1], ['p', files, 'tests.zip']);
    assert.match(host.textContent, /다운로드 실패/);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

after(() => dom.window.close());
