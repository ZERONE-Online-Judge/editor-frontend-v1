const { test, beforeEach, afterEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
const React = require('react');
const { act } = React;
const { File, Buffer } = require('node:buffer');
const { setImmediate } = require('node:timers');
const editor = fs.existsSync(
  path.resolve(__dirname, '../src/lib/statementImages.ts'),
);
const ready = Promise.all(
  [
    'unified',
    'remark-parse',
    'remark-math',
    'hast-util-from-html',
    'react-markdown',
    'rehype-raw',
    'rehype-sanitize',
    'rehype-katex',
    'remark-gfm',
  ].map(async (name) => [name, await import(name)]),
).then((entries) => new Map(entries));
const loaded = new Map();
function source(file, imports) {
  if (loaded.has(file)) return loaded.get(file).exports;
  const mod = new Module(file, module);
  mod.filename = file;
  mod.paths = Module._nodeModulePaths(path.dirname(file));
  const native = mod.require.bind(mod);
  mod.require = (name) => {
    if (name.endsWith('.css')) return {};
    if (imports.has(name)) return { __esModule: true, ...imports.get(name) };
    if (name.startsWith('.') || name.startsWith('@/')) {
      const base = name.startsWith('@/')
        ? path.resolve(__dirname, '../src', name.slice(2))
        : path.resolve(path.dirname(file), name);
      return source(
        ['.ts', '.tsx', '']
          .map((ext) => base + ext)
          .find((p) => fs.existsSync(p)),
        imports,
      );
    }
    return native(name);
  };
  loaded.set(file, mod);
  mod._compile(
    ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    }).outputText,
    file,
  );
  return mod.exports;
}
async function engine() {
  return source(
    path.resolve(
      __dirname,
      editor
        ? '../src/lib/statementImages.ts'
        : '../src/shared/lib/statementImages.ts',
    ),
    await ready,
  );
}

test('image AST finds Markdown, reference links, HTML repeats and balanced filenames while ignoring literal code', async () => {
  const api = await engine();
  const value =
    '![첫째](<그림 (1).png>)\n\n![둘째][figure]\n\n[figure]: <images/그림.png>\n\n<img alt="A &amp; B" src="asset://one" data-zoj-align="right" data-zoj-width="75%">\n<img src="asset://one" alt="repeat">\n\n`![fake](fake.png)`\n\n```html\n<img src="fake.png">\n```\n\n    ![indented](fake.png)';
  const images = api.parseStatementImages(value);
  assert.equal(images.length, 4);
  assert.equal(images[0].source, '그림 (1).png');
  assert.equal(images[2].alt, 'A & B');
  assert.equal(images[2].align, 'right');
  assert.equal(images[2].width, '75%');
  assert.equal(images[3].source, images[2].source);
  assert.ok(images[2].start < images[3].start);
  for (const image of images)
    assert.equal(value.slice(image.start, image.end), image.text);
});
test('reference images with encoded names and bracket alt text resolve definitions', async () => {
  const api = await engine();
  const [image] = api.parseStatementImages(
    '![alt [nested]][图]\n\n[图]: <folder/그림 (2).png>',
  );
  assert.equal(image.source, 'folder/그림 (2).png');
  assert.equal(image.alt, 'alt [nested]');
});
test('literal math and TeX verbatim images are ignored and insertion inside them is blocked', async () => {
  const api = await engine();
  const value = String.raw`$\text{![math](fake.png)}$ and \(\text{![tex](fake.png)}\)

\begin{verbatim}
\includegraphics{fake.png}
![verbatim](fake.png)
\end{verbatim}

![real](real.png)`;
  const images = api.parseStatementImages(value);
  assert.equal(images.length, 1);
  assert.equal(images[0].source, 'real.png');
  assert.equal(
    api.safeImageInsertion(value, value.indexOf('verbatim](fake')),
    false,
  );
  assert.equal(
    api.safeImageInsertion(value, value.indexOf('math](fake')),
    false,
  );
});
test('reference definitions follow Markdown first-definition precedence', async () => {
  const api = await engine();
  assert.equal(
    api.parseStatementImages(
      '![image][ref]\n\n[ref]: first.png\n\n[ref]: second.png',
    )[0].source,
    'first.png',
  );
});
test('canonical markup escapes complete HTML attributes and only permits bounded dimensions/alignment', async () => {
  const api = await engine();
  const text = api.statementImageMarkup({
    source: 'folder/"<&\'.png',
    alt: '한글 "<&\'',
    align: 'fixed',
    width: '99999%',
  });
  const doc = new JSDOM(text).window.document;
  const image = doc.querySelector('img');
  assert.equal(image.getAttribute('src'), 'folder/"<&\'.png');
  assert.equal(image.alt, '한글 "<&\'');
  assert.equal(image.dataset.zojAlign, 'center');
  assert.equal(image.dataset.zojWidth, '100%');
  assert.equal(doc.querySelectorAll('img').length, 1);
  assert.equal(api.normalizeImageWidth('calc(100% + 1px)'), undefined);
  assert.equal(api.normalizeImageWidth('40000px'), '4096px');
  assert.equal(api.normalizeImageWidth('Infinitypx'), undefined);
  assert.equal(api.normalizeImageWidth('auto'), undefined);
});
test('editing/removing one occurrence never removes another use or changes other text', async () => {
  const api = await engine();
  const value = '앞\n\n![one](same.png)\n\n중간\n\n![two](same.png)\n\n뒤';
  const [one, two] = api.parseStatementImages(value);
  const changed = api.replaceStatementImage(
    value,
    one,
    api.statementImageMarkup({
      source: one.source,
      alt: 'edited',
      align: 'left',
      width: '50%',
    }),
  );
  assert.equal(api.parseStatementImages(changed).length, 2);
  assert.ok(changed.includes(two.text));
  const removed = api.replaceStatementImage(value, one, '');
  assert.equal(api.parseStatementImages(removed).length, 1);
  assert.ok(removed.includes(two.text));
  assert.equal(api.replaceStatementImage('changed' + value, one, ''), null);
});
test('insert and movement preserve paragraphs and reject code or image interior targets', async () => {
  const api = await engine();
  const value = 'first\n\n![image](x.png)\n\nlast';
  const [image] = api.parseStatementImages(value);
  const above = api.moveStatementImage(value, image, 'above');
  assert.ok(above.startsWith(image.text));
  assert.ok(above.indexOf('first') < above.indexOf('last'));
  const below = api.moveStatementImage(value, image, 'below');
  assert.ok(below.indexOf('last') < below.indexOf(image.text));
  assert.equal(api.insertStatementImage('`literal`', 3, image.text), null);
  assert.equal(
    api.insertStatementImage('```\nliteral\n```', 6, image.text),
    null,
  );
  assert.equal(
    api.insertStatementImage(value, image.start + 3, image.text),
    null,
  );
  assert.equal(
    api.moveStatementImage(value, image, 0).match(/!\[image\]/g).length,
    1,
  );
});
test('legacy TeX images retain exact source through moves and literal code is excluded', async () => {
  const api = await engine();
  const value =
    'first\n\n\\includegraphics[width=0.5\\textwidth]{folder/그림.png}\n\nlast\n\n`\\includegraphics{fake.png}`';
  const images = api.parseStatementImages(value);
  assert.equal(images.length, 1);
  assert.equal(images[0].kind, 'tex');
  const moved = api.moveStatementImage(value, images[0], 0);
  assert.ok(moved.startsWith(images[0].text));
  assert.ok(moved.includes('`\\includegraphics{fake.png}`'));
});
test('upload context changes, read-only transitions and changed documents invalidate edits', async () => {
  const api = await engine();
  const original = { identity: 'problem-a/en', value: 'source' };
  assert.equal(api.imageEditContextMatches(original, original), true);
  for (const patch of [
    { identity: 'problem-b/en' },
    { identity: 'problem-a/ko' },
    { value: 'new source' },
    { readOnly: true },
  ])
    assert.equal(
      api.imageEditContextMatches({ ...original, ...patch }, original),
      false,
    );
});
test('uploaded images require matching signature, extension and declared MIME and bounded bytes', async () => {
  const api = await engine();
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);
  assert.equal(
    await api.validateStatementImageUpload(
      new File([png], '이미지.png', { type: 'image/png' }),
    ),
    'image/png',
  );
  assert.equal(
    await api.validateStatementImageUpload(new File([png], 'image.png')),
    'image/png',
  );
  for (const file of [
    new File([png], 'wrong.jpg', { type: 'image/jpeg' }),
    new File(['<svg>'], 'fake.png', { type: 'image/png' }),
    new File([png], 'file.png', { type: 'text/html' }),
    new File([], 'empty.png'),
    { size: api.STATEMENT_IMAGE_MAX_BYTES + 1 },
  ])
    await assert.rejects(() => api.validateStatementImageUpload(file));
});

const dom = new JSDOM('<body></body>', { pretendToBeVisual: true });
global.window = dom.window;
global.document = dom.window.document;
global.HTMLElement = dom.window.HTMLElement;
global.HTMLTextAreaElement = dom.window.HTMLTextAreaElement;
global.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = require('react-dom/client');
dom.window.HTMLDialogElement.prototype.showModal = function () {
  this.open = true;
};
dom.window.HTMLDialogElement.prototype.close = function () {
  this.open = false;
};
let root, host, changes, props;
beforeEach(() => {
  document.body.innerHTML = '';
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  changes = [];
  props = {
    identity: 'problem-a/ko/body',
    label: '문제 본문',
    value: 'first\n\nlast',
    assets: [{ id: 'one', source: 'asset://one', name: '그림.png' }],
    onChange: (value) => changes.push(value),
  };
});
afterEach(async () => {
  await act(() => root.unmount());
});
after(() => dom.window.close());
async function render(patch = {}) {
  props = { ...props, ...patch };
  const Tools = source(
    path.resolve(
      __dirname,
      editor
        ? '../src/components/StatementImageTools.tsx'
        : '../src/shared/ui/StatementImageTools.tsx',
    ),
    await ready,
  ).default;
  await act(() =>
    root.render(
      React.createElement(
        Tools,
        { ...props },
        React.createElement('textarea', {
          value: props.value,
          readOnly: props.readOnly,
          onChange: () => {},
        }),
      ),
    ),
  );
}
const buttons = () => [...document.querySelectorAll('button')];
async function click(label) {
  const button = buttons().find((b) => b.textContent.trim() === label);
  assert.ok(button, label);
  await act(() => button.click());
  return button;
}
async function paste(file) {
  const textarea = document.querySelector('textarea');
  const event = new window.Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: { files: [file] } });
  await act(async () => {
    textarea.dispatchEvent(event);
    await new Promise((resolve) => setImmediate(resolve));
  });
  return event;
}

test('tools insert at the captured textarea caret without submitting surrounding forms', async () => {
  await render();
  const textarea = document.querySelector('textarea');
  textarea.setSelectionRange(7, 7);
  await act(() => textarea.focus());
  await click('▧ 이미지 추가·관리');
  assert.equal(document.querySelector('dialog').parentElement, document.body);
  await click('커서 위치에 삽입');
  assert.equal(changes.length, 1);
  assert.ok(changes[0].indexOf('<img') < changes[0].indexOf('last'));
  assert.equal(document.querySelector('dialog'), null);
});
test('existing asset insertion is available without upload permission; read-only disables every mutation', async () => {
  await render();
  await click('▧ 이미지 추가·관리');
  assert.equal(document.querySelector('input[type=file]'), null);
  await click('커서 위치에 삽입');
  assert.equal(changes.length, 1);
  await render({
    readOnly: true,
    onUpload: () => {
      throw new Error('must not upload');
    },
  });
  assert.equal(document.querySelector('.statement-image-toolbar'), null);
  const event = await paste(new File(['x'], 'x.png', { type: 'image/png' }));
  assert.equal(event.defaultPrevented, false);
  assert.equal(changes.length, 1);
});
test('editing repeated occurrence exposes a single coherent replacement and removal keeps the asset', async () => {
  await render({ value: '![first](asset://one)\n\n![second](asset://one)' });
  await click('▧ 이미지 추가·관리');
  const occurrence = document.querySelectorAll(
    '.statement-image-occurrences button',
  )[1];
  await act(() => occurrence.click());
  await click('본문에서 제거');
  assert.equal(changes[0].includes('first'), true);
  assert.equal(changes[0].includes('second'), false);
  assert.equal(props.assets.length, 1);
});
test('an externally changed document disables the open editor instead of overwriting changes', async () => {
  await render();
  await click('▧ 이미지 추가·관리');
  await render({ value: 'newer edit' });
  const insert = buttons().find((b) => b.textContent === '커서 위치에 삽입');
  assert.equal(insert.disabled, true);
  assert.match(document.body.textContent, /편집 내용이 바뀌었습니다/);
  await act(() => insert.click());
  assert.equal(changes.length, 0);
});
test('an upload completing after a problem/language or value change never inserts into the new target', async () => {
  for (const patch of [
    { identity: 'problem-b/en/body' },
    { value: 'newer draft' },
    { readOnly: true },
  ]) {
    let finish;
    let calls = 0;
    await render({
      identity: 'problem-a/ko/body',
      value: 'first\n\nlast',
      readOnly: false,
      onUpload: () => {
        calls++;
        return new Promise((resolve) => {
          finish = resolve;
        });
      },
    });
    const png = new File(
      [Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0])],
      'picture.png',
      { type: 'image/png' },
    );
    const event = await paste(png);
    assert.equal(event.defaultPrevented, true);
    assert.equal(calls, 1);
    await render(patch);
    await act(async () =>
      finish({ id: 'new', source: 'new.png', name: 'new.png' }),
    );
    assert.equal(changes.length, 0);
  }
});
test('large or line-truncated text remains read-only for image tools and paste does not change it', async () => {
  const api = await engine();
  for (const value of [
    'x'.repeat(256 * 1024 + 1),
    'x'.repeat(16385),
    '\n'.repeat(5000),
    '😀'.repeat(8193),
  ]) {
    assert.equal(api.statementImageTextEditable(value), false);
    await render({
      value,
      onUpload: () => {
        throw new Error('must not upload');
      },
    });
    assert.equal(document.querySelector('.statement-image-toolbar'), null);
    const event = await paste(new File(['x'], 'x.png', { type: 'image/png' }));
    assert.equal(event.defaultPrevented, false);
    assert.equal(changes.length, 0);
  }
});
test('visiting another target and returning while an upload runs still invalidates the original edit', async () => {
  let finish;
  await render({
    onUpload: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  });
  await paste(
    new File(
      [Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0])],
      'picture.png',
      { type: 'image/png' },
    ),
  );
  await render({ identity: 'other' });
  await render({ identity: 'problem-a/ko/body' });
  await act(async () =>
    finish({ id: 'new', source: 'new.png', name: 'new.png' }),
  );
  assert.equal(changes.length, 0);
});
test('actual statement rendering applies only safe image layout and preserves the HTML security boundary', async () => {
  const Component = source(
    path.resolve(
      __dirname,
      editor
        ? '../src/components/Markdown.tsx'
        : '../src/shared/ui/MarkdownPreview.tsx',
    ),
    await ready,
  ).default;
  const markup =
    '<img src="asset://one" alt="safe &amp; accessible" data-zoj-align="right" data-zoj-width="75%" style="position:fixed" onerror="alert(1)">\n\n<img src="asset://one" data-zoj-align="fixed" data-zoj-width="calc(100% + 1px)"><script>alert(1)</script>';
  const url = 'https://authorized.test/image.png';
  const assets = editor
    ? { 'asset://one': url }
    : [
        {
          asset_id: 'one',
          download_url: url,
          original_filename: 'image.png',
          storage_key: 'authorized/image.png',
        },
      ];
  const componentProps = editor
    ? { children: markup, assets }
    : { statement: markup, assets };
  const html = require('react-dom/server').renderToStaticMarkup(
    React.createElement(Component, componentProps),
  );
  const doc = new JSDOM(html).window.document;
  const images = doc.querySelectorAll('img');
  assert.equal(images.length, 2);
  assert.equal(images[0].src, url);
  assert.equal(images[0].alt, 'safe & accessible');
  assert.equal(images[0].style.width, '75%');
  assert.equal(images[0].style.display, 'block');
  assert.equal(images[0].style.marginLeft, 'auto');
  assert.equal(images[0].style.marginRight, '0px');
  assert.equal(images[1].style.width, '');
  assert.equal(images[1].style.display, '');
  assert.equal(
    doc.querySelectorAll('[onerror],script,[style*="fixed"]').length,
    0,
  );
});
test('duplicate upload gestures start one request and unmounted completion does not change data', async () => {
  let finish;
  let calls = 0;
  await render({
    onUpload: () => {
      calls++;
      return new Promise((resolve) => {
        finish = resolve;
      });
    },
  });
  const png = new File(
    [Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0])],
    'picture.png',
    { type: 'image/png' },
  );
  await paste(png);
  await paste(png);
  assert.equal(calls, 1);
  await act(() => root.unmount());
  root = createRoot(host);
  await act(async () =>
    finish({ id: 'new', source: 'new.png', name: 'new.png' }),
  );
  assert.equal(changes.length, 0);
});
