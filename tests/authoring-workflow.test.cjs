const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'),
  path = require('node:path'),
  Module = require('node:module'),
  ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<body></body>', { pretendToBeVisual: true });
global.window = dom.window;
global.document = dom.window.document;
global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react'),
  { act } = React,
  { createRoot } = require('react-dom/client');
window.HTMLDialogElement.prototype.showModal = function () {
  this.open = true;
};
window.HTMLDialogElement.prototype.close = function () {
  this.open = false;
};
let context,
  uploads = [],
  blobs = [];
const router = {
  Link: ({ children, to, ...props }) =>
    React.createElement('a', { href: to, ...props }, children),
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
    if (id.endsWith('/workspace')) return { useWorkspace: () => context };
    if (id.endsWith('/api'))
      return {
        ...source('lib/api.ts'),
        upload: async (...args) => {
          uploads.push(args);
          return { sha256: 'new', size: 20 };
        },
        blobText: async (problem, sha) => {
          blobs.push(sha);
          return sha === 'old'
            ? 'int x = 1;\nreturn x;'
            : 'int x = 2;\nreturn x;';
        },
      };
    if (id.startsWith('.'))
      return source(
        path.relative(
          path.resolve(__dirname, '../src'),
          ['.ts', '.tsx']
            .map((ext) => path.resolve(path.dirname(file), id + ext))
            .find((f) => fs.existsSync(f)),
        ),
      );
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
const { sourceRoles, reuseAsSolution, solutionReuseIssue } =
  source('lib/sourceRoles.ts');
const { documentChanges, diffLines } = source('lib/documentChanges.ts');
const { preparationCautions } = source('lib/readiness.ts');
const file = (name, extra = {}) => ({
  name,
  kind: 'source',
  language: 'cpp17',
  sha256: 'old',
  size: 30,
  ...extra,
});
function fixture() {
  return {
    info: { name: '합', tags: [], points_enabled: false, interactive: false },
    statements: {
      korean: {
        legend: '두 수의 합',
        name: '합',
        input: '',
        output: '',
        notes: '',
        tutorial: '',
      },
    },
    files: {
      'main.cpp': file('main.cpp'),
      'validator.cpp': file('validator.cpp'),
      'gen.cpp': file('gen.cpp', { roles: ['generator'] }),
    },
    solutions: {},
    checker: 'std::wcmp',
    validator: 'validator.cpp',
    interactor: '',
    extra_validators: [],
    testsets: {
      tests: {
        script: '',
        tests: {
          one: {
            index: 1,
            input_sha: 'input',
            answer_sha: null,
            sample: true,
            command: '',
          },
        },
      },
    },
    validator_tests: {},
    checker_tests: {},
    materials: { public: { files: ['main.cpp'], solutions: [], testsets: [] } },
  };
}
function workspace() {
  let doc = fixture();
  context = {
    data: {
      problem: { id: 'fixture', note: '', modified: false },
      cautions: [],
      version: 0,
    },
    get document() {
      return doc;
    },
    editable: true,
    mutate: (fn) => {
      fn(doc);
    },
    notify: () => {},
    run: async () => {},
  };
  return doc;
}
async function mount(Component, props = {}) {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(React.createElement(Component, props)));
  return {
    host,
    close: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}
test('Reusing a file preserves its contents, Main uniqueness and publication links', () => {
  const doc = fixture();
  doc.solutions['previous.cpp'] = {
    ...file('previous.cpp'),
    tag: 'MA',
    extra_tags: {},
  };
  reuseAsSolution(doc, 'main.cpp', 'MA');
  assert.equal(doc.files['main.cpp'], undefined);
  assert.equal(doc.solutions['main.cpp'].sha256, 'old');
  assert.equal(doc.solutions['previous.cpp'].tag, 'OK');
  assert.deepEqual(doc.materials.public.files, []);
  assert.deepEqual(doc.materials.public.solutions, ['main.cpp']);
  assert.match(solutionReuseIssue(doc, 'validator.cpp'), /Validator/);
  assert.match(solutionReuseIssue(doc, 'gen.cpp'), /Generator/);
});
test('Legacy linked programs stay visible while unrelated sources do not gain roles', () => {
  const doc = fixture();
  assert.deepEqual(sourceRoles(doc, 'validator.cpp'), ['validator']);
  assert.deepEqual(sourceRoles(doc, 'main.cpp'), []);
  delete doc.files['gen.cpp'].roles;
  doc.testsets.tests.script = 'gen 100 42 > $';
  assert.deepEqual(sourceRoles(doc, 'gen.cpp'), ['generator']);
});
test('The existing-file picker creates a Main solution without uploading a second blob', async () => {
  uploads = [];
  const doc = workspace();
  const { host, close } = await mount(
    source('pages/workspace/Files.tsx').default,
    { solutions: true },
  );
  await act(async () =>
    [...host.querySelectorAll('button')]
      .find((b) => b.textContent.includes('기존 파일에서 선택'))
      .click(),
  );
  assert.equal(host.querySelector('dialog select').value, '');
  await act(async () => {
    const select = host.querySelector('dialog select');
    select.value = 'main.cpp';
    select.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
  assert.equal(host.querySelectorAll('dialog select')[1].value, 'MA');
  await act(async () =>
    [...host.querySelectorAll('dialog button')]
      .find((b) => b.textContent === '풀이로 지정')
      .click(),
  );
  assert.equal(doc.solutions['main.cpp'].tag, 'MA');
  assert.deepEqual(uploads, []);
  await close();
});
test('Validator selection omits unrelated and generator sources', async () => {
  workspace();
  const { host, close } = await mount(
    source('pages/workspace/ComponentTests.tsx').default,
    { kind: 'validator' },
  );
  assert.deepEqual(
    [...host.querySelectorAll('select option')].map((o) => o.value),
    ['', 'validator.cpp'],
  );
  await close();
});
test('Preparation recommendations do not count as missing required data', () => {
  const doc = fixture();
  reuseAsSolution(doc, 'main.cpp', 'MA');
  const rows = preparationCautions(doc);
  assert.equal(rows.filter((r) => r.blocking).length, 0);
  assert.deepEqual(
    rows.map((r) => r.code),
    ['NO_VALIDATOR_TESTS', 'NO_WRONG_SOLUTIONS'],
  );
});
test('Commit differences omit unchanged settings and peer changes', () => {
  const before = fixture(),
    after = JSON.parse(JSON.stringify(before));
  after.statements.korean.legend = '새 지문';
  after.testsets.tests.tests.two = { index: 2, input_sha: 'input2' };
  // Object ordering is not a content change.
  after.files['main.cpp'] = {
    size: 30,
    sha256: 'old',
    language: 'cpp17',
    kind: 'source',
    name: 'main.cpp',
  };
  assert.deepEqual(
    documentChanges(before, after).map((r) => [r.label, r.kind]),
    [
      ['korean · 지문', 'changed'],
      ['tests #2', 'added'],
    ],
  );
});
test('Line differences reconstruct both originals and revised text', () => {
  for (const [a, b] of [
    ['one\ntwo\nthree', 'one\nnew\nthree'],
    ['', 'new'],
    ['old', ''],
    ['same', 'same'],
  ]) {
    const rows = diffLines(a, b);
    assert.equal(
      rows
        .filter((r) => r.kind !== 'add')
        .map((r) => r.text)
        .join('\n'),
      a,
    );
    assert.equal(
      rows
        .filter((r) => r.kind !== 'remove')
        .map((r) => r.text)
        .join('\n'),
      b,
    );
  }
});

test('Promoting an unchanged source is a role change rather than code deletion', () => {
  const before = fixture(),
    after = JSON.parse(JSON.stringify(before));
  reuseAsSolution(after, 'main.cpp', 'MA');
  const rows = documentChanges(before, after).filter((r) =>
    r.label.includes('main.cpp'),
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].group, '파일 역할');
  assert.equal(rows[0].kind, 'changed');
  assert.equal(rows[0].source, undefined);
});
test('Commit preview loads code only when expanded and renders changed lines', async () => {
  blobs = [];
  const before = fixture(),
    after = JSON.parse(JSON.stringify(before));
  after.files['main.cpp'].sha256 = 'new';
  const { host, close } = await mount(
    source('components/CommitChanges.tsx').default,
    { problemId: 'fixture', before, after },
  );
  assert.deepEqual(blobs, []);
  await act(async () => {
    const details = host.querySelector('details');
    details.open = true;
    details.dispatchEvent(new window.Event('toggle'));
  });
  assert.deepEqual(blobs, ['old', 'new']);
  assert.match(
    host.querySelector('.diff-line.remove').textContent,
    /int x = 1/,
  );
  assert.match(host.querySelector('.diff-line.add').textContent, /int x = 2/);
  await close();
});
after(() => dom.window.close());
