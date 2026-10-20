const { test, beforeEach, afterEach, after } = require('node:test');
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
const h = React.createElement;
const filename = path.resolve(__dirname, '../src/components/Select.tsx');
const loaded = new Module(filename, module);
loaded.filename = filename;
loaded.paths = Module._nodeModulePaths(path.dirname(filename));
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
const Select = loaded.exports.default;
let root, host;
beforeEach(() => {
  document.body.innerHTML = '';
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
});
after(() => dom.window.close());
async function render(element) {
  await act(async () => root.render(element));
}
async function click(element) {
  await act(async () => element.click());
}
async function key(element, value) {
  await act(async () =>
    element.dispatchEvent(
      new window.KeyboardEvent('keydown', {
        key: value,
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
}
function option(value, props = {}) {
  return h('option', { value, ...props }, value);
}
function popup() {
  return document.querySelector('[role="listbox"]');
}
function choices() {
  return [...popup().querySelectorAll('[role="option"]')];
}

test('custom choices preserve native labels, controlled changes, form data and reset', async () => {
  let observed;
  let submissions = 0;
  function Form() {
    const [value, setValue] = React.useState('C++17');
    return h(
      'form',
      {
        onSubmit: (event) => {
          event.preventDefault();
          submissions++;
        },
      },
      h(
        'label',
        null,
        '언어',
        h(
          Select,
          {
            name: 'language',
            value,
            onChange: (event) => {
              observed = event.currentTarget;
              setValue(event.target.value);
            },
          },
          option('C++17'),
          option('Python'),
        ),
      ),
    );
  }
  await render(h(Form));
  const select = host.querySelector('select');
  assert.equal(select.labels.length, 1);
  await click(select);
  await click(choices()[1]);
  assert.equal(select.value, 'Python');
  assert.equal(observed, select);
  assert.equal(
    new window.FormData(host.querySelector('form')).get('language'),
    'Python',
  );
  assert.equal(submissions, 0);
  assert.equal(popup(), null);
  assert.equal(document.activeElement, select);
  await render(
    h(
      'form',
      null,
      h(
        Select,
        { name: 'language', defaultValue: 'C++17', required: true },
        option('C++17'),
        option('Python'),
      ),
    ),
  );
  const uncontrolled = host.querySelector('select');
  await click(uncontrolled);
  await click(choices()[1]);
  assert.equal(uncontrolled.value, 'Python');
  host.querySelector('form').reset();
  assert.equal(uncontrolled.value, 'C++17');
});

test('keyboard navigation skips disabled options and disabled groups; escape cancels', async () => {
  await render(
    h(
      Select,
      { defaultValue: 'A' },
      option('A'),
      option('B', { disabled: true }),
      h('optgroup', { disabled: true, label: 'Unavailable' }, option('C')),
      option('D'),
      option('Java'),
    ),
  );
  const select = host.querySelector('select');
  await key(select, 'ArrowDown');
  await key(select, 'ArrowDown');
  assert.equal(choices()[3].getAttribute('data-active'), 'true');
  await key(select, 'Enter');
  assert.equal(select.value, 'D');
  await key(select, ' ');
  await key(select, 'Home');
  await key(select, 'Escape');
  assert.equal(select.value, 'D');
  assert.equal(popup(), null);
  await key(select, 'j');
  assert.equal(choices()[4].getAttribute('data-active'), 'true');
  await key(select, 'Enter');
  assert.equal(select.value, 'Java');
});

test('a dialog keeps its popup in the top layer and escape only closes the choices', async () => {
  let parentEscapes = 0;
  await render(
    h(
      'dialog',
      {
        open: true,
        onKeyDown: (event) => {
          if (event.key === 'Escape') parentEscapes++;
        },
      },
      h(Select, { defaultValue: 'A' }, option('A'), option('B')),
    ),
  );
  const select = host.querySelector('select');
  await click(select);
  assert.equal(popup().closest('dialog'), host.querySelector('dialog'));
  await key(select, 'Escape');
  assert.equal(parentEscapes, 0);
  assert.equal(popup(), null);
  await click(select);
  await act(async () =>
    document.body.dispatchEvent(
      new window.MouseEvent('pointerdown', { bubbles: true }),
    ),
  );
  assert.equal(popup(), null);
});

test('a stale option cannot change the value after available choices change', async () => {
  await render(h(Select, { defaultValue: 'A' }, option('A'), option('B')));
  const select = host.querySelector('select');
  await click(select);
  await render(h(Select, { defaultValue: 'A' }, option('A'), option('C')));
  await click(choices()[1]);
  assert.equal(select.value, 'A');
  assert.equal(popup(), null);
});

test('disabled selects stay closed and required validation remains native', async () => {
  await render(h(Select, { disabled: true }, option('A')));
  await click(host.querySelector('select'));
  assert.equal(popup(), null);
  await render(
    h(Select, { required: true, defaultValue: '' }, option(''), option('A')),
  );
  const select = host.querySelector('select');
  assert.equal(select.checkValidity(), false);
  await click(select);
  await click(choices()[1]);
  assert.equal(select.checkValidity(), true);
});
