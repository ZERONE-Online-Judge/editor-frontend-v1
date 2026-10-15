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
const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
window.HTMLDialogElement.prototype.showModal = function () {
  this.open = true;
};
window.HTMLDialogElement.prototype.close = function () {
  this.open = false;
};
let context;
let failSamples = false;
let printing = [];
const longInput = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`).join(
  '\n',
);
window.print = () => {
  printing.push({
    modalOpen: Boolean(document.querySelector('dialog[open]')),
    editorial:
      document.querySelector('.review-editorial').dataset.printIncluded,
    watermark: document.querySelector('.review-print-watermark').dataset
      .printIncluded,
    title: document.querySelector('.problem-preview h1').textContent,
    sample: document.querySelector('.review-sample-print pre')?.textContent,
  });
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
    if (id.endsWith('/workspace')) return { useWorkspace: () => context };
    if (id.endsWith('/api'))
      return {
        blobText: async (_problem, sha) => {
          if (failSamples) throw new Error('Unavailable');
          return sha === 'sample-input' ? longInput : '30\n';
        },
      };
    if (id.endsWith('/Markdown'))
      return {
        __esModule: true,
        default: ({ children }) =>
          React.createElement('div', { className: 'markdown' }, children),
      };
    if (id.endsWith('.css')) return {};
    if (id.startsWith('.')) {
      const target = ['.ts', '.tsx']
        .map((extension) => path.resolve(path.dirname(file), id + extension))
        .find((candidate) => fs.existsSync(candidate));
      return source(path.relative(path.resolve(__dirname, '../src'), target));
    }
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
const Review = source('pages/workspace/Review.tsx').default;

async function mount(sampleOverrides = {}, sharedOverrides = {}) {
  const statement = {
    name: '줄 세기',
    legend: '줄의 개수를 구하세요.',
    input: '문자열 30개',
    output: '줄 개수',
    scoring: '30점',
    interaction: '',
    notes: '빈 줄도 셉니다.',
    tutorial: 'SECRET_EDITORIAL: 반복문으로 줄을 셉니다.',
    show_in_review: true,
  };
  context = {
    data: { problem: { id: 'print-fixture' } },
    document: {
      info: {
        name: '줄 세기',
        time_limit_ms: 1000,
        memory_limit_mb: 256,
        input_file: 'stdin',
        output_file: 'stdout',
      },
      statements: {
        korean: statement,
        english: { ...statement, name: 'Count lines' },
      },
      ...sharedOverrides,
      testsets: {
        tests: {
          tests: {
            one: {
              sample: true,
              input_sha: 'sample-input',
              answer_sha: 'sample-answer',
              ...sampleOverrides,
            },
          },
        },
      },
    },
  };
  printing = [];
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(React.createElement(Review)));
  return {
    host,
    close: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}
function button(host, text) {
  return [...host.querySelectorAll('button')].find(
    (item) => item.textContent === text,
  );
}

test('review and print use separate display samples including an empty override', async () => {
  const { host, close } = await mount({
    statement_input: 'friendly display\n',
    statement_output: '',
    verify_statement_io: false,
  });
  const samples = [...host.querySelectorAll('.review-sample-print pre')];
  assert.equal(samples[0].textContent, 'friendly display\n');
  assert.equal(samples[1].textContent, '');
  assert.equal(
    context.document.testsets.tests.tests.one.input_sha,
    'sample-input',
  );
  assert.equal(
    context.document.testsets.tests.tests.one.answer_sha,
    'sample-answer',
  );
  await close();
});

test('common editorial stays in the excluded editorial print section', async () => {
  const { host, close } = await mount(
    {},
    {
      common_statement: 'COMMON_PROBLEM',
      common_tutorial: 'SECRET_COMMON_TUTORIAL',
    },
  );
  assert.match(host.textContent, /COMMON_PROBLEM/);
  const editorial = host.querySelector('.review-editorial');
  assert.match(editorial.textContent, /SECRET_COMMON_TUTORIAL/);
  assert.equal(editorial.dataset.printIncluded, 'false');
  await close();
});
function checkbox(host, label) {
  return [...host.querySelectorAll('label')]
    .find((item) => item.textContent.startsWith(label))
    .querySelector('input');
}
async function click(element) {
  await act(async () => element.click());
}

test('Default printing excludes the editorial, preserves complete examples and closes options before print', async () => {
  failSamples = false;
  const view = await mount();
  assert.equal(
    view.host.querySelector('.review-editorial').dataset.printIncluded,
    'false',
  );
  assert.match(
    view.host.querySelector('.review-editorial').textContent,
    /SECRET_EDITORIAL/,
  );
  await click(button(view.host, '인쇄'));
  assert.equal(checkbox(view.host, '해설 · 검수용').checked, false);
  assert.equal(checkbox(view.host, '하단 ZOJ 워터마크').checked, true);
  assert.equal(checkbox(view.host, '인터랙션 프로토콜').disabled, true);
  await click(button(view.host, '선택한 범위 인쇄'));
  assert.deepEqual(printing, [
    {
      modalOpen: false,
      editorial: 'false',
      watermark: 'true',
      title: '줄 세기',
      sample: longInput,
    },
  ]);
  await view.close();
});

test('Selections apply only to print, retain the chosen language and allow removing the watermark', async () => {
  const view = await mount();
  await act(async () => {
    const language = view.host.querySelector('select');
    language.value = 'english';
    language.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
  await click(button(view.host, '인쇄'));
  await click(checkbox(view.host, '해설 · 검수용'));
  await click(checkbox(view.host, '하단 ZOJ 워터마크'));
  await click(checkbox(view.host, '입력 형식'));
  const inputSection = [
    ...view.host.querySelectorAll('.problem-preview > section'),
  ].find((section) => section.querySelector('h2')?.textContent === '입력');
  assert.equal(inputSection.dataset.printIncluded, 'false');
  assert.match(inputSection.textContent, /문자열 30개/);
  await click(button(view.host, '선택한 범위 인쇄'));
  assert.equal(printing[0].title, 'Count lines');
  assert.equal(printing[0].editorial, 'true');
  assert.equal(printing[0].watermark, 'false');
  await click(button(view.host, '인쇄'));
  assert.equal(checkbox(view.host, '해설 · 검수용').checked, true);
  assert.equal(checkbox(view.host, '하단 ZOJ 워터마크').checked, false);
  await click(button(view.host, '기본값 복원'));
  assert.equal(checkbox(view.host, '해설 · 검수용').checked, false);
  assert.equal(checkbox(view.host, '하단 ZOJ 워터마크').checked, true);
  await view.close();
});

test('Empty print ranges and failed sample loads cannot create misleading printed documents', async () => {
  failSamples = true;
  const view = await mount();
  await click(button(view.host, '인쇄'));
  assert.equal(button(view.host, '선택한 범위 인쇄').disabled, true);
  assert.equal(view.host.querySelector('.review-sample-print'), null);
  await click(checkbox(view.host, '예제 입력 · 출력'));
  assert.equal(button(view.host, '선택한 범위 인쇄').disabled, false);
  for (const input of [
    ...view.host.querySelectorAll('.review-print-range input'),
  ].filter((input) => input.checked && !input.disabled))
    await click(input);
  assert.equal(button(view.host, '선택한 범위 인쇄').disabled, true);
  assert.equal(checkbox(view.host, '하단 ZOJ 워터마크').checked, true);
  assert.equal(printing.length, 0);
  await view.close();
  failSamples = false;
});

after(() => dom.window.close());
