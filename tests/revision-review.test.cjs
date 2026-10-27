const { test, after, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'),
  path = require('node:path'),
  Module = require('node:module'),
  ts = require('typescript');
const { JSDOM } = require('jsdom');
const { Response, ReadableStream, TextEncoder } = globalThis;
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
let context,
  responder,
  preview,
  calls = [];
const cleanups = new Set(),
  cache = new Map();
function source(relative) {
  if (cache.has(relative)) return cache.get(relative).exports;
  const filename = path.resolve(__dirname, '../src', relative),
    m = new Module(filename, module);
  m.filename = filename;
  m.paths = Module._nodeModulePaths(path.dirname(filename));
  const native = m.require.bind(m);
  m.require = (id) => {
    if (id.endsWith('.css')) return {};
    if (id.endsWith('/workspace')) return { useWorkspace: () => context };
    if (id.endsWith('/api'))
      return {
        ...source('lib/api.ts'),
        api: async (p) => {
          calls.push(p);
          return responder(p);
        },
        time: () => '방금',
        blobPreview: async (id, sha, signal) => {
          calls.push(sha);
          return preview(id, sha, signal);
        },
      };
    if (id.startsWith('.')) {
      const found = ['.ts', '.tsx']
        .map((ext) => path.resolve(path.dirname(filename), id + ext))
        .find(fs.existsSync);
      if (found)
        return source(path.relative(path.resolve(__dirname, '../src'), found));
    }
    return native(id);
  };
  cache.set(relative, m);
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
const helpers = source('lib/revisionChanges.ts');
const { diffLines } = source('lib/documentChanges.ts');
const Review = source('components/RevisionChanges.tsx').default;
const Revisions = source('pages/workspace/Revisions.tsx').default;
function fixture() {
  return {
    info: {
      name: '합',
      time_limit_ms: 1000,
      memory_limit_mb: 256,
      interactive: false,
    },
    statements: {
      korean: {
        name: '합',
        legend: 'N <= 10\n합을 구하세요.',
        input: 'N',
        output: '합',
        notes: '',
        tutorial: '',
        scoring: '',
        interaction: '',
        show_in_review: true,
      },
    },
    files: {},
    solutions: {
      'main.cpp': {
        name: 'main.cpp',
        kind: 'source',
        language: 'cpp17',
        sha256: 'old',
        size: 20,
        tag: 'WA',
        extra_tags: {},
      },
    },
    checker: 'std::wcmp',
    validator: '',
    extra_validators: [],
    interactor: '',
    testsets: {
      tests: {
        script: '',
        groups_enabled: false,
        groups: {},
        tests: {
          one: {
            index: 1,
            input_sha: 'in-old',
            answer_sha: 'ans-old',
            command: 'gen 1',
            sample: false,
            description: '',
            group: '',
            points: 0,
          },
        },
      },
    },
    materials: {},
    validator_tests: {},
    checker_tests: {},
  };
}
const clone = (value) => JSON.parse(JSON.stringify(value));
async function mount(Component, props = {}) {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const close = async () => {
    await act(async () => root.unmount());
    host.remove();
    cleanups.delete(close);
  };
  cleanups.add(close);
  await act(async () => root.render(h(Component, props)));
  return {
    host,
    close,
    render: async (props) => act(async () => root.render(h(Component, props))),
  };
}
const click = async (element) => {
  assert.ok(element);
  await act(async () => element.click());
};
const button = (host, text) =>
  [...host.querySelectorAll('button')].find(
    (el) => el.textContent.trim() === text,
  );
const filter = (host, label) =>
  [...host.querySelectorAll('.revision-categories button')].find((el) =>
    el.textContent.startsWith(label),
  );
const textPreview = (text) => ({ text, truncated: false, binary: false });
afterEach(async () => {
  for (const close of [...cleanups]) await close();
});
after(() => dom.window.close());

test('Revision changes expose settings, statements, code, and individual new tests without mutating snapshots', () => {
  const before = fixture(),
    after = clone(before),
    untouched = clone(before);
  after.info.time_limit_ms = 2000;
  after.statements.korean.legend = 'N <= 100\n합을 구하세요.';
  after.solutions['main.cpp'].sha256 = 'new';
  after.testsets.extra = {
    script: 'gen 2',
    groups_enabled: false,
    groups: {},
    tests: { a: { index: 2 }, b: { index: 3 } },
  };
  const rows = helpers.revisionChanges(before, after);
  assert.ok(rows.some((row) => helpers.describeChange(row) === '1000 → 2000'));
  assert.ok(rows.some((row) => row.label === 'extra #2'));
  assert.ok(rows.some((row) => row.label === 'extra #3'));
  assert.equal(
    rows.find((row) => row.key === 'testsets/extra').after.tests,
    undefined,
  );
  assert.deepEqual(before, untouched);
  const initial = helpers.revisionChanges(null, after);
  assert.ok(initial.length > 4 && initial.every((row) => row.kind === 'added'));
  assert.ok(initial.some((row) => row.label === 'main.cpp'));
  assert.ok(initial.some((row) => row.label === 'tests #1'));
});

test('New language statements expose readable text sections and file metadata ignores key reordering', () => {
  const doc = fixture(),
    after = clone(doc);
  after.statements.english = {
    ...doc.statements.korean,
    name: 'Sum',
    legend: 'Calculate the sum.',
  };
  const row = helpers.revisionChanges(doc, after)[0];
  assert.equal(helpers.displayChangeLabel(row), '영어 지문');
  assert.ok(
    helpers
      .changedContents(row)
      .some(
        (item) =>
          item.label === '지문' && item.after.text === 'Calculate the sum.',
      ),
  );
  assert.ok(
    helpers.changedFields(row).some((field) => field.label === '지문 제목'),
  );
  const code = {
    before: { extra_tags: { small: 'OK', large: 'TL' }, tag: 'WA' },
    after: { extra_tags: { large: 'TL', small: 'OK' }, tag: 'TL' },
    key: 'solutions/a.cpp',
  };
  assert.deepEqual(
    helpers.changedFields(code).map((row) => row.key),
    ['tag'],
  );
});

test('History review shows actual values and loads only the selected code or test contents', async () => {
  calls = [];
  const before = fixture(),
    after = clone(before);
  after.info.time_limit_ms = 2000;
  after.statements.korean.legend = 'N <= 100\n합을 구하세요.';
  after.solutions['main.cpp'].sha256 = 'new';
  after.solutions['main.cpp'].tag = 'TL';
  after.testsets.tests.tests.one.input_sha = 'in-new';
  after.testsets.tests.tests.one.answer_sha = 'ans-new';
  preview = async (_id, sha) =>
    textPreview(
      sha === 'old'
        ? 'int x = 1;\nreturn x;'
        : sha === 'new'
          ? 'long long x = 2;\nreturn x;'
          : sha,
    );
  const v = await mount(Review, { problemId: 'p', before, after });
  assert.match(
    v.host.querySelector('.revision-value-pair').textContent,
    /1000.*2000/s,
  );
  assert.deepEqual(calls, []);
  await click(filter(v.host, '코드·파일'));
  assert.deepEqual(calls, ['old', 'new']);
  assert.match(
    v.host.querySelector('.diff-line.remove').textContent,
    /int x = 1/,
  );
  assert.match(
    v.host.querySelector('.diff-line.add').textContent,
    /long long x = 2/,
  );
  assert.match(
    v.host.querySelector('.revision-metadata').textContent,
    /기본 기대 판정/,
  );
  assert.match(
    v.host.querySelector('.revision-metadata').textContent,
    /WA.*TL/s,
  );
  assert.equal(
    v.host.querySelector('a[download="main.cpp"]').getAttribute('href'),
    '/api/problems/p/blobs/old',
  );
  await click(filter(v.host, '테스트'));
  assert.deepEqual(calls.slice(-2), ['in-old', 'in-new']);
  await click(button(v.host, '기대 출력'));
  assert.deepEqual(calls.slice(-2), ['ans-old', 'ans-new']);
  await click(filter(v.host, '지문'));
  assert.match(
    v.host.querySelector('.diff-line.remove').textContent,
    /N <= 10/,
  );
  assert.match(v.host.querySelector('.diff-line.add').textContent, /N <= 100/);
});

test('Metadata-only source changes are visible without refetching unchanged code', async () => {
  calls = [];
  const before = fixture(),
    after = clone(before);
  after.solutions['main.cpp'].tag = 'TL';
  after.solutions['main.cpp'].language = 'cpp20';
  preview = () => {
    throw Error('unchanged code requested');
  };
  const v = await mount(Review, { problemId: 'p', before, after });
  assert.match(v.host.textContent, /C\+\+17.*C\+\+20/s);
  assert.match(v.host.textContent, /WA · 오답.*TL · 시간 초과/s);
  assert.deepEqual(calls, []);
  const search = v.host.querySelector('[aria-label="변경 항목 검색"]');
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    ).set.call(search, 'not-present');
    search.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
  assert.match(v.host.textContent, /해당하는 변경 항목이 없습니다/);
});

test('Truncated and binary previews are explicit and failed previews can retry', async () => {
  const before = fixture(),
    after = clone(before);
  after.solutions['main.cpp'].sha256 = 'new';
  let fail = true;
  preview = async () => {
    if (fail) throw Error('temporary failure');
    return { text: 'prefix', truncated: true, binary: false };
  };
  const v = await mount(Review, { problemId: 'p', before, after });
  assert.match(
    v.host.querySelector('[role=alert]').textContent,
    /temporary failure/,
  );
  fail = false;
  await click(button(v.host, '다시 시도'));
  assert.match(v.host.textContent, /앞 256KiB만 비교/);
  await v.close();
  preview = async () => ({ text: '', truncated: false, binary: true });
  const binary = await mount(Review, { problemId: 'p', before, after });
  assert.match(
    binary.host.textContent,
    /바이너리 파일은 줄 단위로 비교할 수 없습니다/,
  );
  assert.equal(binary.host.querySelector('.line-diff'), null);
});

test('Revision requests cannot replace a newer selection after closing the old modal', async () => {
  const doc = fixture();
  let resolveOld;
  const revision = (n) => ({
    number: n,
    message: 'change ' + n,
    author: '작성자',
    created_at: 1,
    hash: '',
  });
  context = { data: { problem: { id: 'p', revision: 2 } }, notify() {} };
  responder = (p) =>
    p.includes('/revisions?')
      ? [revision(2), revision(1), revision(0)]
      : p.endsWith('/2')
        ? new Promise((resolve) => {
            resolveOld = resolve;
          })
        : clone(doc);
  const v = await mount(Revisions);
  await click(v.host.querySelector('[aria-label="r2 자료 확인"]'));
  assert.match(v.host.textContent, /자료를 비교하고 있습니다/);
  await click(
    v.host.querySelector('dialog .modal-heading [aria-label="닫기"]'),
  );
  await click(v.host.querySelector('[aria-label="r1 자료 확인"]'));
  await act(async () => resolveOld(clone(doc)));
  assert.match(v.host.querySelector('dialog h2').textContent, /r0 → r1/);
  assert.equal(v.host.querySelectorAll('.code-editor').length, 0);
  assert.equal(
    v.host.querySelector('a[download="revision-1.json"]').getAttribute('href'),
    '/api/problems/p/revisions/1',
  );
});

test('A failed previous revision is not treated as an initial snapshot and can be retried', async () => {
  const doc = fixture();
  let failure = true;
  context = { data: { problem: { id: 'p', revision: 1 } }, notify() {} };
  responder = (p) =>
    p.includes('/revisions?')
      ? [{ number: 1, message: 'change', author: '작성자', created_at: 1 }]
      : p.endsWith('/0') && failure
        ? Promise.reject(Error('network'))
        : clone(doc);
  const v = await mount(Revisions);
  await click(v.host.querySelector('[aria-label="r1 자료 확인"]'));
  assert.match(v.host.textContent, /불러오지 못했습니다/);
  assert.equal(v.host.querySelector('.revision-changes'), null);
  failure = false;
  await click(button(v.host, '다시 불러오기'));
  assert.match(v.host.textContent, /이전 리비전과 자료가 같습니다/);
});

test('A long multiline commit stays available in the review without occupying the dialog heading', async () => {
  const doc = fixture();
  const message =
    '지문 검수\n' +
    '경계 조건과 입력 범위를 명확하게 정리했습니다.\n'.repeat(20);
  context = { data: { problem: { id: 'p', revision: 1 } }, notify() {} };
  responder = (p) =>
    p.includes('/revisions?')
      ? [{ number: 1, message, author: '공동 출제자', created_at: 1 }]
      : clone(doc);
  const v = await mount(Revisions);
  assert.equal(
    v.host.querySelector('.revision-history-message').title,
    message,
  );
  await click(v.host.querySelector('[aria-label="r1 자료 확인"]'));
  assert.equal(
    v.host.querySelector('dialog h2').textContent,
    'r0 → r1 · 자료 비교',
  );
  assert.equal(
    v.host.querySelector('[aria-label="커밋 내용"] p').textContent,
    message,
  );
  assert.ok(v.host.querySelector('.revision-changes'));
});

test('Large line changes avoid argument limits while preserving both sides', () => {
  const a = Array(70000).fill('a').join('\n'),
    b = Array(70000).fill('b').join('\n');
  const rows = diffLines(a, b);
  assert.equal(rows.length, 140000);
  assert.equal(
    rows
      .filter((row) => row.kind === 'remove')
      .map((row) => row.text)
      .join('\n'),
    a,
  );
  assert.equal(
    rows
      .filter((row) => row.kind === 'add')
      .map((row) => row.text)
      .join('\n'),
    b,
  );
});

test('Blob previews cancel ignored ranges, retain a bounded prefix, and identify binary data', async () => {
  const original = global.fetch;
  let cancelled = false,
    headers;
  try {
    global.fetch = async (_url, opts) => {
      headers = opts.headers;
      return new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(new TextEncoder().encode('abcdefghij'));
          },
          cancel() {
            cancelled = true;
          },
        }),
      );
    };
    const result = await source('lib/api.ts').blobPreview(
      'p',
      'sha',
      undefined,
      5,
    );
    assert.deepEqual(headers, { Range: 'bytes=0-5' });
    assert.equal(result.text, 'abcde');
    assert.equal(result.truncated, true);
    assert.equal(cancelled, true);
    global.fetch = async () =>
      new Response(null, {
        status: 416,
        headers: { 'Content-Range': 'bytes */0' },
      });
    assert.deepEqual(await source('lib/api.ts').blobPreview('p', 'sha'), {
      text: '',
      truncated: false,
      binary: false,
    });
    global.fetch = async () => new Response(new Uint8Array([65, 0, 66]));
    assert.equal(
      (await source('lib/api.ts').blobPreview('p', 'sha')).binary,
      true,
    );
    global.fetch = async () =>
      new Response('hi', {
        status: 206,
        headers: { 'Content-Range': 'bytes 0-1/1000' },
      });
    assert.equal(
      (await source('lib/api.ts').blobPreview('p', 'sha', undefined, 5))
        .truncated,
      true,
    );
  } finally {
    global.fetch = original;
  }
});
