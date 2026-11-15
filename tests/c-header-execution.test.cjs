const { test, after } = require('node:test');
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
const cache = new Map();
function source(relative) {
  const file = path.resolve(__dirname, '../src', relative);
  if (cache.has(file)) return cache.get(file).exports;
  const loaded = new Module(file, module);
  loaded.filename = file;
  loaded.paths = Module._nodeModulePaths(path.dirname(file));
  const native = loaded.require.bind(loaded);
  loaded.require = (id) =>
    id.startsWith('.')
      ? source(
          path.relative(
            path.resolve(__dirname, '../src'),
            path.resolve(path.dirname(file), id + '.ts'),
          ),
        )
      : native(id);
  cache.set(file, loaded);
  loaded._compile(
    ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    file,
  );
  return loaded.exports;
}
const { executionHeaderSources, ExecutionCancelledError } = source(
  'lib/executionHeaderCase.ts',
);
const { useCHeaderCaseWarning } = source('lib/useCHeaderCaseWarning.ts');
const cpp = (name, extra = {}) => ({
  name,
  language: 'cpp17',
  sha256: name,
  kind: 'source',
  ...extra,
});
function fixture() {
  return {
    info: { interactive: false },
    validator: 'validator.cpp',
    extra_validators: ['extra.cpp'],
    checker: 'checker.cpp',
    interactor: 'interactor.cpp',
    files: Object.fromEntries(
      [
        'validator.cpp',
        'extra.cpp',
        'checker.cpp',
        'interactor.cpp',
        'gen.cpp',
        'unused.cpp',
        'unrelated.h',
      ].map((name) => [name, cpp(name)]),
    ),
    solutions: {
      'main.cpp': cpp('main.cpp', { tag: 'MA' }),
      'selected.cpp': cpp('selected.cpp', { tag: 'WA' }),
      'unused.cpp': cpp('unused.cpp', { tag: 'OK' }),
      'skipped.cpp': cpp('skipped.cpp', { tag: 'NR' }),
    },
    testsets: {
      tests: { script: '', tests: { a: { index: 1, command: 'gen 3 > $' } } },
      unused: { script: 'unused 5 > $', tests: {} },
    },
  };
}
function selected(kind, options = {}, doc = fixture()) {
  return executionHeaderSources(kind, doc, options)
    .map((source) => source.name)
    .sort();
}
test('verify checks requested solutions, preparations and selected generators only', () => {
  assert.deepEqual(
    selected('verify', { solutions: ['selected.cpp'], testset: 'tests' }),
    [
      'checker.cpp',
      'extra.cpp',
      'gen.cpp',
      'main.cpp',
      'selected.cpp',
      'validator.cpp',
    ],
  );
});
test('frozen committed verification excludes generation and Main unless selected', () => {
  assert.deepEqual(
    selected('verify', { snapshot: 'committed', solutions: ['selected.cpp'] }),
    ['checker.cpp', 'extra.cpp', 'selected.cpp', 'validator.cpp'],
  );
  assert.ok(
    selected('verify', {
      snapshot: 'committed',
      solutions: ['main.cpp'],
    }).includes('main.cpp'),
  );
});
test('temporary selected source preserves its exact language and content', () => {
  const temporary = {
    name: 'review.cpp',
    language: 'cpp17',
    content: '#include <String>\r\n',
    tag: 'OK',
  };
  const values = executionHeaderSources('verify', fixture(), {
    snapshot: 'committed',
    solutions: ['review.cpp'],
    temporary_solutions: [temporary],
  });
  assert.deepEqual(
    values.find((source) => source.name === temporary.name),
    {
      name: temporary.name,
      language: temporary.language,
      content: temporary.content,
    },
  );
  assert.equal(
    values.some((source) => ['main.cpp', 'selected.cpp'].includes(source.name)),
    false,
  );
});
test('input-only and validate operations do not check unrelated solutions', () => {
  assert.deepEqual(
    selected('prepare', { prepare_mode: 'inputs', testset: 'tests' }),
    ['extra.cpp', 'gen.cpp', 'validator.cpp'],
  );
  assert.deepEqual(
    selected('prepare', { prepare_mode: 'validate', testset: 'tests' }),
    ['extra.cpp', 'validator.cpp'],
  );
});
test('component self tests and stress inspect their actual selected programs', () => {
  assert.deepEqual(selected('validator-tests'), ['extra.cpp', 'validator.cpp']);
  assert.deepEqual(selected('checker-tests'), ['checker.cpp']);
  assert.deepEqual(
    selected('stress', {
      candidates: ['selected.cpp'],
      patterns: [{ command: 'gen 5' }],
    }),
    [
      'checker.cpp',
      'extra.cpp',
      'gen.cpp',
      'main.cpp',
      'selected.cpp',
      'validator.cpp',
    ],
  );
});
test('archive only and render never inspect code; verified package keeps selected testsets', () => {
  assert.deepEqual(selected('package', { verify: false }), []);
  assert.deepEqual(selected('render'), []);
  const files = selected('package', {
    verify: true,
    snapshot: 'committed',
    export_format: 'zoj',
    testsets: ['tests'],
  });
  assert.equal(files.includes('gen.cpp'), true);
  assert.equal(files.includes('skipped.cpp'), false);
  assert.equal(files.includes('unrelated.h'), false);
});
test('test index selection excludes generators for unselected tests', () => {
  assert.deepEqual(
    selected('prepare', {
      prepare_mode: 'inputs',
      testset: 'tests',
      test_indices: [9],
    }),
    ['extra.cpp', 'validator.cpp'],
  );
});
function deferred() {
  let resolve;
  const promise = new Promise((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
async function flush() {
  await act(async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
  });
}
async function harness() {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  let controls;
  function View({ scopeKey }) {
    controls = useCHeaderCaseWarning(scopeKey);
    return h(
      'output',
      null,
      controls.files ? JSON.stringify(controls.files) : 'no-warning',
    );
  }
  async function render(scopeKey) {
    await act(() => root.render(h(View, { scopeKey })));
  }
  await render('first');
  return {
    host,
    render,
    get controls() {
      return controls;
    },
    async close() {
      await act(() => root.unmount());
      host.remove();
    },
  };
}
for (const sourceText of ['#include <string>\n', '#include "String"\n']) {
  test(
    'valid and quoted custom headers continue without a dialog: ' +
      sourceText.trim(),
    async () => {
      const view = await harness();
      let finished = false;
      await act(async () => {
        await view.controls.check(
          [{ name: 'main.cpp', language: 'cpp17', content: sourceText }],
          async () => '',
        );
        finished = true;
      });
      assert.equal(finished, true);
      assert.equal(view.controls.files, null);
      await view.close();
    },
  );
}
test('warning must be explicitly confirmed and cancel is a silent typed outcome', async () => {
  const view = await harness();
  let outcome = 'pending';
  let result;
  await act(async () => {
    result = view.controls
      .check([cpp('main.cpp')], async () => '#include <String>\n')
      .then(
        () => {
          outcome = 'confirmed';
        },
        (e) => {
          outcome = e;
        },
      );
  });
  assert.equal(outcome, 'pending');
  assert.match(view.host.textContent, /String/);
  await act(() => view.controls.cancel());
  await result;
  assert.ok(outcome instanceof ExecutionCancelledError);
  assert.equal(view.controls.files, null);
  await act(async () => {
    result = view.controls
      .check([cpp('main.cpp')], async () => '#include <String>\n')
      .then(() => {
        outcome = 'confirmed';
      });
  });
  await act(() => view.controls.confirm());
  await result;
  assert.equal(outcome, 'confirmed');
  await view.close();
});
test('scope change cancels pending confirmation; old findings cannot approve next request while loading', async () => {
  const view = await harness();
  let first;
  await act(async () => {
    first = view.controls
      .check([cpp('old.cpp')], async () => '#include <String>\n')
      .catch((e) => e);
  });
  assert.ok(view.controls.files);
  await view.render('second');
  assert.ok((await first) instanceof ExecutionCancelledError);
  const gate = deferred();
  let finished = false;
  let second;
  await act(async () => {
    second = view.controls
      .check([cpp('new.cpp')], () => gate.promise)
      .then(() => {
        finished = true;
      });
  });
  assert.equal(view.controls.files, null);
  await act(() => view.controls.confirm());
  assert.equal(finished, false);
  await act(() => gate.resolve('#include <Vector>\n'));
  await flush();
  assert.match(view.host.textContent, /new.cpp/);
  assert.doesNotMatch(view.host.textContent, /old.cpp/);
  await act(() => view.controls.confirm());
  await second;
  assert.equal(finished, true);
  await view.close();
});
test('scope change and unmount abort in-flight blob inspection', async () => {
  const view = await harness();
  const gate = deferred();
  let signal;
  let result;
  await act(async () => {
    result = view.controls
      .check([cpp('main.cpp')], (sha, current) => {
        signal = current;
        return gate.promise;
      })
      .catch((e) => e);
  });
  await view.close();
  assert.equal(signal.aborted, true);
  assert.ok((await result) instanceof ExecutionCancelledError);
  gate.resolve('#include <String>\n');
  await flush();
});
after(() => dom.window.close());

test('unavailable source is an advisory confirmation instead of a new execution ban', async () => {
  const view = await harness();
  let result;
  let finished = false;
  await act(async () => {
    result = view.controls
      .check([cpp('unreadable.cpp')], async () => {
        throw new Error('permission or size');
      })
      .then(() => {
        finished = true;
      });
  });
  assert.equal(view.controls.files[0].unavailable, true);
  assert.equal(finished, false);
  await act(() => view.controls.confirm());
  await result;
  assert.equal(finished, true);
  await view.close();
});
test('interactive preparation includes checker and interactor; self tests exclude solution build units', () => {
  const doc = fixture();
  doc.info.interactive = true;
  doc.files['helper.cpp'] = cpp('helper.cpp', { compile_with_solution: true });
  doc.files['copied.cpp'] = cpp('copied.cpp', { attach_to_build: true });
  assert.deepEqual(selected('checker-tests', {}, doc), ['checker.cpp']);
  const prepared = selected('prepare', {}, doc);
  assert.equal(prepared.includes('checker.cpp'), true);
  assert.equal(prepared.includes('interactor.cpp'), true);
  assert.equal(prepared.includes('helper.cpp'), true);
  assert.equal(prepared.includes('copied.cpp'), false);
});
test('script replaces stale explicit commands and exact filename precedes stem matching', () => {
  const doc = fixture();
  doc.files.gen = cpp('gen');
  doc.testsets.tests.script = 'gen 4 > $';
  doc.testsets.tests.tests.a.command = 'unused 5';
  const files = selected(
    'prepare',
    { prepare_mode: 'inputs', testset: 'tests' },
    doc,
  );
  assert.equal(files.includes('gen'), true);
  assert.equal(files.includes('gen.cpp'), false);
  assert.equal(files.includes('unused.cpp'), false);
});
