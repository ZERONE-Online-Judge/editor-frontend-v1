const { test, beforeEach, afterEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { File } = require('node:buffer');
const { TextEncoder } = require('node:util');
const { structuredClone, setTimeout } = global;
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<body></body>', { pretendToBeVisual: true });
global.window = dom.window;
global.document = dom.window.document;
global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const h = React.createElement;
let context, controls, host, root, calls, pending, tools;
const sources = new Map();
function source(relative) {
  const filename = path.resolve(__dirname, '../src', relative);
  if (sources.has(filename)) return sources.get(filename).exports;
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const native = loaded.require.bind(loaded);
  loaded.require = (id) => {
    if (id.endsWith('.css')) return {};
    if (id === 'react-router-dom')
      return { Link: ({ to, children }) => h('a', { href: to }, children) };
    if (id.endsWith('/workspace')) return { useWorkspace: () => context };
    if (id.endsWith('/api'))
      return {
        upload: (problemId, file) => {
          calls.push({ problemId, file });
          return new Promise((resolve) => pending.push(resolve));
        },
      };
    if (id.endsWith('/StatementImageTools'))
      return {
        __esModule: true,
        default: (props) => {
          tools.set(props.identity, props);
          return h(
            'div',
            { 'data-image-tools': props.identity },
            props.children,
          );
        },
      };
    if (id.endsWith('/Markdown'))
      return {
        __esModule: true,
        default: ({ children }) => h('div', null, children),
      };
    if (id.startsWith('.')) {
      const base = path.resolve(path.dirname(filename), id);
      const file = ['.ts', '.tsx']
        .map((extension) => base + extension)
        .find(fs.existsSync);
      if (file)
        return source(path.relative(path.resolve(__dirname, '../src'), file));
    }
    return native(id);
  };
  sources.set(filename, loaded);
  loaded._compile(
    ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    filename,
  );
  return loaded.exports;
}
const Statements = source('pages/workspace/Statements.tsx').default;
const Image = source('components/StatementImage.tsx').default;
const { statementImageAssets, statementImageMime } = source(
  'lib/statementAssets.ts',
);
const pngBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
const png = (name = 'diagram.png') =>
  new File([pngBytes], name, { type: 'image/png' });
const resource = (name, kind = 'statement', sha = 'a'.repeat(64)) => ({
  name,
  kind,
  sha256: sha,
  size: 12,
  language: 'text',
});
function fixture() {
  const statement = {
    name: '이미지 문제',
    legend: '첫 문단\n\n마지막 문단',
    input: '',
    output: '',
    scoring: '',
    interaction: '',
    notes: '',
    tutorial: '',
    show_in_review: true,
  };
  return {
    info: { name: '이미지 문제', interactive: true },
    statements: { korean: { ...statement }, english: { ...statement } },
    translation_source: 'korean',
    common_statement: '',
    common_tutorial: '',
    files: { 'diagram.png': resource('diagram.png') },
    solutions: { 'main.cpp': resource('main.cpp', 'source') },
  };
}
function Harness({ component = Statements }) {
  const [doc, setDoc] = React.useState(fixture);
  const [problem, setProblem] = React.useState({
    id: 'problem-one',
    role: 'OWNER',
    permissions: ['edit_statements', 'edit_files', 'render'],
    translator: false,
  });
  const [busy, setBusy] = React.useState(false);
  context = {
    data: { problem },
    document: doc,
    editable: problem.permissions.includes('edit_statements'),
    busy,
    mutate: (fn) =>
      setDoc((previous) => {
        const next = structuredClone(previous);
        fn(next);
        return next;
      }),
    notify: () => {},
    run: async () => {},
  };
  controls = { setDoc, setProblem, setBusy };
  return h(component);
}
beforeEach(() => {
  calls = [];
  pending = [];
  tools = new Map();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
after(() => dom.window.close());
const mount = async (component) =>
  act(async () => root.render(h(Harness, { component })));
const button = (text) =>
  [...host.querySelectorAll('button')].find(
    (item) => item.textContent === text,
  );
const activeTools = () =>
  [...host.querySelectorAll('[data-image-tools]')].map((item) =>
    tools.get(item.dataset.imageTools),
  );
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test('all language fields and both shared fields use the same cursor-aware image controls', async () => {
  await mount();
  assert.equal(activeTools().length, 9);
  for (const props of activeTools()) {
    assert.equal(props.readOnly, false);
    assert.equal(typeof props.onUpload, 'function');
    assert.equal(props.assets[0].source, 'diagram.png');
    assert.match(
      props.assets[0].previewUrl,
      /^\/api\/problems\/problem-one\/blobs\//,
    );
  }
  const legend = tools.get('problem-one/korean/legend');
  await act(async () =>
    legend.onChange(
      '앞\n\n<img src="diagram.png" alt="그림" data-zoj-align="center">\n\n뒤',
    ),
  );
  assert.match(context.document.statements.korean.legend, /<img.*뒤/s);
  assert.equal(
    context.document.statements.english.legend,
    '첫 문단\n\n마지막 문단',
  );
  await act(async () => button('English').click());
  assert.ok(
    host.querySelector('[data-image-tools="problem-one/english/tutorial"]'),
  );
  assert.equal(
    activeTools().filter((item) => item.identity.includes('/english/')).length,
    7,
  );
});

test('translators reuse images only in translated fields and cannot upload or edit shared source fields', async () => {
  await mount();
  await act(async () =>
    controls.setProblem({
      id: 'problem-one',
      role: 'READ',
      permissions: ['translate'],
      translator: true,
    }),
  );
  assert.ok(activeTools().every((item) => item.readOnly));
  await act(async () => button('English').click());
  for (const props of activeTools()) {
    assert.equal(props.readOnly, !props.identity.includes('/english/'));
    assert.equal(props.onUpload, undefined);
    assert.equal(props.assets.length, 1);
  }
  await act(async () =>
    tools.get('problem-one/english/legend').onChange('번역에 그림 삽입'),
  );
  assert.equal(context.document.statements.english.legend, '번역에 그림 삽입');
  assert.equal(
    context.document.statements.korean.legend,
    '첫 문단\n\n마지막 문단',
  );
  assert.deepEqual(calls, []);
});

test('concurrent image uploads preserve draft changes and existing files while allocating distinct resource names', async () => {
  await mount();
  const originalFiles = structuredClone(context.document.files);
  const originalSolutions = structuredClone(context.document.solutions);
  const first = tools.get('problem-one/korean/legend').onUpload(png());
  const second = tools.get('problem-one/korean/tutorial').onUpload(png());
  await act(async () => {
    await tick();
  });
  assert.equal(calls.length, 2);
  assert.deepEqual(
    calls.map((call) => call.problemId),
    ['problem-one', 'problem-one'],
  );
  await act(async () =>
    context.mutate((doc) => {
      doc.statements.korean.legend += '\n동시에 작성한 문장';
      doc.files['additional.txt'] = resource('additional.txt', 'aux');
    }),
  );
  await act(async () => {
    pending[0]({ sha256: 'b'.repeat(64), size: 12 });
    pending[1]({ sha256: 'c'.repeat(64), size: 12 });
    await tick();
  });
  const assets = await Promise.all([first, second]);
  assert.notEqual(assets[0].source, assets[1].source);
  assert.notEqual(assets[0].source, 'diagram.png');
  for (const asset of assets) {
    assert.equal(context.document.files[asset.source].kind, 'statement');
    assert.equal(context.document.files[asset.source].language, 'text');
    assert.ok(asset.source.endsWith('.png'));
  }
  assert.deepEqual(
    context.document.files['diagram.png'],
    originalFiles['diagram.png'],
  );
  assert.deepEqual(context.document.solutions, originalSolutions);
  assert.ok(context.document.files['additional.txt']);
  assert.match(
    context.document.statements.korean.legend,
    /동시에 작성한 문장$/,
  );
});

test('image resource filenames satisfy the server ASCII, traversal and length rules for ordinary camera names', async () => {
  await mount();
  for (const filename of [
    '스크린샷 2026-11-07.png',
    '📷 사진.png',
    'a..b.png',
    '---.preview.png',
    'long'.repeat(100) + '.png',
  ]) {
    const result = tools
      .get('problem-one/korean/legend')
      .onUpload(png(filename));
    await act(async () => {
      await tick();
    });
    await act(async () => {
      pending.at(-1)({ sha256: 'e'.repeat(64), size: 12 });
      await tick();
    });
    const asset = await result;
    assert.match(asset.source, /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,99}$/);
    assert.equal(asset.source.includes('..'), false);
    assert.equal(asset.source, context.document.files[asset.source].name);
    assert.ok(asset.source.endsWith('.png'));
  }
  assert.equal(Object.keys(context.document.files).length, 6);
});

test('a completed upload cannot modify a different problem or language after navigation', async () => {
  for (const switchProblem of [false, true]) {
    await mount();
    let rejected;
    const result = tools
      .get('problem-one/korean/legend')
      .onUpload(png())
      .catch((error) => {
        rejected = error;
      });
    await act(async () => {
      await tick();
    });
    const complete = pending.at(-1);
    if (switchProblem) {
      await act(async () => {
        controls.setProblem({
          id: 'problem-two',
          role: 'OWNER',
          permissions: ['edit_statements', 'edit_files'],
        });
        controls.setDoc(fixture());
      });
    } else await act(async () => button('English').click());
    await act(async () => {
      complete({ sha256: 'd'.repeat(64), size: 12 });
      await tick();
    });
    await result;
    assert.match(rejected.message, /지문이 바뀌어/);
    assert.equal(Object.keys(context.document.files).length, 1);
    assert.equal(
      context.document.statements.english.legend,
      '첫 문단\n\n마지막 문단',
    );
    await act(async () => root.unmount());
    root = createRoot(host);
  }
});

test('read-only, busy and revoked file permissions never grant image upload access', async () => {
  await mount();
  const oldUpload = tools.get('problem-one/korean/legend').onUpload;
  await act(async () =>
    controls.setProblem({
      id: 'problem-one',
      role: 'READ',
      permissions: ['edit_statements'],
    }),
  );
  assert.ok(activeTools().every((item) => item.onUpload === undefined));
  await assert.rejects(oldUpload(png()), /파일 편집 권한/);
  await act(async () => controls.setBusy(true));
  assert.ok(activeTools().every((item) => item.readOnly));
  assert.deepEqual(calls, []);
});

test('invalid or mismatched image content is rejected before any blob upload', async () => {
  await mount();
  const upload = tools.get('problem-one/korean/legend').onUpload;
  await assert.rejects(
    upload(new File(['<svg></svg>'], 'image.svg', { type: 'image/svg+xml' })),
    /PNG, JPEG, WEBP/,
  );
  await assert.rejects(upload(png('mismatch.jpg')), /PNG, JPEG, WEBP/);
  await assert.rejects(
    upload(new File([], 'empty.png', { type: 'image/png' })),
    /16MiB/,
  );
  assert.deepEqual(calls, []);
  assert.equal(Object.keys(context.document.files).length, 1);
});

test('gallery entries remain authorized statement resources and do not expose unrelated files', () => {
  const files = {
    'figure.svg': resource('figure.svg'),
    'photo.avif': resource('photo.avif'),
    'animation.gif': resource('animation.gif'),
    'private.cpp': resource('private.cpp', 'source'),
    'archive.zip': resource('archive.zip'),
  };
  assert.deepEqual(
    statementImageAssets('problem-one', files).map((asset) => asset.source),
    ['figure.svg', 'photo.avif', 'animation.gif'],
  );
  assert.ok(
    statementImageAssets('problem-one', files).every((asset) =>
      asset.previewUrl.startsWith('/api/problems/problem-one/blobs/'),
    ),
  );
  assert.equal(
    statementImageMime(
      new TextEncoder().encode(
        '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
      ),
    ),
    'image/svg+xml',
  );
  assert.equal(
    statementImageMime(
      new TextEncoder().encode('<html><script>alert(1)</script></html>'),
    ),
    null,
  );
});

test('SVG thumbnails and statements accept descriptive alt text and do not refetch when only alt changes', async () => {
  const previousFetch = global.fetch;
  const previousCreate = global.URL.createObjectURL;
  const previousRevoke = global.URL.revokeObjectURL;
  const created = [];
  const revoked = [];
  let reads = 0;
  global.fetch = async () => {
    reads++;
    return {
      ok: true,
      arrayBuffer: async () =>
        new TextEncoder().encode(
          '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
        ).buffer,
    };
  };
  global.URL.createObjectURL = (blob) => {
    created.push(blob);
    return 'blob:test-image';
  };
  global.URL.revokeObjectURL = (url) => revoked.push(url);
  const props = {
    src: '/api/problems/problem-one/blobs/' + 'a'.repeat(64),
    alt: '트리 구조를 설명하는 그림',
    properties: { 'data-zoj-align': 'right', 'data-zoj-width': '50%' },
  };
  try {
    await act(async () => {
      root.render(h(Image, props));
      await tick();
    });
    const image = host.querySelector('img');
    assert.ok(image);
    assert.equal(image.alt, props.alt);
    assert.equal(image.style.width, '50%');
    assert.equal(image.style.marginRight, '0px');
    assert.equal(created[0].type, 'image/svg+xml');
    await act(async () =>
      root.render(h(Image, { ...props, alt: '다른 설명' })),
    );
    assert.equal(reads, 1);
    assert.equal(host.querySelector('img').alt, '다른 설명');
    await act(async () => root.unmount());
    assert.deepEqual(revoked, ['blob:test-image']);
    root = createRoot(host);
  } finally {
    global.fetch = previousFetch;
    global.URL.createObjectURL = previousCreate;
    global.URL.revokeObjectURL = previousRevoke;
  }
});

test('statement image placeholder spans authenticated fetch, native loading and decode without changing declared layout', async () => {
  const previousFetch = global.fetch;
  const previousCreate = global.URL.createObjectURL;
  const previousRevoke = global.URL.revokeObjectURL;
  let receive, decoded;
  const reads = [],
    revoked = [];
  global.fetch = (url, options) => {
    reads.push({ url, credentials: options.credentials });
    return new Promise((resolve) => {
      receive = resolve;
    });
  };
  global.URL.createObjectURL = () => 'blob:loading-lifecycle';
  global.URL.revokeObjectURL = (url) => revoked.push(url);
  const props = {
    src: '/api/problems/problem-one/blobs/' + 'a'.repeat(64),
    alt: '느리게 도착하는 그림',
    properties: {
      'data-zoj-align': 'right',
      'data-zoj-width': '50%',
      'data-tex-height': '120px',
    },
  };
  try {
    await act(async () => root.render(h(Image, props)));
    const status = host.querySelector('[data-statement-image-state=loading]');
    assert.match(status.textContent, /이미지를 불러오고 있습니다/);
    assert.equal(status.style.width, '50%');
    assert.equal(status.style.height, '120px');
    assert.equal(status.style.minHeight, '0');
    assert.equal(status.style.marginRight, '0px');
    assert.equal(host.querySelector('img'), null);
    await act(async () => {
      receive({ ok: true, arrayBuffer: async () => pngBytes.buffer });
      await tick();
    });
    const image = host.querySelector('img');
    assert.ok(image);
    assert.equal(image.className, 'statement-image-pending');
    assert.ok(host.querySelector('[data-statement-image-state=loading]'));
    Object.defineProperty(image, 'naturalWidth', { value: 100 });
    image.decode = () =>
      new Promise((resolve) => {
        decoded = resolve;
      });
    await act(async () => image.dispatchEvent(new window.Event('load')));
    assert.ok(host.querySelector('[data-statement-image-state=loading]'));
    await act(async () => decoded());
    assert.equal(
      host.querySelector('[data-statement-image-state=loading]'),
      null,
    );
    assert.equal(image.dataset.statementImageState, 'ready');
    assert.equal(image.className, '');
    assert.equal(image.style.width, '50%');
    assert.equal(image.parentElement, host);
    assert.deepEqual(reads, [{ url: props.src, credentials: 'same-origin' }]);
    await act(async () => root.unmount());
    root = createRoot(host);
    assert.deepEqual(revoked, ['blob:loading-lifecycle']);
  } finally {
    global.fetch = previousFetch;
    global.URL.createObjectURL = previousCreate;
    global.URL.revokeObjectURL = previousRevoke;
  }
});

test('statement image errors are visible and stale source decodes cannot clear a newer failure', async () => {
  let finishOld;
  await act(async () =>
    root.render(
      h(Image, {
        src: 'https://assets.example.test/first.png',
        alt: '첫 그림',
        properties: {},
      }),
    ),
  );
  const first = host.querySelector('img');
  Object.defineProperty(first, 'naturalWidth', { value: 100 });
  first.decode = () =>
    new Promise((resolve) => {
      finishOld = resolve;
    });
  await act(async () => first.dispatchEvent(new window.Event('load')));
  await act(async () =>
    root.render(
      h(Image, {
        src: 'https://assets.example.test/second.png',
        alt: '새 그림',
        properties: {},
      }),
    ),
  );
  const second = host.querySelector('img');
  assert.equal(first === second, false);
  await act(async () => second.dispatchEvent(new window.Event('error')));
  assert.match(host.textContent, /이미지를 불러오지 못했습니다/);
  assert.match(host.textContent, /새 그림/);
  await act(async () => finishOld());
  assert.ok(host.querySelector('[data-statement-image-state=error]'));
  assert.equal(host.querySelector('img'), null);
  assert.equal(host.querySelector('a,button'), null);
  await act(async () =>
    root.render(
      h(Image, {
        src: 'https://assets.example.test/third.png',
        alt: '디코드 실패',
        properties: {},
      }),
    ),
  );
  const third = host.querySelector('img');
  Object.defineProperty(third, 'naturalWidth', { value: 100 });
  third.decode = async () => {
    throw new Error('private decoder detail');
  };
  await act(async () => third.dispatchEvent(new window.Event('load')));
  assert.ok(host.querySelector('[data-statement-image-state=error]'));
  assert.equal(host.textContent.includes('private decoder detail'), false);
  await act(async () =>
    root.render(
      h(Image, {
        src: 'https://assets.example.test/fourth.png',
        alt: '디코드 중 실패',
        properties: {},
      }),
    ),
  );
  const fourth = host.querySelector('img');
  Object.defineProperty(fourth, 'naturalWidth', { value: 100 });
  let completeDecode,
    decodes = 0;
  fourth.decode = () => {
    decodes++;
    return new Promise((resolve) => {
      completeDecode = resolve;
    });
  };
  await act(async () => {
    fourth.dispatchEvent(new window.Event('load'));
    fourth.dispatchEvent(new window.Event('load'));
  });
  assert.equal(decodes, 1);
  await act(async () => {
    fourth.dispatchEvent(new window.Event('error'));
    completeDecode();
  });
  assert.ok(host.querySelector('[data-statement-image-state=error]'));
  assert.equal(host.querySelector('[data-statement-image-state=ready]'), null);
});

test('failed authorized fetch and unmounted native decode keep their lifecycle isolated', async () => {
  const previousFetch = global.fetch;
  global.fetch = async () => {
    throw new Error('private connection detail');
  };
  try {
    await act(async () => {
      root.render(
        h(Image, {
          src: '/api/problems/problem-one/blobs/' + 'b'.repeat(64),
          alt: '권한이 필요한 그림',
          properties: {},
        }),
      );
      await tick();
    });
    assert.ok(host.querySelector('[data-statement-image-state=error]'));
    assert.match(host.textContent, /권한이 필요한 그림/);
    assert.equal(host.textContent.includes('private connection detail'), false);
  } finally {
    global.fetch = previousFetch;
  }
  await act(async () =>
    root.render(
      h(Image, {
        src: 'https://assets.example.test/slow.png',
        alt: '느린 그림',
        compact: true,
        properties: {},
      }),
    ),
  );
  assert.ok(host.querySelector('[data-compact]'));
  let finish;
  const image = host.querySelector('img');
  Object.defineProperty(image, 'naturalWidth', { value: 100 });
  image.decode = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  await act(async () => image.dispatchEvent(new window.Event('load')));
  await act(async () => root.unmount());
  root = createRoot(host);
  await act(async () => finish());
  assert.equal(host.textContent, '');
});
