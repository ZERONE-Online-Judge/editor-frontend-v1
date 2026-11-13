const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const filename = path.resolve(__dirname, '../src/lib/subtaskPoints.ts');
const loaded = new Module(filename, module);
loaded.filename = filename;
loaded.paths = Module._nodeModulePaths(path.dirname(filename));
loaded._compile(
  ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText,
  filename,
);
const { allocateGroupPoints, groupPoints } = loaded.exports;

test('a group budget preserves all required cases and other subtask weights', () => {
  const tests = {
    later: { index: 9, group: 'small', points: 20, input_sha: 'later' },
    other: { index: 4, group: 'large', points: 70, input_sha: 'other' },
    first: { index: 2, group: 'small', points: 10, input_sha: 'first' },
  };
  assert.equal(groupPoints(tests, 'small'), 30);
  assert.equal(allocateGroupPoints(tests, 'small', 40), true);
  assert.equal(groupPoints(tests, 'small'), 40);
  assert.equal(tests.first.points, 40);
  assert.equal(tests.later.points, 0);
  assert.equal(tests.other.points, 70);
  assert.deepEqual(
    Object.values(tests).map((t) => [t.index, t.input_sha]),
    [
      [9, 'later'],
      [4, 'other'],
      [2, 'first'],
    ],
  );
});

test('invalid and empty group allocations leave the document untouched', () => {
  const tests = { one: { index: 1, group: 'small', points: 30 } };
  const original = structuredClone(tests);
  for (const points of [-1, 30.5, 101, NaN, Infinity])
    assert.equal(allocateGroupPoints(tests, 'small', points), false);
  assert.equal(allocateGroupPoints(tests, 'missing', 100), false);
  assert.deepEqual(tests, original);
});
