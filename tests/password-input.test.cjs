const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'),
  path = require('node:path'),
  Module = require('node:module'),
  ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<body></body>', { pretendToBeVisual: true });
global.window = dom.window;
global.document = dom.window.document;
global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react'),
  { act } = React;
const { createRoot } = require('react-dom/client');
const cache = new Map();
const requests = [];
const mocks = {
  './ui': {
    Notice: ({ children }) => React.createElement('p', null, children),
  },
  '../lib/api': {
    api: async () => ({ has_password: false }),
    post: async (...args) => {
      requests.push(args);
      return {};
    },
  },
};
function load(relative) {
  const file = path.resolve(__dirname, '../src', relative);
  if (cache.has(file)) return cache.get(file).exports;
  const loaded = new Module(file, module);
  loaded.filename = file;
  loaded.paths = Module._nodeModulePaths(path.dirname(file));
  const native = loaded.require.bind(loaded);
  loaded.require = (id) =>
    mocks[id] ||
    (id.endsWith('.css')
      ? {}
      : id.startsWith('.')
        ? load(
            path.relative(
              path.resolve(__dirname, '../src'),
              ['.tsx', '.ts']
                .map((ext) => path.resolve(path.dirname(file), id + ext))
                .find((file) => fs.existsSync(file)),
            ),
          )
        : native(id));
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
const { PasswordInput, PasswordRequirements, PasswordMatch } = load(
  'components/PasswordInput.tsx',
);
const { validNewPassword } = load('components/passwordPolicy.ts');
async function mount(element) {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(element));
  return {
    host,
    render: async (element) => act(async () => root.render(element)),
    close: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}
test('Password visibility preserves exact case and never submits the surrounding form', async () => {
  let submitted = 0;
  const view = await mount(
    React.createElement(
      'form',
      {
        onSubmit: (e) => {
          e.preventDefault();
          submitted++;
        },
      },
      React.createElement(PasswordInput, {
        label: '비밀번호',
        value: 'Abcdef1!',
        readOnly: true,
        autoComplete: 'current-password',
      }),
    ),
  );
  const input = view.host.querySelector('input'),
    button = view.host.querySelector('button');
  assert.equal(input.type, 'password');
  assert.equal(button.type, 'button');
  await act(async () => button.click());
  assert.equal(input.type, 'text');
  assert.equal(input.value, 'Abcdef1!');
  assert.equal(button.getAttribute('aria-pressed'), 'true');
  assert.equal(button.getAttribute('aria-label'), '비밀번호 숨기기');
  assert.equal(submitted, 0);
  await act(async () => button.click());
  assert.equal(input.type, 'password');
  await view.close();
});
test('Requirements update independently and confirmation respects case', async () => {
  const view = await mount(
    React.createElement(PasswordRequirements, { value: '' }),
  );
  assert.equal(view.host.querySelectorAll('[data-state=idle]').length, 4);
  await view.render(
    React.createElement(PasswordRequirements, { value: 'abcdef1' }),
  );
  assert.equal(view.host.querySelectorAll('[data-state=met]').length, 2);
  await view.render(
    React.createElement(PasswordRequirements, { value: 'abcdef1!' }),
  );
  assert.equal(view.host.querySelectorAll('[data-state=met]').length, 4);
  assert.match(view.host.textContent, /모든 조건 충족/);
  await view.render(
    React.createElement(PasswordMatch, {
      password: 'Abcdef1!',
      repeat: 'abcdef1!',
    }),
  );
  assert.match(view.host.textContent, /일치하지 않습니다/);
  await view.render(
    React.createElement(PasswordMatch, {
      password: 'Abcdef1!',
      repeat: 'Abcdef1!',
    }),
  );
  assert.match(view.host.textContent, /비밀번호가 일치합니다/);
  await view.close();
});
test('The client accepts either letter case and rejects non-English text or missing requirements', () => {
  for (const value of ['abcdef1!', 'ABCDEF1!', 'Abc1234_'])
    assert.equal(validNewPassword(value), true);
  for (const value of [
    'abcde1!',
    'abcdef12',
    'abcdefg!',
    '1234567!',
    '한글abcd1!',
    'abcd 12!',
    'abcd１２!',
    'abcd12！',
    'A1!' + 'a'.repeat(126),
  ])
    assert.equal(validNewPassword(value), false);
});
test('Registration enables saving only after policy, code and exact confirmation match', async () => {
  requests.length = 0;
  const Form = load('components/PasswordForm.tsx').default;
  const view = await mount(
    React.createElement(Form, {
      mode: 'reset',
      email: 'author@example.com',
      onDone: () => {},
    }),
  );
  await act(async () => view.host.querySelector('button').click());
  async function fill(input, value) {
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      ).set.call(input, value);
      input.dispatchEvent(new window.Event('input', { bubbles: true }));
    });
  }
  const inputs = view.host.querySelectorAll('input');
  const save = [...view.host.querySelectorAll('button')].find(
    (b) => b.textContent === '비밀번호 재설정',
  );
  assert.equal(save.disabled, true);
  await fill(inputs[1], '123456');
  await fill(inputs[2], 'Abcdef1!');
  await fill(inputs[3], 'abcdef1!');
  assert.equal(save.disabled, true);
  assert.match(view.host.textContent, /일치하지 않습니다/);
  await fill(inputs[3], 'Abcdef1!');
  assert.equal(save.disabled, false);
  const show = view.host.querySelector('button[aria-label="새 비밀번호 보기"]');
  await act(async () => show.click());
  assert.equal(inputs[2].type, 'text');
  assert.equal(inputs[3].type, 'password');
  assert.equal(requests.length, 1);
  await fill(inputs[2], '한글abcd1!');
  await fill(inputs[3], '한글abcd1!');
  assert.equal(save.disabled, true);
  await fill(inputs[2], 'Abcdef1!');
  await fill(inputs[3], 'Abcdef1!');
  await act(async () => save.click());
  assert.equal(requests[1][0], '/auth/password/reset/confirm');
  assert.equal(requests[1][1].new_password, 'Abcdef1!');
  await view.close();
});
after(() => dom.window.close());
