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
const cache = new Map();
function source(relative) {
  const file = path.resolve(__dirname, '../src', relative);
  if (cache.has(file)) return cache.get(file).exports;
  const loaded = new Module(file, module);
  loaded.filename = file;
  loaded.paths = Module._nodeModulePaths(path.dirname(file));
  const native = loaded.require.bind(loaded);
  loaded.require = (id) => {
    if (id.endsWith('/RecentExecutions'))
      return { __esModule: true, default: () => null };
    if (id === 'react-router-dom')
      return {
        Link: ({ children, to, ...props }) =>
          React.createElement('a', { href: to, ...props }, children),
      };
    if (id.endsWith('/workspace')) return { useWorkspace: () => context };
    if (id.endsWith('/api'))
      return {
        blobPreview: async () => ({
          text: '',
          truncated: false,
          binary: false,
        }),
        upload: async () => assert.fail('Deleting a set must not upload files'),
        post: async () =>
          assert.fail('Deleting a set must not make API writes'),
      };
    if (id.endsWith('/Downloads'))
      return { BlobDownload: () => null, DownloadActions: () => null };
    if (id.endsWith('/Select'))
      return {
        default: (props) => React.createElement('select', props),
        __esModule: true,
      };
    if (id.endsWith('/downloads')) return { testDownloads: () => [] };
    if (id.startsWith('.')) {
      const resolved = ['.ts', '.tsx']
        .map((extension) => path.resolve(path.dirname(file), id + extension))
        .find((candidate) => fs.existsSync(candidate));
      assert.ok(resolved, `Could not resolve ${id} from ${relative}`);
      return source(path.relative(path.resolve(__dirname, '../src'), resolved));
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
const Tests = source('pages/workspace/Tests.tsx').default;
const fullPermissions = [
  'edit_tests',
  'edit_solutions',
  'edit_materials',
  'prepare',
];
function fixture() {
  const entry = (index) => ({
    index,
    input_sha: `input-${index}`,
    answer_sha: `answer-${index}`,
    group: 'small',
    sample: false,
    points: 0,
    command: '',
    description: `Original ${index}`,
  });
  const set = () => ({
    script: '',
    groups_enabled: true,
    groups: {
      small: {
        points_policy: 'COMPLETE_GROUP',
        feedback_policy: 'COMPLETE',
        dependencies: [],
      },
    },
    tests: { one: entry(1), two: entry(2) },
  });
  return {
    info: { points_enabled: false },
    testsets: { tests: set(), extra: { ...set(), script: 'gen 10 > $' } },
    solutions: {
      'main.cpp': {
        sha256: 'solution-blob',
        extra_tags: { tests: 'OK', extra: 'WA', unrelated: 'TL' },
        group_tags: { tests: { small: 'OK' }, extra: { small: 'WA' } },
      },
    },
    materials: {
      public: { testsets: ['tests', 'extra'], files: ['keep.bin'] },
    },
    files: { 'keep.bin': { sha256: 'keep-original-file' } },
  };
}
async function mount(options = {}) {
  const notices = [];
  let model,
    update,
    mutations = 0;
  const notify = (...notice) => notices.push(notice);
  const initial = {
    document: options.document || fixture(),
    id: 'problem-one',
    editable: true,
    permissions: fullPermissions,
    busy: false,
    ...options,
  };
  function Harness() {
    [model, update] = React.useState(initial);
    context = {
      document: model.document,
      data: {
        problem: {
          id: model.id,
          role: 'WRITE',
          permissions: model.permissions,
        },
      },
      editable: model.editable,
      busy: model.busy,
      notify,
      run: model.run || (async () => {}),
      mutate: (callback) => {
        mutations++;
        update((previous) => {
          const draft = global.structuredClone(previous.document);
          options.beforeMutation?.(draft);
          callback(draft);
          return { ...previous, document: draft };
        });
      },
    };
    return React.createElement(Tests);
  }
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(React.createElement(Harness)));
  return {
    host,
    notices,
    get model() {
      return model;
    },
    get mutations() {
      return mutations;
    },
    patch: async (patch) =>
      act(async () => update((previous) => ({ ...previous, ...patch }))),
    close: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}
function button(host, text) {
  const found = [...host.querySelectorAll('button')].find(
    (item) => item.textContent.trim() === text,
  );
  assert.ok(found, `Missing button: ${text}`);
  return found;
}
async function click(host, text) {
  await act(async () => button(host, text).click());
}
function selected(view) {
  return view.host
    .querySelector('.test-set-tabs [aria-pressed="true"]')
    ?.textContent.trim();
}
after(() => dom.window.close());

test('deletion confirms the captured impact, keeps originals, and selects the first remaining set', async () => {
  const doc = fixture();
  const original = global.structuredClone(doc);
  const view = await mount({ document: doc });
  try {
    await act(async () =>
      view.host.querySelector('[aria-label="테스트 1 선택"]').click(),
    );
    await click(view.host, '세트 삭제');
    const dialog = view.host.querySelector('dialog[open]');
    assert.ok(dialog);
    assert.match(
      dialog.textContent,
      /tests 세트를 내 작업 사본에서 삭제합니다/,
    );
    assert.match(dialog.textContent, /등록 테스트2개/);
    assert.match(dialog.textContent, /테스트 그룹1개/);
    assert.match(dialog.textContent, /1개 풀이 참조 정리/);
    assert.match(dialog.textContent, /1개 자료의 세트 참조 정리/);
    assert.equal(view.mutations, 0);
    await click(dialog, '세트 삭제 확인');
    assert.deepEqual(Object.keys(view.model.document.testsets), ['extra']);
    assert.equal(
      view.model.document.solutions['main.cpp'].extra_tags.tests,
      undefined,
    );
    assert.equal(
      view.model.document.solutions['main.cpp'].group_tags.tests,
      undefined,
    );
    assert.deepEqual(view.model.document.materials.public.testsets, ['extra']);
    assert.deepEqual(view.model.document.files, original.files);
    assert.equal(
      view.model.document.solutions['main.cpp'].sha256,
      'solution-blob',
    );
    assert.deepEqual(
      doc,
      original,
      'The previous working-copy snapshot stays immutable',
    );
    assert.equal(selected(view), 'extra2');
    assert.match(view.host.textContent, /선택한 테스트 0개/);
    assert.equal(view.host.querySelector('dialog'), null);
    assert.equal(view.mutations, 1);
    assert.match(
      view.notices.at(-1)[0],
      /tests 세트를 작업 사본에서 삭제했습니다. 저장해야 적용됩니다/,
    );
  } finally {
    await view.close();
  }
});

test('cancel and native escape leave the working copy unchanged', async () => {
  const view = await mount();
  try {
    const original = view.model.document;
    await click(view.host, '세트 삭제');
    await click(view.host.querySelector('dialog'), '취소');
    assert.equal(view.model.document, original);
    await click(view.host, '세트 삭제');
    await act(async () =>
      view.host
        .querySelector('dialog')
        .dispatchEvent(new window.Event('cancel', { cancelable: true })),
    );
    assert.equal(view.host.querySelector('dialog'), null);
    assert.equal(view.mutations, 0);
    assert.equal(view.notices.length, 0);
  } finally {
    await view.close();
  }
});

test('last-set and read-only deletion are disabled with explicit reasons', async () => {
  const doc = fixture();
  delete doc.testsets.extra;
  const view = await mount({ document: doc });
  try {
    const remove = button(view.host, '세트 삭제');
    assert.equal(remove.disabled, true);
    assert.match(
      document.getElementById(remove.getAttribute('aria-describedby'))
        .textContent,
      /마지막 테스트 세트/,
    );
    await view.patch({ document: fixture(), editable: false });
    assert.equal(button(view.host, '세트 삭제').disabled, true);
    assert.match(view.host.textContent, /테스트 편집 권한이 필요합니다/);
    await click(view.host, '세트 삭제');
    assert.equal(view.mutations, 0);
    assert.equal(view.host.querySelector('dialog'), null);
  } finally {
    await view.close();
  }
});

test('referenced solutions and materials require their editing rights, while unreferenced sets do not', async () => {
  const view = await mount({ permissions: ['edit_tests'] });
  try {
    assert.equal(button(view.host, '세트 삭제').disabled, true);
    assert.match(
      view.host.textContent,
      /풀이·기대 판정 편집 및 공개 자료 편집 권한/,
    );
    await view.patch({ permissions: ['edit_tests', 'edit_solutions'] });
    assert.match(view.host.textContent, /공개 자료 편집 권한이 필요합니다/);
    const unrelated = fixture();
    unrelated.solutions = {};
    unrelated.materials = {};
    await view.patch({ document: unrelated, permissions: ['edit_tests'] });
    assert.equal(button(view.host, '세트 삭제').disabled, false);
    await click(view.host, '세트 삭제');
    await click(view.host.querySelector('dialog'), '세트 삭제 확인');
    assert.deepEqual(Object.keys(view.model.document.testsets), ['extra']);
  } finally {
    await view.close();
  }
});

test('document, problem, and permission changes invalidate an already opened confirmation', async () => {
  const changes = [
    (view) => ({ document: { ...view.model.document, changed: true } }),
    () => ({ id: 'different-problem' }),
    () => ({ permissions: ['edit_tests'] }),
    () => ({ editable: false }),
  ];
  for (const patch of changes) {
    const view = await mount();
    try {
      await click(view.host, '세트 삭제');
      await view.patch(patch(view));
      const dialog = view.host.querySelector('dialog');
      assert.match(dialog.textContent, /자료 또는 권한이 변경되었습니다/);
      assert.equal(button(dialog, '세트 삭제 확인').disabled, true);
      await click(dialog, '세트 삭제 확인');
      assert.equal(view.mutations, 0);
      assert.ok(view.model.document.testsets.tests);
    } finally {
      await view.close();
    }
  }
});

test('switching the selected set and returning still invalidates the old confirmation', async () => {
  const view = await mount();
  try {
    await click(view.host, '세트 삭제');
    await act(async () =>
      view.host.querySelector('[aria-label="extra · 등록 테스트 2개"]').click(),
    );
    assert.equal(
      button(view.host.querySelector('dialog'), '세트 삭제 확인').disabled,
      true,
    );
    await act(async () =>
      view.host.querySelector('[aria-label="tests · 등록 테스트 2개"]').click(),
    );
    assert.equal(
      button(view.host.querySelector('dialog'), '세트 삭제 확인').disabled,
      true,
    );
    assert.equal(view.mutations, 0);
  } finally {
    await view.close();
  }
});

test('a double confirmation applies exactly once and workspace work blocks deletion', async () => {
  const view = await mount({ busy: true });
  try {
    assert.equal(button(view.host, '세트 삭제').disabled, true);
    await view.patch({ busy: false });
    await click(view.host, '세트 삭제');
    await view.patch({ busy: true });
    assert.equal(
      button(view.host.querySelector('dialog'), '세트 삭제 확인').disabled,
      true,
    );
    await view.patch({ busy: false });
    const confirm = button(view.host.querySelector('dialog'), '세트 삭제 확인');
    await act(async () => {
      confirm.click();
      confirm.click();
    });
    assert.equal(view.mutations, 1);
    assert.equal(view.notices.length, 1);
    assert.deepEqual(Object.keys(view.model.document.testsets), ['extra']);
  } finally {
    await view.close();
  }
});

test('local execution disables opening a delete confirmation until it finishes', async () => {
  let finish;
  const promise = new Promise((resolve) => {
    finish = resolve;
  });
  const view = await mount({ run: () => promise });
  try {
    await click(view.host, '입력·정답 생성');
    assert.equal(button(view.host, '세트 삭제').disabled, true);
    await act(async () => {
      finish();
      await promise;
    });
    assert.equal(button(view.host, '세트 삭제').disabled, false);
    assert.equal(view.mutations, 0);
  } finally {
    await view.close();
  }
});

test('a changed draft inside the functional updater is kept instead of deleting stale data', async () => {
  const view = await mount({
    beforeMutation: (draft) => {
      draft.testsets.tests.script = 'new 5 > $';
    },
  });
  try {
    await click(view.host, '세트 삭제');
    await click(view.host.querySelector('dialog'), '세트 삭제 확인');
    assert.ok(view.model.document.testsets.tests);
    assert.equal(view.model.document.testsets.tests.script, 'new 5 > $');
    assert.equal(view.host.querySelector('dialog'), null);
    assert.match(view.notices.at(-1)[0], /작업 사본이 변경되었습니다/);
    assert.equal(view.notices.at(-1)[1], true);
    assert.ok(
      !view.notices.some(([message]) => message.includes('삭제했습니다')),
    );
  } finally {
    await view.close();
  }
});

test('removing the active set closes local editors before they read a deleted set', async () => {
  for (const panel of ['그룹 관리', '순서 변경', '직접 입력']) {
    const view = await mount();
    try {
      await click(view.host, panel);
      assert.ok(view.host.querySelector('dialog'));
      const next = global.structuredClone(view.model.document);
      delete next.testsets.tests;
      await view.patch({ document: next });
      assert.equal(view.host.querySelector('dialog'), null);
      assert.equal(selected(view), 'extra2');
      assert.match(view.host.textContent, /선택한 테스트 0개/);
      assert.equal(view.mutations, 0);
    } finally {
      await view.close();
    }
  }
});
