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
let calls = [];
const file = path.resolve(__dirname, '../src/pages/workspace/Executions.tsx');
const loaded = new Module(file, module);
loaded.filename = file;
loaded.paths = Module._nodeModulePaths(path.dirname(file));
const native = loaded.require.bind(loaded);
loaded.require = (id) => {
  if (id === '../../lib/api')
    return {
      blobText: async (problem, sha) => {
        calls.push({ problem, sha });
        return sha === 'input' ? '1 2\n3 4\n' : '3\n7\n';
      },
    };
  if (
    id === '../../lib/workspace' ||
    id === '../../lib/authContext' ||
    id === './InvocationComments' ||
    id === './StressControls' ||
    id === './StressCounterexamples' ||
    id === './InvocationControls' ||
    id === './ZojPublishing' ||
    id === 'react-router-dom'
  )
    return {};
  if (id === '../../components/ui')
    return {
      CodeEditor: ({ value, label }) =>
        React.createElement(
          'label',
          null,
          label,
          React.createElement('textarea', { value, readOnly: true }),
        ),
      Notice: ({ children }) => React.createElement('p', null, children),
    };
  return native(id);
};
loaded._compile(
  ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText,
  file,
);
const { CodeEvidence } = loaded.exports;
async function render(props) {
  calls = [];
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () =>
    root.render(
      React.createElement(CodeEvidence, { problemId: 'fixture', ...props }),
    ),
  );
  const values = [...host.querySelectorAll('textarea')].map((el) => el.value);
  await act(async () => root.unmount());
  host.remove();
  return values;
}
test('Remote judge evidence preserves real input and does not fetch an absent output', async () => {
  const values = await render({
    input: 'input',
    answer: 'answer',
    actual: null,
  });
  assert.deepEqual(calls, [
    { problem: 'fixture', sha: 'input' },
    { problem: 'fixture', sha: 'answer' },
  ]);
  assert.equal(values[0], '1 2\n3 4\n');
  assert.equal(values[1], '3\n7\n');
  assert.match(values[2], /개별 출력 전문을 제공하지 않습니다/);
});
test('Compilation failures show an explanation without fetching empty testcase hashes', async () => {
  const values = await render({ input: '', answer: '', actual: null });
  assert.deepEqual(calls, []);
  assert.match(values[0], /개별 테스트가 지정되지 않은 판정/);
  assert.match(values[1], /개별 테스트가 지정되지 않은 판정/);
});
after(() => dom.window.close());
