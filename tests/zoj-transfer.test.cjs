const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'),
  path = require('node:path'),
  Module = require('node:module'),
  ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<body></body>', {
  url: 'https://editor.test',
  pretendToBeVisual: true,
});
global.window = dom.window;
global.document = dom.window.document;
global.IS_REACT_ACT_ENVIRONMENT = true;
window.HTMLDialogElement.prototype.showModal = function () {
  this.open = true;
};
window.HTMLDialogElement.prototype.close = function () {
  this.open = false;
};
const React = require('react'),
  { act, createElement: h } = React,
  { createRoot } = require('react-dom/client');
const { MemoryRouter } = require('react-router-dom');
let calls = [],
  failTargets = false,
  queued = false,
  failPrepare = false;
const project = {
  id: 'p',
  name: '합 문제',
  slug: 'sum',
  revision: 2,
  testsets: ['tests', 'edge'],
  statement_languages: ['korean'],
  uncommitted: false,
};
const job = {
  id: 'job',
  kind: 'package',
  status: 'completed',
  revision: 2,
  result: { package: { format: 'zoj', verified: true, filename: 'sum.zip' } },
  options: {},
};
async function api(url, options = {}) {
  calls.push({ url, body: options.body ? JSON.parse(options.body) : null });
  if (url.startsWith('/zoj-transfer/problems?'))
    return { problems: [project], folders: [], total: 1 };
  if (url === '/zoj-transfer/problems/p/packages') {
    if (failPrepare) throw Error('변경사항을 먼저 커밋하세요.');
    return queued ? { ...job, status: 'queued' } : job;
  }
  if (url === '/zoj-transfer/problems/p/packages/job') return job;
  if (url === '/zoj/contests')
    return {
      configured: true,
      email: 'author@example.com',
      contests: [
        {
          id: 'contest',
          title: '대회',
          locked: false,
          divisions: [
            { id: 'division', name: '일반부', code: 'D' },
            { id: 'junior', name: '초등부', code: 'J' },
          ],
        },
      ],
    };
  if (url === '/zoj/contests/contest/problems') {
    if (failTargets) throw Error('목록 연결 실패');
    return {
      problems: [
        {
          id: 'target',
          title: '기존 문제',
          code: 'A',
          division_id: 'division',
        },
        {
          id: 'junior-target',
          title: '기존 문제',
          code: 'A',
          division_id: 'junior',
        },
      ],
    };
  }
  if (url === '/problems/p/publish-zoj')
    return {
      problem_code: 'B',
      result: {
        title: '합 문제',
        url: 'https://zoj.kr/operator/contests/contest/problems',
      },
    };
  throw Error('Unexpected API ' + url);
}
const cache = new Map();
function source(relative) {
  const filename = path.resolve(__dirname, '../src', relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  const m = new Module(filename, module);
  m.paths = Module._nodeModulePaths(path.dirname(filename));
  const native = m.require.bind(m);
  m.require = (id) => {
    if (id.endsWith('.css')) return {};
    if (id.endsWith('/api'))
      return {
        api,
        post: (url, body) =>
          api(url, { method: 'POST', body: JSON.stringify(body) }),
        time: () => '',
      };
    if (id.endsWith('/authContext'))
      return {
        useAuth: () => ({
          user: { id: 'author', email: 'author@example.com' },
        }),
      };
    if (id.endsWith('/useRemotePage'))
      return {
        useRemotePage: () => ({
          data: { items: [], total: 0, page: 1, pages: 1, page_size: 20 },
          refresh: async () => {},
        }),
      };
    if (id === './ZojPackageUpdate')
      return {
        __esModule: true,
        default: (props) =>
          h(
            'div',
            { 'data-update': props.target.result.problem_id },
            '공통 업데이트 창',
          ),
      };
    if (id.startsWith('.')) {
      const file = ['.ts', '.tsx']
        .map((ext) => path.resolve(path.dirname(filename), id + ext))
        .find(fs.existsSync);
      return source(path.relative(path.resolve(__dirname, '../src'), file));
    }
    return native(id);
  };
  cache.set(filename, m);
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
const Transfer = source('pages/ZojTransfer.tsx').default;
after(() => dom.window.close());
async function setup() {
  calls = [];
  failTargets = false;
  queued = false;
  failPrepare = false;
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () =>
    root.render(
      h(
        MemoryRouter,
        {
          initialEntries: [
            '/problems/zoj-transfer?contest=contest&division=division',
          ],
        },
        h(Transfer),
      ),
    ),
  );
  return {
    host,
    close: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}
async function click(host, text) {
  const b = [...host.querySelectorAll('button')].find(
    (b) => b.textContent.trim() === text,
  );
  assert.ok(b, text);
  await act(async () => b.click());
}
async function prepare(v) {
  await click(v.host, '합 문제sum · r2');
  await click(v.host, '검증 패키지 준비');
  await click(v.host, '대회 등록 · 업데이트');
}
async function input(element, value) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value',
  ).set;
  await act(async () => {
    setter.call(element, value);
    element.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
}

test('The picker and the existing Editor publishing modal use one publish API with prefilled destination and duplicate checks', async () => {
  const v = await setup();
  try {
    await prepare(v);
    const d = v.host.querySelector('dialog');
    const selects = d.querySelectorAll('select');
    assert.equal(selects[0].value, 'contest');
    assert.equal(selects[2].value, 'division');
    const choices = [...selects[1].options].map((option) => option.textContent);
    assert.ok(choices.includes('일반부 · A. 기존 문제 업데이트'));
    assert.ok(choices.includes('초등부 · A. 기존 문제 업데이트'));

    await input(d.querySelector('input'), 'A');
    assert.equal(
      [...d.querySelectorAll('button')].find(
        (b) => b.textContent === '이 대회에 새 문제 등록',
      ).disabled,
      true,
    );
    await input(d.querySelector('input'), 'B');
    await click(d, '이 대회에 새 문제 등록');
    const sent = calls.filter((c) => c.url.endsWith('/publish-zoj'));
    assert.equal(sent.length, 1);
    assert.deepEqual(sent[0].body, {
      job_id: 'job',
      contest_id: 'contest',
      division_id: 'division',
      problem_code: 'B',
    });
    assert.equal(
      v.host.querySelector(
        'a[href="https://zoj.kr/operator/contests/contest/problems"]',
      ).textContent,
      'ZOJ에서 확인',
    );
  } finally {
    await v.close();
  }
});
test('An existing destination uses the same update component without creating a second problem', async () => {
  const v = await setup();
  try {
    await prepare(v);
    const select = v.host.querySelector('select[aria-label="등록 방식"]');
    await act(async () => {
      select.value = 'target';
      select.dispatchEvent(new window.Event('change', { bubbles: true }));
    });
    await click(v.host.querySelector('dialog'), '변경 내용 확인');
    assert.ok(v.host.querySelector('[data-update="target"]'));
    assert.equal(
      calls.some((c) => c.url.endsWith('/publish-zoj')),
      false,
    );
  } finally {
    await v.close();
  }
});
test('Target lookup errors keep submission disabled instead of guessing that the destination is empty', async () => {
  const v = await setup();
  try {
    failTargets = true;
    await prepare(v);
    const d = v.host.querySelector('dialog');
    assert.match(d.textContent, /목록 연결 실패/);
    assert.equal(
      [...d.querySelectorAll('button')].find(
        (b) => b.textContent === '이 대회에 새 문제 등록',
      ).disabled,
      true,
    );
    assert.equal(
      calls.some((c) => c.url.endsWith('/publish-zoj')),
      false,
    );
  } finally {
    await v.close();
  }
});

test('Queued preparation exposes progress and uses the same bound job until ready', async () => {
  const v = await setup();
  try {
    queued = true;
    await click(v.host, '합 문제sum · r2');
    await click(v.host, '검증 패키지 준비');
    assert.ok(
      v.host.querySelector('progress[aria-label="검증 패키지 준비 진행률"]'),
    );
    assert.match(
      v.host.querySelector('a[href*="invocations?job="]').href,
      /invocations\?job=job$/,
    );
    await act(async () => {
      await new Promise((resolve) => globalThis.setTimeout(resolve, 1100));
    });
    assert.ok(
      calls.some((c) => c.url === '/zoj-transfer/problems/p/packages/job'),
    );
    assert.equal(v.host.querySelector('progress'), null);
    assert.equal(
      [...v.host.querySelectorAll('button')].find(
        (b) => b.textContent.trim() === '대회 등록 · 업데이트',
      ).disabled,
      false,
    );
  } finally {
    await v.close();
  }
});

test('A failed preparation cannot leave an older package enabled for publishing', async () => {
  const v = await setup();
  try {
    await prepare(v);
    await click(v.host.querySelector('dialog'), '취소');
    failPrepare = true;
    await click(v.host, '검증 패키지 준비');
    assert.match(v.host.textContent, /변경사항을 먼저 커밋하세요/);
    assert.equal(
      [...v.host.querySelectorAll('button')].find(
        (b) => b.textContent.trim() === '대회 등록 · 업데이트',
      ).disabled,
      true,
    );
    assert.equal(
      calls.some((c) => c.url.endsWith('/publish-zoj')),
      false,
    );
  } finally {
    await v.close();
  }
});
