const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
const { setImmediate } = require('node:timers');
const { AbortController } = globalThis;
const dom = new JSDOM('<body></body>');
const file = path.resolve(__dirname, '../src/lib/statementPrint.ts');
const loaded = new Module(file, module);
loaded._compile(
  ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText,
  file,
);
const { prepareStatementPrint } = loaded.exports;
const tick = () => new Promise(setImmediate);
function fixture(html = '') {
  const root = dom.window.document.createElement('main');
  root.innerHTML = html;
  dom.window.document.body.replaceChildren(root);
  return root;
}
function image(root, src = 'blob:authorized-image', decode = async () => {}) {
  const element = dom.window.document.createElement('img');
  element.src = src;
  const state = { complete: true, width: 80 };
  Object.defineProperty(element, 'complete', { get: () => state.complete });
  Object.defineProperty(element, 'naturalWidth', { get: () => state.width });
  element.decode = decode;
  root.append(element);
  return { element, state };
}

test('waits for authenticated placeholders, native loading and decode before resolving', async () => {
  const root = fixture('<span data-statement-image-state="loading"></span>');
  const controller = new AbortController();
  let done = false;
  const ready = prepareStatementPrint(root, controller.signal).then(() => {
    done = true;
  });
  await tick();
  assert.equal(done, false);
  root.firstChild.remove();
  let release;
  const decoding = new Promise((resolve) => {
    release = resolve;
  });
  const { element, state } = image(
    root,
    'blob:authorized-image',
    () => decoding,
  );
  state.complete = false;
  await tick();
  assert.equal(done, false);
  state.complete = true;
  element.dispatchEvent(new dom.window.Event('load'));
  await tick();
  assert.equal(done, false);
  release();
  await ready;
  assert.equal(done, true);
});

test('already loaded blob, inlined and linked images all pass through decode', async () => {
  const root = fixture();
  const decoded = [];
  for (const src of [
    'blob:authorized',
    'data:image/png;base64,AA==',
    'https://images.example/diagram.png',
  ])
    image(root, src, async () => {
      decoded.push(src);
    });
  await prepareStatementPrint(root, new AbortController().signal);
  assert.deepEqual(decoded, [
    'blob:authorized',
    'data:image/png;base64,AA==',
    'https://images.example/diagram.png',
  ]);
});

test('excluded sections and screen-only images never block or fail selected printing', async () => {
  const root = fixture(
    '<section data-print-included="false"><span data-statement-image-state="error"></span><span data-statement-image-state="loading"></span><img src="missing"></section><aside class="review-screen-only"><img src="missing"></aside>',
  );
  await prepareStatementPrint(root, new AbortController().signal);
});

test('failed authorized fetch, native load and image decode produce actionable failure', async () => {
  await assert.rejects(
    prepareStatementPrint(
      fixture('<a data-statement-image-state="error"></a>'),
      new AbortController().signal,
    ),
    /이미지.*확인/,
  );
  const root = fixture();
  const { state } = image(root);
  state.width = 0;
  await assert.rejects(
    prepareStatementPrint(root, new AbortController().signal),
    /이미지.*확인/,
  );
  const second = fixture();
  image(second, 'blob:invalid', async () => {
    throw Error('Private response details');
  });
  await assert.rejects(
    prepareStatementPrint(second, new AbortController().signal),
    (error) =>
      /이미지.*확인/.test(error.message) && !error.message.includes('Private'),
  );
});

test('timeout and cancellation settle once and ignore later loaded images', async () => {
  const root = fixture('<span data-statement-image-state="loading"></span>');
  await assert.rejects(
    prepareStatementPrint(root, new AbortController().signal, 5),
    /시간이 오래/,
  );
  const controller = new AbortController();
  const ready = prepareStatementPrint(root, controller.signal);
  controller.abort();
  await assert.rejects(ready, { name: 'AbortError' });
  root.replaceChildren();
  image(root);
  await tick();
  const aborted = new AbortController();
  aborted.abort();
  await assert.rejects(prepareStatementPrint(root, aborted.signal), {
    name: 'AbortError',
  });
});

test('a changed image source cannot reuse the previous source decode', async () => {
  const root = fixture();
  let release;
  let calls = 0;
  let done = false;
  const first = new Promise((resolve) => {
    release = resolve;
  });
  const { element, state } = image(root, 'blob:first', () =>
    ++calls === 1 ? first : Promise.resolve(),
  );
  const ready = prepareStatementPrint(root, new AbortController().signal).then(
    () => {
      done = true;
    },
  );
  element.src = 'blob:second';
  state.complete = false;
  release();
  await tick();
  assert.equal(done, false);
  state.complete = true;
  element.dispatchEvent(new dom.window.Event('load'));
  await ready;
  assert.equal(calls, 2);
});

after(() => dom.window.close());
