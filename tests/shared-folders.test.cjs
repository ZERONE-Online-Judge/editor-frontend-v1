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
dom.window.HTMLDialogElement.prototype.showModal = function () {
  this.setAttribute('open', '');
};
dom.window.HTMLDialogElement.prototype.close = function () {
  this.removeAttribute('open');
};
const React = require('react');
const { act, createElement: h } = React;
const { createRoot } = require('react-dom/client');
let requests = [],
  reply,
  account = { id: 'owner' };
function load(name, mocks = {}) {
  const filename = path.resolve(__dirname, '../src/' + name);
  const m = new Module(filename, module);
  m.filename = filename;
  m.paths = Module._nodeModulePaths(path.dirname(filename));
  const native = m.require.bind(m);
  m.require = (id) => mocks[id] || native(id);
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
async function mount(Component, props = {}) {
  requests = [];
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(h(Component, props)));
  return {
    host,
    close: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}
const buttons = (v, label) =>
  [...v.host.querySelectorAll('button')].filter((b) => b.textContent === label);
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
  assert.equal(v.host.querySelector('input[type=email]'), null);
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
test('Inviting uses the chosen role and explains inbox acceptance without claiming email delivery', async () => {
  reply = async () => members;
  const v = await mount(components.SharedFolderMembers, {
    folder,
    onClose() {},
    onChanged() {},
    onLeft() {},
  });
  const input = v.host.querySelector('input[type=email]');
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
        email: 'new@example.com',
        permissions: ['execute', 'render', 'issues'],
      },
    },
  );
  assert.match(v.host.textContent, /이메일은 발송하지 않습니다/);
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
  assert.equal(v.host.querySelector('input[type=email]'), null);
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
