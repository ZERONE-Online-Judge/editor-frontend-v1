const { test, beforeEach, afterEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><body></body>', {
  pretendToBeVisual: true,
});
global.window = dom.window;
global.document = dom.window.document;
global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { act, createElement: h } = React;
const { createRoot } = require('react-dom/client');
let clock = 0;
let sequence = 0;
let reduced = false;
let hidden = false;
const frames = new Map();
const listeners = new Set();
Object.defineProperty(window.performance, 'now', { value: () => clock });
Object.defineProperty(document, 'visibilityState', {
  get: () => (hidden ? 'hidden' : 'visible'),
});
window.matchMedia = () => ({
  get matches() {
    return reduced;
  },
  addEventListener: (_, callback) => listeners.add(callback),
  removeEventListener: (_, callback) => listeners.delete(callback),
});
window.requestAnimationFrame = (callback) => {
  const id = ++sequence;
  frames.set(id, callback);
  return id;
};
window.cancelAnimationFrame = (id) => frames.delete(id);
const cache = new Map();
function load(relative) {
  const file = path.resolve(__dirname, '../src', relative);
  if (cache.has(file)) return cache.get(file).exports;
  const m = new Module(file, module);
  m.filename = file;
  m.paths = Module._nodeModulePaths(path.dirname(file));
  const native = m.require.bind(m);
  m.require = (id) => {
    if (id.endsWith('/ui'))
      return { Badge: ({ children }) => h('span', null, children) };
    if (id.startsWith('.')) {
      const target = ['.ts', '.tsx']
        .map((ext) => path.resolve(path.dirname(file), id + ext))
        .find(fs.existsSync);
      return load(path.relative(path.resolve(__dirname, '../src'), target));
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
const { boundedProgress } = load('lib/progressMotion.ts');
const { MotionNumber, MotionProgress, MotionCountText, ResultTransition } =
  load('components/ProgressMotion.tsx');
const VerificationProgress = load(
  'pages/workspace/VerificationProgress.tsx',
).default;
let host, root;
beforeEach(() => {
  clock = 0;
  reduced = false;
  hidden = false;
  frames.clear();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  assert.equal(frames.size, 0, 'no scheduled work survives unmount');
  assert.equal(listeners.size, 0, 'media subscriptions are released');
  host.remove();
});
after(() => dom.window.close());
async function render(value, scope = 'job-a', max = 100) {
  await act(async () =>
    root.render(
      h(
        'div',
        null,
        h(MotionNumber, { value, scope, max }),
        h(MotionProgress, { value, scope, max, 'aria-label': '실행 진행률' }),
      ),
    ),
  );
}
async function advance(ms) {
  clock += ms;
  const pending = [...frames.entries()];
  frames.clear();
  await act(async () => pending.forEach(([, callback]) => callback(clock)));
}
const number = () =>
  Number(
    host
      .querySelector('[data-motion-value]')
      .dataset.motionValue.replaceAll(',', ''),
  );
const bar = () => host.querySelector('progress');

test('reported progress interpolates monotonically, never invents completion, and settles exactly', async () => {
  await render(20);
  assert.equal(number(), 20, 'history is not replayed from zero on entry');
  await advance(16);
  await render(78);
  assert.equal(number(), 20);
  assert.equal(
    bar().getAttribute('aria-valuenow'),
    '78',
    'AT receives the real server value',
  );
  let before = 20;
  for (const ms of [42, 42, 42, 84, 210]) {
    await advance(ms);
    assert.ok(number() >= before && number() <= 78);
    assert.ok(bar().value >= before && bar().value <= 78);
    before = number();
  }
  assert.equal(number(), 78);
  assert.equal(bar().value, 78);
  await advance(2000);
  assert.equal(
    number(),
    78,
    'waiting for the server does not advance progress',
  );
  await render(100);
  assert.ok(number() < 100);
  await advance(420);
  assert.equal(number(), 100);
  assert.equal(bar().value, 100);
});

test('interrupting an animation retargets from the current frame and rapid scopes cannot leak old values', async () => {
  await render(0);
  await advance(16);
  await render(50);
  await advance(90);
  const before = bar().value;
  await render(90);
  assert.equal(bar().value, before);
  await advance(90);
  assert.ok(bar().value >= before && bar().value < 90);
  await render(7, 'job-b');
  assert.equal(number(), 7);
  assert.equal(bar().value, 7);
  await render(3, 'job-c');
  assert.equal(number(), 3);
  await advance(1000);
  assert.equal(number(), 3);
  assert.equal(bar().value, 3);
});

test('rollback, requeue and changed denominators snap instead of animating stale completion', async () => {
  await render(90);
  await advance(16);
  await render(0);
  assert.equal(number(), 0);
  assert.equal(bar().value, 0);
  await render(20);
  await advance(100);
  assert.ok(bar().value >= 0 && bar().value <= 20);
  await render(4, 'job-a', 15);
  assert.equal(number(), 4);
  assert.equal(bar().value, 4);
  await advance(1000);
  assert.equal(number(), 4);
});

test('reduced motion and hidden tabs show exact values immediately, including preference changes mid-flight', async () => {
  await render(20);
  await advance(16);
  await render(80);
  await advance(70);
  assert.ok(number() < 80);
  await act(async () => {
    reduced = true;
    listeners.forEach((callback) => callback());
  });
  assert.equal(number(), 80);
  assert.equal(bar().value, 80);
  await render(90);
  assert.equal(number(), 90);
  await act(async () => {
    reduced = false;
    hidden = true;
    document.dispatchEvent(new window.Event('visibilitychange'));
  });
  await render(100);
  assert.equal(number(), 100);
  assert.equal(bar().value, 100);
});

test('invalid numbers stay finite and bounds never exceed the reported denominator', async () => {
  for (const [value, max, expected] of [
    [NaN, 100, 0],
    [Infinity, 100, 0],
    [-4, 100, 0],
    [107, 100, 100],
    [10, 0, 0],
    [12, NaN, 12],
    [200, Infinity, 100],
  ]) {
    await render(value, `case-${value}-${max}`, max);
    assert.equal(number(), expected);
    assert.equal(bar().value, expected);
    assert.equal(boundedProgress(value, max), expected);
  }
  await render(12.5, 'fraction');
  assert.equal(number(), 12.5, 'settled fractional server values remain exact');
});

test('result transitions replace the changing label without remounting surrounding controls', async () => {
  const view = (label) =>
    h(
      'div',
      null,
      h(
        'details',
        { open: true },
        h('summary', null, '실행 메시지'),
        h('input', { defaultValue: 'keep' }),
      ),
      h(ResultTransition, { stateKey: label }, label),
    );
  await act(async () => root.render(view('검증 중')));
  const details = host.querySelector('details');
  const oldLabel = host.querySelector('.motion-result');
  details.open = false;
  host.querySelector('input').value = 'unchanged';
  await act(async () => root.render(view('기대 판정 일치')));
  assert.notEqual(host.querySelector('.motion-result'), oldLabel);
  assert.equal(host.querySelector('details'), details);
  assert.equal(details.open, false);
  assert.equal(host.querySelector('input').value, 'unchanged');
});

test('verification and generic jobs share live progress while cancelled work never becomes 100%', async () => {
  const job = {
    id: 'verify-a',
    kind: 'verify',
    status: 'running',
    result: {
      verification_progress: {
        phase: 'preparing',
        current: 2,
        total: 10,
        percent: 20,
        preparation: { current: 2, total: 4, percent: 50 },
        judging: { current: 0, total: 6, percent: 0 },
      },
    },
  };
  await act(async () => root.render(h(VerificationProgress, { job })));
  assert.match(host.textContent, /테스트 자료 준비 중/);
  assert.equal(
    host.querySelector('progress[aria-label="전체 풀이 검증"]').value,
    20,
  );
  const next = {
    ...job,
    result: {
      verification_progress: {
        ...job.result.verification_progress,
        phase: 'judging',
        current: 5,
        percent: 50,
      },
    },
  };
  await advance(16);
  await act(async () => root.render(h(VerificationProgress, { job: next })));
  assert.match(host.textContent, /전체 풀이 검증 중/);
  assert.equal(
    host.querySelector('progress[aria-label="전체 풀이 검증"]').value,
    20,
    'phase changes keep aggregate interpolation',
  );
  await advance(420);
  assert.equal(
    host.querySelector('progress[aria-label="전체 풀이 검증"]').value,
    50,
  );
  await act(async () =>
    root.render(
      h(VerificationProgress, { job: { ...next, status: 'cancelled' } }),
    ),
  );
  assert.match(host.textContent, /전체 풀이 검증 중단/);
  await advance(1000);
  assert.equal(host.querySelector('progress').value, 50);
  await act(async () =>
    root.render(
      h(VerificationProgress, {
        job: {
          id: 'package-b',
          status: 'running',
          result: { progress: 37, summary: '패키지 준비 중' },
        },
      }),
    ),
  );
  assert.equal(host.querySelector('progress').value, 37);
  assert.match(host.textContent, /패키지 준비 중/);
});

test('outcome count summaries animate independently without changing their labels', async () => {
  const renderSummary = async (value, scope = 'job-counts') =>
    act(async () => root.render(h(MotionCountText, { value, scope })));
  await renderSummary('검증 항목 2개 · 일치 1개');
  await advance(16);
  await renderSummary('검증 항목 8개 · 일치 6개');
  assert.deepEqual(
    [...host.querySelectorAll('[data-motion-value]')].map(
      (node) => node.dataset.motionValue,
    ),
    ['2', '1'],
  );
  assert.equal(
    host.textContent,
    '검증 항목 8개 · 일치 6개',
    'semantic text always contains only the received counts',
  );
  await advance(420);
  assert.equal(host.textContent, '검증 항목 8개 · 일치 6개');
  await renderSummary('검증 항목 1개 · 일치 0개', 'other-job');
  assert.equal(host.textContent, '검증 항목 1개 · 일치 0개');
});

test('a live region exposes only the real value and never gets per-frame text mutations', async () => {
  const renderLive = async (value) =>
    act(async () =>
      root.render(
        h(
          'div',
          { role: 'status', 'aria-live': 'polite' },
          h(MotionNumber, { value, scope: 'live-region' }),
        ),
      ),
    );
  await renderLive(20);
  await advance(16);
  const region = host.querySelector('[role="status"]');
  const textChanges = [];
  const observer = new window.MutationObserver((records) =>
    textChanges.push(
      ...records.filter(
        (record) =>
          record.type === 'characterData' || record.type === 'childList',
      ),
    ),
  );
  observer.observe(region, {
    subtree: true,
    childList: true,
    characterData: true,
  });
  await renderLive(72);
  assert.equal(region.textContent, '72');
  assert.equal(
    textChanges.length,
    1,
    'one text update for the newly received number',
  );
  for (const ms of [42, 42, 84, 84, 168]) {
    await advance(ms);
    assert.equal(region.textContent, '72');
    assert.equal(
      textChanges.length,
      1,
      'visual interpolation must not mutate live-region text',
    );
  }
  assert.equal(
    region.querySelector('[data-motion-value]').getAttribute('aria-hidden'),
    'true',
  );
  assert.equal(number(), 72);
  observer.disconnect();
});

test('a target rollback snaps even while the old visual frame is below the new target', async () => {
  await render(0);
  await advance(16);
  await render(100);
  await advance(42);
  assert.ok(bar().value > 20 && bar().value < 60);
  await render(60);
  assert.equal(number(), 60);
  assert.equal(bar().value, 60);
  await advance(16);
  assert.equal(
    number(),
    60,
    'a cancelled older frame cannot restore an earlier visual number',
  );
  assert.equal(bar().value, 60);
  await advance(420);
  assert.equal(number(), 60);
});

test('a rollback before the first animation frame replaces the previously reported target immediately', async () => {
  await render(20);
  await advance(16);
  await render(80);
  assert.equal(number(), 20);
  await render(40);
  assert.equal(number(), 40);
  assert.equal(bar().value, 40);
  await advance(16);
  assert.equal(number(), 40);
  assert.equal(bar().value, 40);
  await advance(420);
  assert.equal(number(), 40);
});
