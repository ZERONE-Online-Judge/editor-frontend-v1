const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const filename = path.resolve(__dirname, '../src/lib/textFormat.ts');
const loaded = new Module(filename, module);
loaded.filename = filename;
loaded.paths = module.paths;
loaded._compile(
  ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText,
  filename,
);
const {
  textFormat,
  toLf,
  automaticToLf,
  appendFinalNewline,
  preserveEditedLineEndings,
} = loaded.exports;

test('line ending detection distinguishes CRLF pairs from separate CR and LF', () => {
  for (const [input, lineEnding, hasFinalNewline, needsLfConversion] of [
    ['', 'none', false, false],
    ['123', 'none', false, false],
    ['1\n2', 'lf', false, false],
    ['1\n2\n', 'lf', true, false],
    ['1\r\n2', 'crlf', false, true],
    ['1\r\n2\r\n', 'crlf', true, true],
    ['1\r2', 'cr', false, true],
    ['1\r2\r', 'cr', true, true],
    ['1\r\n2\n', 'mixed', true, true],
    ['1\r2\n3', 'mixed', false, true],
    ['1\r\n2\r3', 'mixed', false, true],
    ['\r\r\n\n', 'mixed', true, true],
  ]) {
    assert.deepEqual(
      textFormat(input),
      { lineEnding, hasFinalNewline, needsLfConversion },
      JSON.stringify(input),
    );
  }
});

test('valid component inputs convert only Windows line separators', () => {
  const cases = [
    ['2\r\n7 8\r\n', '2\n7 8\n'],
    ['3 50\r\n10 40\r\n20 30\r\n25 25\r\n', '3 50\n10 40\n20 30\n25 25\n'],
  ];
  for (const [original, expected] of cases) {
    assert.deepEqual(textFormat(original), {
      lineEnding: 'crlf',
      hasFinalNewline: true,
      needsLfConversion: true,
    });
    assert.equal(toLf(original), expected);
    assert.deepEqual(textFormat(toLf(original)), {
      lineEnding: 'lf',
      hasFinalNewline: true,
      needsLfConversion: false,
    });
  }
});

test('LF conversion preserves intentionally invalid numbers, spacing and EOF', () => {
  const cases = [
    ['3 2\r\n8 9\r\n-1', '3 2\n8 9\n-1'],
    ['2\r\n-5 0\r\n', '2\n-5 0\n'],
    ['5\r\n99 -1', '5\n99 -1'],
    ['3\r\n7  8', '3\n7  8'],
    ['3\r\n7 8 ', '3\n7 8 '],
    ['\t1 \r\n\r\n2\t \r', '\t1 \n\n2\t \n'],
  ];
  for (const [original, expected] of cases) {
    const converted = toLf(original);
    assert.equal(converted, expected);
    assert.equal(
      textFormat(converted).hasFinalNewline,
      textFormat(original).hasFinalNewline,
    );
    assert.equal(toLf(converted), converted);
  }
});

test('automatic LF formatting skips NUL data while explicit conversion remains intentional', () => {
  const binary = 'a\0\r\nb\r';
  assert.equal(automaticToLf(binary), binary);
  assert.equal(toLf(binary), 'a\0\nb\n');
  assert.equal(automaticToLf('a  \r\nb\t'), 'a  \nb\t');
});

test('conversion preserves Unicode and treats Unicode separators as content', () => {
  const original = '\uFEFF테스트 🎲\r\n둘째 줄\r끝\n\u2028\u2029';
  assert.equal(toLf(original), '\uFEFF테스트 🎲\n둘째 줄\n끝\n\u2028\u2029');
  assert.deepEqual(textFormat(original), {
    lineEnding: 'mixed',
    hasFinalNewline: false,
    needsLfConversion: true,
  });
  assert.deepEqual(textFormat('문자\u2028열\u2029'), {
    lineEnding: 'none',
    hasFinalNewline: false,
    needsLfConversion: false,
  });
});

test('appending a final newline preserves existing line style and content', () => {
  for (const [original, expected] of [
    ['', ''],
    ['1', '1\n'],
    ['1\n2 ', '1\n2 \n'],
    ['1\r\n2 ', '1\r\n2 \r\n'],
    ['1\r2 ', '1\r2 \r'],
    ['1\r\n2\n3', '1\r\n2\n3\n'],
    ['문자\u2028열', '문자\u2028열\n'],
    ['1\n', '1\n'],
    ['1\r\n', '1\r\n'],
    ['1\r', '1\r'],
    ['1\n\n', '1\n\n'],
  ]) {
    assert.equal(appendFinalNewline(original), expected);
    assert.equal(appendFinalNewline(expected), expected);
  }
});

test('raw textarea edits preserve original separators outside the edited range', () => {
  for (const [before, edited, expected] of [
    ['2\r\n7 8', '3\n7 8', '3\r\n7 8'],
    ['2\r7 8\r', '2\n7 9\n', '2\r7 9\r'],
    ['a\r\nb\nc\rd', 'a\nbb\nc\nd', 'a\r\nbb\nc\rd'],
    ['a\r\nb', 'a\nnew\nb', 'a\r\nnew\r\nb'],
    ['a\rb', 'a\nnew\nb', 'a\rnew\rb'],
    ['a\r\nb\nc', 'a\nb\nc', 'a\r\nb\nc'],
    ['a\nb', 'a\nchanged', 'a\nchanged'],
  ])
    assert.equal(preserveEditedLineEndings(before, edited), expected);
});
