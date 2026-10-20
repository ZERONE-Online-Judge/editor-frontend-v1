const { test, after, afterEach } = require('node:test');
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
dom.window.HTMLDialogElement.prototype.showModal = function () {
  this.setAttribute('open', '');
};
dom.window.HTMLDialogElement.prototype.close = function () {
  this.removeAttribute('open');
};
const React = require('react');
const { act, createElement: h } = React;
const { createRoot } = require('react-dom/client');
const cleanup = new Set();
afterEach(async () => {
  for (const close of [...cleanup]) await close();
});
let requests = [],
  reply,
  account = { id: 'owner' };
function load(name, mocks = {}) {
  const filename = path.resolve(__dirname, '../src/' + name);
  const m = new Module(filename, module);
  m.filename = filename;
  m.paths = Module._nodeModulePaths(path.dirname(filename));
  const native = m.require.bind(m);
  m.require = (id) =>
    mocks[id] ||
    (id.endsWith('/largeText') ? load('lib/largeText.ts') : native(id));
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
const helpers = load('lib/sharedFolders.ts');
const permissions = load('lib/permissions.ts');
const checklist = load('components/PermissionChecklist.tsx', {
  '../lib/permissions': permissions,
});
const call = async (method, path, body) => {
  requests.push({ method, path, body });
  return reply(method, path, body);
};
const components = load('components/SharedFolders.tsx', {
  './PermissionChecklist': checklist,
  '../lib/permissions': permissions,
  '../lib/api': {
    api: (p, o = {}) => call(o.method || 'GET', p),
    post: (p, b) => call('POST', p, b),
    put: (p, b) => call('PUT', p, b),
    time: () => '7일 후',
  },
  '../lib/authContext': { useAuth: () => ({ user: account }) },
  '../lib/sharedFolders': helpers,
  './ui': load('components/ui.tsx'),
});
const Overview = load('components/SharedFolderOverview.tsx', {
  '../lib/api': { api: (p, o = {}) => call(o.method || 'GET', p) },
  '../lib/permissions': permissions,
  '../lib/authContext': { useAuth: () => ({ user: account }) },
  '../lib/sharedFolders': helpers,
  './ui': load('components/ui.tsx'),
}).default;
async function mount(Component, props = {}) {
  requests = [];
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(h(Component, props)));
  const close = async () => {
    await act(async () => root.unmount());
    host.remove();
    cleanup.delete(close);
  };
  cleanup.add(close);
  return {
    host,
    render: async (nextProps) =>
      act(async () => root.render(h(Component, nextProps))),
    close,
  };
}
const buttons = (v, label) =>
  [...v.host.querySelectorAll('button')].filter(
    (b) => b.textContent.trim() === label,
  );
const click = async (v, label) => act(async () => buttons(v, label)[0].click());
const members = {
  role: 'OWNER',
  members: [
    {
      user_id: 'owner',
      role: 'OWNER',
      display_name: '작성자',
      handle: 'author',
    },
    { user_id: 'peer', role: 'EDITOR', display_name: '동료', handle: 'peer' },
  ],
  invitations: [],
};
const folder = { id: 'root', workspace_id: 'root', name: '공동 작업' };
test('Received invitations do not grant access until the user explicitly accepts', async () => {
  let accepted = '';
  reply = async (method) =>
    method === 'GET'
      ? [
          {
            id: 'invite',
            workspace_id: 'root',
            folder_name: '공동 작업',
            role: 'REVIEWER',
            inviter: '작성자',
            expires_at: 1,
          },
        ]
      : {};
  const v = await mount(components.FolderInvitations, {
    onAccepted: (id) => (accepted = id),
  });
  assert.match(v.host.textContent, /검수자/);
  assert.equal(accepted, '');
  assert.equal(requests.length, 1);
  await click(v, '초대 수락');
  assert.equal(accepted, 'root');
  assert.equal(
    requests.at(-1).path,
    '/shared-folders/invitations/invite/accept',
  );
  assert.equal(v.host.textContent, '');
  await v.close();
});
test('Read members cannot invite or change roles, and leaving requires confirmation', async () => {
  account = { id: 'peer' };
  reply = async () => ({
    ...members,
    role: 'VIEWER',
    members: [members.members[0], { ...members.members[1], role: 'VIEWER' }],
  });
  let left = false;
  const v = await mount(components.SharedFolderMembers, {
    folder,
    onClose() {},
    onChanged() {},
    onLeft() {
      left = true;
    },
  });
  assert.equal(
    v.host.querySelector('.shared-invite-form input[type=text]'),
    null,
  );
  assert.equal(v.host.querySelector('select'), null);
  await click(v, '공유 폴더 나가기');
  assert.match(v.host.querySelector('[role=alert]').textContent, /나갈까요/);
  assert.equal(requests.length, 1);
  await click(v, '확인');
  assert.equal(requests.at(-1).method, 'DELETE');
  assert.equal(requests.at(-1).path, '/shared-folders/root/members/peer');
  assert.equal(left, true);
  await v.close();
  account = { id: 'owner' };
});
test('Admins can change a member role but the owner is protected and removal is confirmed', async () => {
  reply = async () => members;
  let changed = 0;
  const v = await mount(components.SharedFolderMembers, {
    folder,
    onClose() {},
    onChanged() {
      changed++;
    },
    onLeft() {},
  });
  assert.equal(v.host.querySelector('select'), null);
  assert.equal(buttons(v, '권한 수정').length, 1);
  await click(v, '권한 수정');
  const editor = v.host.querySelector('dialog.permission-member-editor[open]');
  assert.ok(editor);
  assert.equal(v.host.querySelectorAll('dialog[open]').length, 2);
  await act(async () =>
    [...editor.querySelectorAll('button')]
      .find((b) => b.textContent === '번역')
      .click(),
  );
  await click(v, '권한 저장');
  assert.deepEqual(
    requests.find((r) => r.method === 'PUT'),
    {
      method: 'PUT',
      path: '/shared-folders/root/members/peer',
      body: { permissions: ['translate', 'render', 'issues'] },
    },
  );
  assert.equal(v.host.querySelectorAll('dialog[open]').length, 1);
  await click(v, '내보내기');
  assert.equal(requests.filter((r) => r.method === 'DELETE').length, 0);
  await click(v, '취소');
  assert.equal(requests.filter((r) => r.method === 'DELETE').length, 0);
  await click(v, '내보내기');
  await click(v, '확인');
  assert.equal(
    requests.find((r) => r.method === 'DELETE').path,
    '/shared-folders/root/members/peer',
  );
  assert.equal(changed, 2);
  await v.close();
});
test('Pending invite permissions open above members and save without accepting or reinviting', async () => {
  let granted = ['issues'];
  reply = async (method, path, body) => {
    if (method === 'PUT') {
      granted = body.permissions;
      return { ok: true };
    }
    return {
      ...members,
      members: [members.members[0]],
      invitations: [
        {
          id: 'pending',
          email: 'new@example.com',
          role: 'CUSTOM',
          permissions: granted,
          expires_at: 1,
        },
      ],
    };
  };
  const v = await mount(components.SharedFolderMembers, {
    folder,
    initialTab: 'invitations',
    onClose() {},
    onChanged() {},
    onLeft() {},
  });
  await click(v, '권한 수정');
  const editor = v.host.querySelector('dialog.permission-member-editor[open]');
  assert.ok(editor);
  assert.equal(editor.parentElement, v.host);
  assert.equal(v.host.querySelectorAll('dialog[open]').length, 2);
  assert.match(editor.textContent, /new@example.com · 초대 권한 수정/);
  assert.match(editor.textContent, /초대 만료일은 유지/);
  await act(async () =>
    [...editor.querySelectorAll('button')]
      .find((b) => b.textContent === '검수')
      .click(),
  );
  await click(v, '권한 저장');
  assert.deepEqual(
    requests.filter((r) => r.method !== 'GET'),
    [
      {
        method: 'PUT',
        path: '/shared-folders/root/invitations/pending',
        body: { permissions: ['execute', 'render', 'issues'] },
      },
    ],
  );
  assert.equal(v.host.querySelectorAll('dialog[open]').length, 1);
  assert.match(v.host.textContent, /상대방이 수락할 때 적용/);
  await v.close();
});
test('Cancel preserves a pending invitation and failed saves keep the modal and selection open', async () => {
  reply = async (method) => {
    if (method === 'PUT') throw new Error('이미 수락된 초대입니다.');
    return {
      ...members,
      members: [members.members[0]],
      invitations: [
        {
          id: 'pending',
          email: 'new@example.com',
          role: 'CUSTOM',
          permissions: ['issues'],
          expires_at: 1,
        },
      ],
    };
  };
  const v = await mount(components.SharedFolderMembers, {
    folder,
    initialTab: 'invitations',
    onClose() {},
    onChanged() {},
    onLeft() {},
  });
  await click(v, '권한 수정');
  await click(v, '취소');
  assert.equal(requests.filter((r) => r.method !== 'GET').length, 0);
  await click(v, '권한 수정');
  const editor = v.host.querySelector('dialog.permission-member-editor[open]');
  await act(async () =>
    [...editor.querySelectorAll('button')]
      .find((b) => b.textContent === '읽기')
      .click(),
  );
  await click(v, '권한 저장');
  assert.equal(v.host.querySelectorAll('dialog[open]').length, 2);
  assert.match(editor.querySelector('[role=alert]').textContent, /이미 수락/);
  assert.deepEqual(
    requests.find((r) => r.method === 'PUT').body.permissions,
    [],
  );
  assert.equal(
    [...editor.querySelectorAll('input[type=checkbox]')].some(
      (input) => input.checked,
    ),
    false,
  );
  await v.close();
});
test('A limited manager cannot edit pending grants above their own scope or other administrator invitations', async () => {
  account = { id: 'manager' };
  reply = async () => ({
    ...members,
    role: 'CUSTOM',
    permissions: ['manage_access', 'issues'],
    members: [members.members[0]],
    invitations: [
      {
        id: 'strong',
        email: 'strong@example.com',
        permissions: ['publish'],
        role: 'CUSTOM',
        expires_at: 1,
      },
      {
        id: 'admin',
        email: 'admin@example.com',
        permissions: ['manage_access'],
        role: 'CUSTOM',
        expires_at: 1,
      },
      {
        id: 'peer',
        email: 'peer@example.com',
        permissions: ['issues'],
        role: 'CUSTOM',
        expires_at: 1,
      },
    ],
  });
  const v = await mount(components.SharedFolderMembers, {
    folder,
    initialTab: 'invitations',
    onClose() {},
    onChanged() {},
    onLeft() {},
  });
  assert.equal(buttons(v, '권한 수정').length, 1);
  await click(v, '권한 수정');
  assert.match(
    v.host.querySelector('dialog.permission-member-editor h2').textContent,
    /peer@example.com/,
  );
  await v.close();
  account = { id: 'owner' };
});
test('Inviting uses the chosen role and explains email notification and inbox acceptance', async () => {
  reply = async () => members;
  const v = await mount(components.SharedFolderMembers, {
    folder,
    initialTab: 'invite',
    onClose() {},
    onChanged() {},
    onLeft() {},
  });
  const input = v.host.querySelector('.shared-invite-form input[type=text]');
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value',
  ).set;
  await act(async () => {
    setter.call(input, 'new@example.com');
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
  await act(async () =>
    [...v.host.querySelectorAll('.shared-invite-form button')]
      .find((b) => b.textContent === '검수')
      .click(),
  );
  await act(async () =>
    v.host
      .querySelector('form')
      .dispatchEvent(
        new window.Event('submit', { bubbles: true, cancelable: true }),
      ),
  );
  assert.deepEqual(
    requests.find((r) => r.method === 'POST'),
    {
      method: 'POST',
      path: '/shared-folders/root/invitations',
      body: {
        login: 'new@example.com',
        permissions: ['execute', 'render', 'issues'],
      },
    },
  );
  assert.match(v.host.textContent, /해당 계정에 안내 이메일을 보냅니다/);
  assert.match(v.host.textContent, /초대는 7일간 유효/);
  assert.match(v.host.textContent, /안내 메일 발송을 요청했습니다/);
  assert.doesNotMatch(v.host.textContent, /이메일은 발송하지 않습니다/);
  assert.match(v.host.textContent, /받은 초대에서 수락/);
  await v.close();
});
test('Personal filing stays personal while any shared scope transition requires confirmation', () => {
  const folders = [
    { id: 'private' },
    { id: 'root', workspace_id: 'root' },
    { id: 'child', workspace_id: 'root' },
    { id: 'else', workspace_id: 'else' },
    { id: 'readonly', workspace_id: 'root', can_edit: false },
  ];
  const rows = [
    { id: 'own', workspace_id: null },
    { id: 'team', workspace_id: 'root' },
  ];
  assert.equal(helpers.shareScopeChanges(rows, ['own'], folders[0]), false);
  assert.equal(helpers.shareScopeChanges(rows, ['own'], folders[1]), true);
  assert.equal(helpers.shareScopeChanges(rows, ['team'], folders[2]), false);
  assert.equal(helpers.shareScopeChanges(rows, ['team']), true);
  assert.equal(helpers.shareScopeChanges(rows, ['team'], folders[3]), true);
  assert.deepEqual(
    helpers.folderDestinations(folders, folders[1]).map((f) => f.id),
    ['root', 'child'],
  );
});
after(() => dom.window.close());

test('Shared read and review members cannot reorganize other authors problems', () => {
  const row = {
    workspace_id: 'team',
    workspace_role: 'VIEWER',
    owner: 'author',
  };
  assert.equal(helpers.canOrganizeProblem(row, 'reader'), false);
  assert.equal(
    helpers.canOrganizeProblem(
      { ...row, workspace_role: 'REVIEWER' },
      'reviewer',
    ),
    false,
  );
  assert.equal(
    helpers.canOrganizeProblem({ ...row, workspace_role: 'EDITOR' }, 'editor'),
    true,
  );
  assert.equal(helpers.canOrganizeProblem(row, 'author'), true);
  assert.equal(
    helpers.canOrganizeProblem(
      { workspace_id: null, owner: 'author' },
      'reader',
    ),
    true,
  );
});

test('Explicit read-only permissions override an old ADMIN label', async () => {
  reply = async () => ({ ...members, role: 'ADMIN', permissions: [] });
  const v = await mount(components.SharedFolderMembers, {
    folder,
    onClose() {},
    onChanged() {},
    onLeft() {},
  });
  assert.equal(
    v.host.querySelector('.shared-invite-form input[type=text]'),
    null,
  );
  assert.equal(buttons(v, '권한 수정').length, 0);
  await v.close();
});
test('Custom membership administrators see the same checklist and cannot grant unavailable features', async () => {
  reply = async () => ({
    ...members,
    role: 'CUSTOM',
    permissions: ['manage_access', 'issues'],
    members: [
      members.members[0],
      { ...members.members[1], role: 'CUSTOM', permissions: ['issues'] },
    ],
  });
  const v = await mount(components.SharedFolderMembers, {
    folder,
    initialTab: 'invite',
    onClose() {},
    onChanged() {},
    onLeft() {},
  });
  const scopes = [
    ...v.host.querySelectorAll('.shared-invite-form input[type=checkbox]'),
  ];
  assert.equal(scopes.length, 16);
  assert.equal(scopes.filter((x) => !x.disabled).length, 2);
  await act(async () => buttons(v, '검수')[0].click());
  const checked = scopes
    .filter((x) => x.checked)
    .map((x) => x.closest('label').textContent);
  assert.equal(checked.length, 1);
  assert.match(checked[0], /이슈/);
  await v.close();
});

test('Team folder overview shows owner, accepted members and pending invitations separately', async () => {
  reply = async () => ({
    ...members,
    invitations: [
      {
        id: 'pending',
        email: 'new@example.com',
        role: 'VIEWER',
        expires_at: 1,
      },
    ],
  });
  const opened = [];
  const v = await mount(Overview, {
    folder,
    nested: true,
    onOpen: (tab) => opened.push(tab),
  });
  assert.match(
    v.host.querySelector('.team-folder-facts').textContent,
    /함께하는 구성원 2명/,
  );
  assert.match(
    v.host.querySelector('.team-folder-facts').textContent,
    /소유자 작성자/,
  );
  assert.match(v.host.textContent, /초대 대기 1건/);
  assert.match(v.host.textContent, /이 하위 폴더/);
  assert.equal(v.host.querySelectorAll('.team-member-chip').length, 2);
  assert.doesNotMatch(v.host.textContent, /new@example.com|접속 중|온라인/);
  await click(v, '구성원 관리');
  await click(v, '구성원 초대');
  await click(v, '초대 대기 1건');
  assert.deepEqual(opened, ['members', 'invite', 'invitations']);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].path, '/shared-folders/root/members');
  await v.close();
});

test('Overview respects explicit read-only permissions even if the old role says ADMIN', async () => {
  reply = async () => ({
    ...members,
    role: 'ADMIN',
    permissions: [],
    invitations: [],
  });
  const v = await mount(Overview, { folder, onOpen() {} });
  assert.equal(buttons(v, '구성원 초대').length, 0);
  assert.equal(buttons(v, '구성원 관리').length, 0);
  assert.equal(buttons(v, '구성원 보기').length, 1);
  assert.doesNotMatch(v.host.textContent, /초대 대기/);
  await v.close();
});

test('Large rosters have a truthful total and a compact preview with an explicit remainder', async () => {
  reply = async () => ({
    ...members,
    members: [
      members.members[0],
      ...Array.from({ length: 7 }, (_, i) => ({
        ...members.members[1],
        user_id: `p${i}`,
        handle: `p${i}`,
      })),
    ],
  });
  const v = await mount(Overview, { folder, onOpen() {} });
  assert.match(v.host.textContent, /함께하는 구성원 8명/);
  assert.equal(v.host.querySelectorAll('.team-member-chip').length, 6);
  assert.equal(buttons(v, '+2명 더 보기').length, 1);
  await v.close();
});

test('Overview refreshes after membership changes and removes focus listeners when closed', async () => {
  let snapshot = members;
  reply = async () => snapshot;
  const v = await mount(Overview, { folder, onOpen() {} });
  snapshot = { ...members, members: [members.members[0]] };
  await act(async () => window.dispatchEvent(new window.Event('focus')));
  assert.match(v.host.textContent, /함께하는 구성원 1명/);
  assert.equal(requests.length, 2);
  await v.close();
  await act(async () => window.dispatchEvent(new window.Event('focus')));
  assert.equal(requests.length, 2);
});

test('Overview ignores old folder responses and never displays a previous team roster in another folder', async () => {
  let resolve;
  reply = async (method, path) =>
    path.includes('/root/')
      ? new Promise((done) => {
          resolve = done;
        })
      : {
          ...members,
          members: [{ ...members.members[0], display_name: '다른 소유자' }],
        };
  const v = await mount(Overview, { folder, onOpen() {} });
  await v.render({
    folder: { ...folder, id: 'next', workspace_id: 'next', name: '다른 팀' },
    onOpen() {},
  });
  assert.match(v.host.textContent, /다른 소유자/);
  await act(async () => resolve(members));
  assert.match(v.host.textContent, /다른 소유자/);
  assert.doesNotMatch(v.host.textContent, /작성자/);
  await v.close();
});

test('Failed roster reads do not invent a zero count and offer a working retry', async () => {
  reply = async () => {
    throw new Error('일시적인 연결 오류');
  };
  const v = await mount(Overview, { folder, onOpen() {} });
  assert.match(
    v.host.querySelector('[role=alert]').textContent,
    /불러오지 못했습니다/,
  );
  assert.doesNotMatch(v.host.textContent, /구성원 0명/);
  reply = async () => members;
  await click(v, '다시 시도');
  assert.match(v.host.textContent, /함께하는 구성원 2명/);
  await v.close();
});

test('Member management opens on people and supports keyboard tabs and local name search', async () => {
  reply = async () => members;
  const v = await mount(components.SharedFolderMembers, {
    folder,
    onClose() {},
    onChanged() {},
    onLeft() {},
  });
  assert.match(
    v.host.querySelector('[role=tab][aria-selected=true]').textContent,
    /구성원 2명/,
  );
  assert.equal(
    v.host.querySelector('.shared-invite-form input[type=text]'),
    null,
  );
  const search = v.host.querySelector('[aria-label="구성원 검색"]');
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    ).set.call(search, '@peer');
    search.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
  assert.equal(
    v.host.querySelectorAll(
      '[aria-label="폴더 구성원 목록"] .shared-member-row',
    ).length,
    1,
  );
  assert.match(
    v.host.querySelector('[aria-label="폴더 구성원 목록"]').textContent,
    /동료/,
  );
  const tab = v.host.querySelector('[role=tab][aria-selected=true]');
  await act(async () =>
    tab.dispatchEvent(
      new window.KeyboardEvent('keydown', { key: 'End', bubbles: true }),
    ),
  );
  assert.equal(
    v.host.querySelector('[role=tab][aria-selected=true]').textContent,
    '새 구성원 초대',
  );
  assert.ok(v.host.querySelector('.shared-invite-form input[type=text]'));
  assert.equal(requests.length, 1);
  await v.close();
});

test('An Editor tag can be invited without the browser email-only constraint', async () => {
  reply = async () => members;
  const v = await mount(components.SharedFolderMembers, {
    folder,
    initialTab: 'invite',
    onClose() {},
    onChanged() {},
    onLeft() {},
  });
  const input = v.host.querySelector('.shared-invite-form input[type=text]');
  assert.match(input.placeholder, /@editor-/);
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    ).set.call(input, '  @editor-0123456789  ');
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
  assert.equal(input.checkValidity(), true);
  await act(async () =>
    v.host
      .querySelector('form')
      .dispatchEvent(
        new window.Event('submit', { bubbles: true, cancelable: true }),
      ),
  );
  assert.deepEqual(requests.find((r) => r.method === 'POST').body, {
    login: '@editor-0123456789',
    permissions: [],
  });
  assert.equal(input.value, '');
});

test('Permission summaries start compact and group every allowed capability', async () => {
  const v = await mount(checklist.PermissionSummary, {
    value: permissions.allPermissions,
  });
  const details = v.host.querySelector('details');
  assert.equal(details.open, false);
  assert.match(details.querySelector('summary').textContent, /권한 16개/);
  assert.doesNotMatch(
    details.querySelector('summary').textContent,
    /지문·해설 편집/,
  );
  assert.deepEqual(
    [...details.querySelectorAll('h4')].map((el) => el.textContent),
    ['문제 작성', '실행·배포', '협업'],
  );
  assert.equal(details.querySelectorAll('li').length, 16);
  await act(async () => details.querySelector('summary').click());
  assert.equal(details.open, true);
  await v.render({ value: [] });
  assert.equal(v.host.querySelector('details'), null);
  assert.equal(v.host.textContent, '자료·실행 결과 읽기');
});
