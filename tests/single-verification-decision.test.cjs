const { test, beforeEach, afterEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { setImmediate } = require('node:timers');
const { structuredClone } = globalThis;
const ts = require('typescript');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<body></body>', { url: 'http://editor.test' });
global.window = dom.window;
global.document = dom.window.document;
global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const Router = require('react-router-dom');
const h = React.createElement;
let workspace,
  user,
  selectedJob,
  freshJob,
  calls,
  updates,
  notifications,
  gates,
  error;
let previewReads, previewGate, previewError, previewResult;
let root, host, updateSelection;
const modules = new Map();

function source(relative) {
  const file = path.resolve(__dirname, '../src', relative);
  if (modules.has(file)) return modules.get(file).exports;
  const loaded = new Module(file, module);
  loaded.filename = file;
  loaded.paths = Module._nodeModulePaths(path.dirname(file));
  const native = loaded.require.bind(loaded);
  loaded.require = (name) => {
    if (name.endsWith('.css')) return {};
    if (name.endsWith('/workspace')) return { useWorkspace: () => workspace };
    if (name.endsWith('/authContext')) return { useAuth: () => ({ user }) };
    if (name.endsWith('/api'))
      return {
        api: (url, options = {}) =>
          request(url, options.method || 'GET', options.body, options.signal),
        post: (url, body = {}, signal) => request(url, 'POST', body, signal),
        languages: { cpp17: 'C++17' },
        time: (value) => new Date(value * 1000).toISOString(),
        blobPreview: async (problemId, sha, signal) => {
          previewReads.push({ problemId, sha, signal });
          if (previewGate) return previewGate.promise;
          if (previewError) throw new Error(previewError);
          return previewResult;
        },
        blobText: async () =>
          'synthetic immutable source from its authorized blob',
      };
    if (name.endsWith('/ui'))
      return {
        Icon: ({ name: icon }) => h('span', { 'data-icon': icon }),
        Notice: ({ children }) => h('div', { role: 'alert' }, children),
        Badge: ({ children }) => h('span', null, children),
        CodeEditor: ({ label, value, readOnly }) =>
          h('textarea', { 'aria-label': label, value, readOnly }),
      };
    if (name.startsWith('.')) {
      const resolved = ['.ts', '.tsx']
        .map((ext) => path.resolve(path.dirname(file), name + ext))
        .find((candidate) => fs.existsSync(candidate));
      assert.ok(resolved, `${file}: ${name}`);
      return source(path.relative(path.resolve(__dirname, '../src'), resolved));
    }
    return native(name);
  };
  modules.set(file, loaded);
  loaded._compile(
    ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    file,
  );
  return loaded.exports;
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
function job(overrides = {}) {
  return {
    id: 'single-job',
    problem_id: 'p',
    kind: 'verify',
    status: 'completed',
    document_hash: 'a'.repeat(64),
    workspace_version: 6,
    revision: 2,
    options: {
      single_verification: true,
      solutions: ['candidate.cpp'],
      temporary_solutions: [
        {
          name: 'candidate.cpp',
          kind: 'source',
          language: 'cpp17',
          tag: 'WA',
          // Job responses persist immutable blob metadata, never client text.
          sha256: 'c'.repeat(64),
          size: 49,
        },
      ],
    },
    result: {},
    created_at: 1794283200,
    started_at: 1794283201,
    finished_at: 1794283202,
    outcome: {
      execution: 'completed',
      assessment: {
        kind: 'expectations',
        status: 'passed',
        code: 'expectations_match',
        partial: false,
      },
    },
    ...overrides,
  };
}
async function request(url, method, body, signal) {
  const entry = {
    type: method,
    url,
    body: typeof body === 'string' ? JSON.parse(body) : body,
    signal,
  };
  calls.push(entry);
  const index = gates.findIndex((gate) => gate.when(entry));
  if (index >= 0) return gates.splice(index, 1)[0].promise;
  if (method === 'POST' && error) throw new Error(error);
  if (method === 'POST' && url.endsWith('/solution/apply'))
    return structuredClone({
      version: freshJob.application.workspace_version,
      document_hash: freshJob.application.document_hash,
      document: workspace.document,
      application: freshJob.application,
      solution: selectedJob.options.temporary_solutions[0],
    });
  if (method === 'POST' && url.endsWith('/discard'))
    return { discarded_at: freshJob.discarded_at };
  return structuredClone(freshJob);
}
function Harness() {
  const [value, setValue] = React.useState(selectedJob);
  updateSelection = setValue;
  const Decision = source('components/SingleVerificationDecision.tsx').default;
  return h(Decision, {
    job: value,
    onUpdated: (updated) => {
      calls.push({ type: 'updated' });
      updates.push(updated);
      setValue(updated);
    },
    onRefreshHistory: async () => {
      calls.push({ type: 'history' });
    },
  });
}
async function flush() {
  for (let i = 0; i < 3; i++)
    await act(async () => new Promise((resolve) => setImmediate(resolve)));
}
async function render() {
  await act(async () => root.render(h(Router.MemoryRouter, null, h(Harness))));
  await flush();
}
function button(text) {
  return [...host.querySelectorAll('button')].find(
    (element) => element.textContent.trim() === text,
  );
}
async function click(text) {
  const target = button(text);
  assert.ok(target, text);
  await act(async () => target.click());
  await flush();
}
async function changeJob(value) {
  await act(async () => updateSelection(value));
  await flush();
}
async function togglePreview(open) {
  const details = host.querySelector('details');
  assert.ok(details);
  await act(async () => {
    details.open = open;
    details.dispatchEvent(new window.Event('toggle'));
  });
  await flush();
}
beforeEach(() => {
  user = { id: 'me' };
  selectedJob = job();
  freshJob = job({
    application: {
      applied_at: 1794283300,
      workspace_version: 8,
      document_hash: 'b'.repeat(64),
    },
  });
  calls = [];
  updates = [];
  notifications = [];
  gates = [];
  error = '';
  previewReads = [];
  previewGate = null;
  previewError = '';
  previewResult = {
    text: 'synthetic immutable source from its authorized blob',
    binary: false,
    truncated: false,
  };
  workspace = {
    data: {
      problem: { id: 'p', permissions: ['edit_solutions'] },
      version: 7,
      document_hash: 'a'.repeat(64),
    },
    document: { files: {}, solutions: {} },
    dirty: false,
    reload: async (preserve) => {
      calls.push({ type: 'reload', preserve });
    },
    notify: (message, failed) => notifications.push({ message, failed }),
  };
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
after(() => dom.window.close());

test('only terminal single verification records expose a decision', async () => {
  selectedJob = job({ options: {} });
  await render();
  assert.equal(host.textContent, '');
  for (const next of [
    job({ kind: 'stress' }),
    job({ status: 'queued' }),
    job({ status: 'running' }),
  ]) {
    await changeJob(next);
    assert.equal(host.textContent, '');
  }
  await changeJob(job());
  assert.ok(button('풀이에 추가'));
  assert.ok(button('반영하지 않고 버리기'));
  assert.deepEqual(calls, []);
});

test('adding uses only the current workspace version and refreshes the exact saved job after reload', async () => {
  await render();
  await click('풀이에 추가');
  const posts = calls.filter((entry) => entry.type === 'POST');
  assert.equal(posts.length, 1);
  assert.equal(posts[0].url, '/problems/p/jobs/single-job/solution/apply');
  assert.deepEqual(posts[0].body, { version: 7 });
  assert.ok(posts[0].signal);
  assert.equal(JSON.stringify(posts[0].body).includes('synthetic'), false);
  assert.deepEqual(
    calls.map((entry) => entry.type),
    ['POST', 'updated', 'reload', 'GET', 'updated', 'history'],
  );
  assert.equal(calls[2].preserve, true);
  assert.equal(calls[3].url, '/problems/p/jobs/single-job');
  assert.deepEqual(updates, [freshJob, freshJob]);
  assert.equal(button('풀이에 추가'), undefined);
  assert.equal(button('반영하지 않고 버리기'), undefined);
  assert.match(host.textContent, /커밋/);
  assert.ok(host.querySelector('a[href="/problems/p/solutions"]'));
  assert.deepEqual(workspace.document.solutions, {});
});

test('completion alone never enables adding mismatched, partial, missing, or unknown assessments', async () => {
  await render();
  for (const assessment of [
    undefined,
    { status: 'failed', code: 'expectations_differ', partial: false },
    { status: 'passed', code: 'expectations_match', partial: true },
    { status: 'passed', code: 'expectations_match' },
    { status: 'passed', code: 'missing_evidence', partial: false },
    { status: 'unknown', code: 'expectations_match', partial: false },
  ]) {
    await changeJob(
      job({
        outcome: assessment
          ? { execution: 'completed', assessment }
          : undefined,
      }),
    );
    const add = button('풀이에 추가');
    assert.ok(!add || add.disabled);
    assert.ok(button('반영하지 않고 버리기'));
  }
  for (const status of ['failed', 'cancelled']) {
    await changeJob(job({ status }));
    const add = button('풀이에 추가');
    assert.ok(!add || add.disabled);
    assert.ok(button('반영하지 않고 버리기'));
  }
  assert.deepEqual(calls, []);
});

test('read-only, unsaved, stale, and name-collision states cannot apply a solution', async () => {
  await render();
  const scenarios = [
    () => {
      workspace.data.problem.permissions = [];
    },
    () => {
      workspace.dirty = true;
    },
    () => {
      workspace.data.document_hash = 'b'.repeat(64);
    },
    () => {
      workspace.document.solutions['candidate.cpp'] = { name: 'candidate.cpp' };
    },
    () => {
      workspace.document.files['candidate.cpp'] = { name: 'candidate.cpp' };
    },
  ];
  for (const change of scenarios) {
    workspace.data.problem.permissions = ['edit_solutions'];
    workspace.data.document_hash = 'a'.repeat(64);
    workspace.dirty = false;
    workspace.document = { files: {}, solutions: {} };
    change();
    await render();
    const add = button('풀이에 추가');
    assert.ok(add?.disabled, 'addition remains visible but disabled');
    await act(async () => add.click());
    await flush();
    assert.deepEqual(calls, []);
  }
});

test('source_document_hash eligibility uses the original saved input rather than normalized execution hashes', async () => {
  selectedJob = job({
    document_hash: 'b'.repeat(64),
    options: { ...job().options, source_document_hash: 'a'.repeat(64) },
  });
  await render();
  assert.equal(button('풀이에 추가').disabled, false);
});

test('synchronous duplicate clicks produce one apply request and disable competing decisions', async () => {
  const pending = deferred();
  gates.push({
    when: (entry) => entry.type === 'POST',
    promise: pending.promise,
  });
  await render();
  const add = button('풀이에 추가');
  await act(async () => {
    add.click();
    add.click();
  });
  await flush();
  assert.equal(calls.filter((entry) => entry.type === 'POST').length, 1);
  assert.ok(
    [...host.querySelectorAll('button')].every((item) => item.disabled),
  );
  await act(async () => pending.resolve(freshJob));
  await flush();
  assert.equal(updates.length, 2);
});

test('discard persists the record decision without changing or reloading the working copy', async () => {
  selectedJob = job({ status: 'failed', outcome: undefined });
  freshJob = { ...selectedJob, discarded_at: 1794283300 };
  const documentBefore = structuredClone(workspace.document);
  await render();
  await click('반영하지 않고 버리기');
  assert.deepEqual(
    calls.map((entry) => entry.type),
    ['POST', 'updated', 'GET', 'updated', 'history'],
  );
  assert.equal(calls[0].url, '/problems/p/jobs/single-job/discard');
  assert.equal(calls[2].url, '/problems/p/jobs/single-job');
  assert.deepEqual(updates, [freshJob, freshJob]);
  assert.deepEqual(workspace.document, documentBefore);
  assert.equal(button('반영하지 않고 버리기'), undefined);
  assert.equal(button('풀이에 추가'), undefined);
  assert.match(host.textContent, /버림|버렸|버린|반영하지 않/);
});

test('saved applied and discarded decisions do not expose actions again on a later visit', async () => {
  selectedJob = freshJob;
  await render();
  assert.equal(host.querySelector('button'), null);
  await changeJob(job({ discarded_at: 1794283300 }));
  assert.equal(host.querySelector('button'), null);
  assert.deepEqual(calls, []);
});

test('server failures retain the record and allow an explicit retry without client-side mutation', async () => {
  await render();
  error = '작업 사본이 변경되었습니다. 다시 확인하세요.';
  await click('풀이에 추가');
  assert.ok(
    host.textContent.includes(error) ||
      notifications.some((item) => item.message.includes(error)),
  );
  assert.equal(updates.length, 0);
  assert.equal(calls.filter((entry) => entry.type === 'reload').length, 0);
  assert.equal(button('풀이에 추가').disabled, false);
  error = '';
  await click('풀이에 추가');
  assert.equal(calls.filter((entry) => entry.type === 'POST').length, 2);
  assert.equal(updates.length, 2);
});

test('a successful apply receipt stays applied when the saved workspace changes and the following job read fails', async () => {
  const followup = deferred();
  gates.push({
    when: (entry) => entry.type === 'GET',
    promise: followup.promise,
  });
  workspace.reload = async (preserve) => {
    calls.push({ type: 'reload', preserve });
    workspace.data.document_hash = 'b'.repeat(64);
    workspace.data.version = 8;
    workspace.document.solutions['candidate.cpp'] = { name: 'candidate.cpp' };
  };
  await render();
  await click('풀이에 추가');
  assert.equal(updates.length, 1);
  assert.deepEqual(updates[0].application, freshJob.application);
  await act(async () => followup.reject(new Error('결과 조회 연결 실패')));
  await flush();
  assert.match(host.textContent, /내 풀이에 추가한 코드/);
  assert.match(
    host.textContent,
    /풀이 추가는 완료됐지만 화면을 갱신하지 못했습니다/,
  );
  assert.ok(host.querySelector('a[href="/problems/p/solutions"]'));
  assert.equal(button('풀이에 추가'), undefined);
  assert.equal(button('반영하지 않고 버리기'), undefined);
  assert.equal(calls.filter((entry) => entry.type === 'POST').length, 1);
  assert.equal(updates.length, 1);
});

test('a successful discard receipt stays discarded when the following job read fails', async () => {
  freshJob = job({ discarded_at: 1794283300 });
  const followup = deferred();
  gates.push({
    when: (entry) => entry.type === 'GET',
    promise: followup.promise,
  });
  await render();
  await click('반영하지 않고 버리기');
  assert.equal(updates.length, 1);
  assert.equal(updates[0].discarded_at, freshJob.discarded_at);
  await act(async () => followup.reject(new Error('결과 조회 연결 실패')));
  await flush();
  assert.match(host.textContent, /풀이에 추가하지 않고 버린 코드/);
  assert.match(
    host.textContent,
    /버리기는 완료됐지만 화면을 갱신하지 못했습니다/,
  );
  assert.equal(button('풀이에 추가'), undefined);
  assert.equal(button('반영하지 않고 버리기'), undefined);
  assert.equal(calls.filter((entry) => entry.type === 'POST').length, 1);
  assert.equal(
    calls.some((entry) => entry.type === 'reload'),
    false,
  );
});

test('unmount aborts an in-flight decision and prevents reloads, callbacks, or notifications afterward', async () => {
  const pending = deferred();
  gates.push({
    when: (entry) => entry.type === 'POST',
    promise: pending.promise,
  });
  await render();
  await click('풀이에 추가');
  const signal = calls[0].signal;
  assert.ok(signal);
  await act(async () => root.unmount());
  assert.equal(signal.aborted, true);
  await act(async () => pending.resolve(freshJob));
  await flush();
  assert.deepEqual(
    calls.map((entry) => entry.type),
    ['POST'],
  );
  assert.deepEqual(updates, []);
  assert.deepEqual(notifications, []);
});

test('switching to another saved job invalidates the old in-flight decision', async () => {
  const pending = deferred();
  gates.push({
    when: (entry) => entry.type === 'POST',
    promise: pending.promise,
  });
  await render();
  await click('풀이에 추가');
  const signal = calls[0].signal;
  await changeJob(job({ id: 'next-job' }));
  assert.equal(signal.aborted, true);
  await act(async () => pending.resolve(freshJob));
  await flush();
  assert.deepEqual(
    calls.map((entry) => entry.type),
    ['POST'],
  );
  assert.deepEqual(updates, []);
  assert.deepEqual(notifications, []);
  assert.ok(button('풀이에 추가'));
  assert.equal(button('풀이에 추가').disabled, false);
});

test('switching accounts aborts the old decision and resets pending action state', async () => {
  const pending = deferred();
  gates.push({
    when: (entry) => entry.type === 'POST',
    promise: pending.promise,
  });
  await render();
  await click('풀이에 추가');
  const signal = calls[0].signal;
  user = { id: 'other-account' };
  await render();
  assert.equal(signal.aborted, true);
  assert.equal(button('풀이에 추가').disabled, false);
  await act(async () => pending.resolve(freshJob));
  await flush();
  assert.deepEqual(
    calls.map((entry) => entry.type),
    ['POST'],
  );
  assert.deepEqual(updates, []);
  assert.deepEqual(notifications, []);
});

test('metadata code preview fetches only on opening and clearly marks truncated text', async () => {
  previewGate = deferred();
  await render();
  assert.deepEqual(previewReads, []);
  assert.equal(button('풀이에 추가').disabled, false);
  await togglePreview(true);
  assert.equal(previewReads.length, 1);
  assert.equal(previewReads[0].problemId, 'p');
  assert.equal(previewReads[0].sha, 'c'.repeat(64));
  assert.ok(previewReads[0].signal);
  assert.match(host.textContent, /코드를 불러오는 중/);
  await act(async () =>
    previewGate.resolve({
      text: 'first part only',
      truncated: true,
      binary: false,
    }),
  );
  await flush();
  const code = host.querySelector('textarea[aria-label="검증한 코드"]');
  assert.equal(code.value, 'first part only');
  assert.equal(code.readOnly, true);
  assert.match(host.textContent, /앞부분만 표시.*원본 전체/);
  assert.deepEqual(calls, []);
  assert.equal(button('풀이에 추가').disabled, false);
});

test('closing or leaving a code preview aborts the read and ignores its late response', async () => {
  const first = deferred();
  previewGate = first;
  await render();
  await togglePreview(true);
  const signal = previewReads[0].signal;
  await togglePreview(false);
  assert.equal(signal.aborted, true);
  await act(async () => first.resolve({ text: 'old hidden source' }));
  await flush();
  assert.equal(host.querySelector('textarea'), null);
  const second = deferred();
  previewGate = second;
  await togglePreview(true);
  assert.equal(previewReads.length, 2);
  const nextSignal = previewReads[1].signal;
  await changeJob(job({ id: 'next-code', options: { ...job().options } }));
  assert.equal(nextSignal.aborted, true);
  await act(async () => second.resolve({ text: 'old job source' }));
  await flush();
  assert.equal(host.querySelector('textarea'), null);
  assert.doesNotMatch(host.textContent, /old (hidden|job) source/);
  assert.deepEqual(calls, []);
});

test('code-preview errors allow retry and binary data is never displayed as source text', async () => {
  previewError = '코드 파일을 읽지 못했습니다.';
  await render();
  await togglePreview(true);
  assert.match(host.textContent, /코드 파일을 읽지 못했습니다/);
  assert.equal(host.querySelector('textarea'), null);
  previewError = '';
  previewResult = {
    text: 'binary must not render',
    binary: true,
    truncated: false,
  };
  await click('다시 불러오기');
  assert.equal(previewReads.length, 2);
  assert.match(host.textContent, /텍스트로 표시할 수 없는 코드/);
  assert.equal(host.querySelector('textarea'), null);
  assert.doesNotMatch(host.textContent, /binary must not render/);
  assert.equal(button('풀이에 추가').disabled, false);
  assert.deepEqual(calls, []);
});
