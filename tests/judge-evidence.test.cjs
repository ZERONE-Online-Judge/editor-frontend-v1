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
  if (id === '../../components/Downloads')
    return {
      BlobDownload: ({ problemId, sha, filename, label }) =>
        sha
          ? React.createElement(
              'a',
              {
                href: `/api/problems/${problemId}/blobs/${sha}`,
                download: filename,
              },
              label,
            )
          : React.createElement('button', { disabled: true }, label),
    };
  if (id === '../../lib/downloads') return {};
  if (id === '../../lib/api')
    return {
      blobPreview: async (problem, sha) => {
        calls.push({ problem, sha });
        return {
          text: sha === 'input' ? '1 2\n3 4\n' : '3\n7\n',
          truncated: false,
          binary: false,
        };
      },
    };
  if (
    id === '../../components/LanguageResourceLimits' ||
    id === '../../components/Select' ||
    id === '../../components/Pagination' ||
    id === '../../lib/useRemotePage' ||
    id === '../../lib/jobHistory' ||
    id === '../../lib/executionCategories' ||
    id === '../../lib/permissions' ||
    id === '../../lib/workspace' ||
    id === '../../lib/executionNavigation' ||
    id === '../../lib/validationResults' ||
    id === '../../lib/authContext' ||
    id === './GeneratedTestResults' ||
    id === './ValidationResults' ||
    id === './JudgeCompatibilityNotice' ||
    id === './InvocationComments' ||
    id === './StressControls' ||
    id === './StressCounterexamples' ||
    id === './StressRunConditions' ||
    id === '../../lib/stressOptions' ||
    id === './InvocationControls' ||
    id === './TestsetSelector' ||
    id === './ExecutionLimitsInfo' ||
    id === './TestVerdictMatrix' ||
    id === './VerificationProgress' ||
    id === './SolutionResultPanel' ||
    id === './SolutionJudgeSummary' ||
    id === './CaseResultGrid' ||
    id === './StressTestResults' ||
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
const { CodeEvidence, ExpectationScopeLabel } = loaded.exports;
test('Combined default expectations identify all contributing testsets', () => {
  const { renderToStaticMarkup } = require('react-dom/server');
  const label = (scope) =>
    renderToStaticMarkup(React.createElement(ExpectationScopeLabel, { scope }));
  assert.equal(
    label({
      origin: 'default',
      testset: '전체',
      testsets: ['tests', 'tle'],
      group: '',
    }),
    '전체 기본 범위 · tests, tle',
  );
  assert.equal(
    label({ origin: 'testset', testset: 'tests', group: '' }),
    'tests · 세트 지정',
  );
  assert.equal(
    label({ origin: 'group', testset: 'tests', group: 'small' }),
    'tests / small · 그룹 지정',
  );
  assert.equal(
    label({ origin: 'default', testset: 'tests', group: '' }),
    'tests · 기본 범위',
  );
});
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
  assert.match(values[2], /저장된 실제 출력이 없습니다/);
});
test('Compilation failures show an explanation without fetching empty testcase hashes', async () => {
  const values = await render({ input: '', answer: '', actual: null });
  assert.deepEqual(calls, []);
  assert.match(values[0], /개별 테스트가 지정되지 않은 판정/);
  assert.match(values[1], /개별 테스트가 지정되지 않은 판정/);
});
after(() => dom.window.close());
