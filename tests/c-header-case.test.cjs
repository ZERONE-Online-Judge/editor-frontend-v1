const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const file = path.resolve(__dirname, '../src/lib/cHeaderCase.ts');
const loaded = new Module(file, module);
loaded._compile(
  ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText,
  file,
);
const inspect = loaded.exports.inspectCHeaderCase;
const issue = (line, header, suggestion) => ({ line, header, suggestion });

test('C++ standard includes explain each incorrect letter case in source order', () => {
  assert.deepEqual(
    inspect(
      'cpp17',
      '#include <String>\n#include <IOSTREAM>\n#include <Vector>\n',
    ),
    [
      issue(1, 'String', 'string'),
      issue(2, 'IOSTREAM', 'iostream'),
      issue(3, 'Vector', 'vector'),
    ],
  );
  assert.deepEqual(inspect('cpp20', '#include <cStdio>\n#include <String.H>'), [
    issue(1, 'cStdio', 'cstdio'),
    issue(2, 'String.H', 'string.h'),
  ]);
});

test('C header names are checked without mistaking C++ wrappers for C headers', () => {
  for (const language of [
    'c',
    'c89',
    'c99',
    'c11',
    'c17',
    'c23',
    'gnu99',
    'gnuc17',
  ]) {
    assert.deepEqual(
      inspect(
        language,
        '#include <STDIO.H>\n#include <String>\n#include <CString>',
      ),
      [issue(1, 'STDIO.H', 'stdio.h')],
      language,
    );
  }
  for (const language of [
    'cpp',
    'cpp17',
    'cpp20',
    'c++23',
    'cxx17',
    'gnu++17',
    'g++20',
    ' CPP17 ',
  ])
    assert.deepEqual(
      inspect(language, '#include <String>'),
      [issue(1, 'String', 'string')],
      language,
    );
});

test('unrelated language identifiers do not scan source text', () => {
  for (const language of [
    'java8',
    'python311',
    'csharp',
    'c#',
    'objective-c',
    'c99fake',
    'cpp17fake',
    '',
  ])
    assert.deepEqual(inspect(language, '#include <String>'), [], language);
});

test('correct spellings, custom paths, quoted includes and macros are untouched', () => {
  const source = [
    '#include <string>',
    '#include <stdio.h>',
    '#include <string_view>',
    '#include <bits/StdC++.h>',
    '#include <sys/Types.h>',
    '#include <Windows.h>',
    '#include <MyLibrary>',
    '#include <folder/String>',
    '#include <String.hpp>',
    '#include "String"',
    '#include "STDIO.H"',
    '#include HEADER',
    '#include_next <String>',
    '#Include <String>',
    '#include < String >',
  ].join('\n');
  assert.deepEqual(inspect('cpp17', source), []);
});

test('custom header-name tokens do not act as character/string literals or comments', () => {
  const source = [
    '#include <It\'s/My"Header.hpp>',
    '#include "Windows\\"',
    '#include <My//Header.h>',
    '#include <My/*Header.h>',
    '#include <' + 'S'.repeat(100) + '\'">',
    '#include <String>',
  ].join('\n');
  assert.deepEqual(inspect('cpp17', source), [issue(6, 'String', 'string')]);
});

test('whitespace and comments between preprocessing tokens remain valid', () => {
  const source =
    '\uFEFF /* before */ # /* a */ include /* b */ <String>\r\n\t#\tinclude<Vector>\r\n# /*\n*/ include /*\n*/ <STDIO.H>';
  assert.deepEqual(inspect('cpp17', source), [
    issue(1, 'String', 'string'),
    issue(2, 'Vector', 'vector'),
    issue(3, 'STDIO.H', 'stdio.h'),
  ]);
});

test('spliced directive names and headers preserve the physical hash line', () => {
  const source =
    '#inc\\\nlude <Str\\\ning>\n\n\\\r\n #\\\r\n include <Vec\\\r\ntor>\r\n#include <MAP>';
  assert.deepEqual(inspect('cpp17', source), [
    issue(1, 'String', 'string'),
    issue(6, 'Vector', 'vector'),
    issue(9, 'MAP', 'map'),
  ]);
});

test('only a hash at the beginning of a logical preprocessing line counts', () => {
  const source = [
    'int n; #include <String>',
    '#define BAD \\',
    '#include <Vector>',
    'int m; /* physical',
    'newline */ #include <Map>',
    '#define MORE /* physical',
    'newline */ #include <Set>',
    '#include <Deque>',
  ].join('\n');
  assert.deepEqual(inspect('cpp17', source), [issue(8, 'Deque', 'deque')]);
});

test('line and block comments cannot supply an include, including spliced comments', () => {
  const source = [
    '// #include <String>',
    '/*',
    '#include <Vector>',
    '*/',
    '/\\',
    '/ #include <Map> \\',
    '#include <Set>',
    '/\\',
    '* #include <Queue> *\\',
    '/',
    '#include <List>',
  ].join('\n');
  assert.deepEqual(inspect('cpp17', source), [issue(11, 'List', 'list')]);
});

test('normal strings, escaped quotes and character literals cannot supply includes', () => {
  const source = [
    'const char* a = "\\\" #include <String>";',
    'const char* b = "first\\',
    '#include <Vector>";',
    "char c = '\\'';",
    'const wchar_t* d = L"',
    '#include <Map>',
    '";',
    '#include <Set>',
  ].join('\n');
  assert.deepEqual(inspect('cpp17', source), [issue(8, 'Set', 'set')]);
});

test('raw literals with every standard prefix and custom delimiters hide fake includes', () => {
  const lines = [];
  for (const prefix of ['R', 'u8R', 'uR', 'UR', 'LR']) {
    lines.push(
      `auto x = ${prefix}"tag(`,
      '#include <String>',
      ')wrong"',
      ')tag";',
    );
  }
  lines.push('#include <Vector>');
  assert.deepEqual(inspect('cpp20', lines.join('\n')), [
    issue(21, 'Vector', 'vector'),
  ]);
});

test('raw-string content does not form a false terminator through line splicing', () => {
  const source =
    'auto x = R"tag(body)ta\\\ng"\n#include <String>\n)tag";\n#include <Vector>';
  assert.deepEqual(inspect('cpp17', source), [issue(5, 'Vector', 'vector')]);
});

test('raw delimiters may be empty or 16 characters and unterminated literals stay ignored', () => {
  const source =
    'auto a = R"(\n#include <String>\n)";\nauto b = R"abcdefghijklmnop(\n#include <Map>\n)abcdefghijklmnop";\n#include <Vector>\nauto c = R"x(\n#include <Set>';
  assert.deepEqual(inspect('cpp17', source), [issue(7, 'Vector', 'vector')]);
});

test('numeric separators do not hide subsequent real includes', () => {
  const source =
    "auto a = 1'000;\nauto b = 0xF'FF;\nauto c = .5;\n#include <String>";
  assert.deepEqual(inspect('cpp17', source), [issue(4, 'String', 'string')]);
});

test('arithmetic before a raw string does not turn it into a normal string', () => {
  const source =
    'auto x = 1+R"tag( " inner quote\n#include <String>\n)tag";\n#include <Vector>';
  assert.deepEqual(inspect('cpp17', source), [issue(4, 'Vector', 'vector')]);
});

test('standard C headers and modern standard C++ headers are recognized', () => {
  for (const header of [
    'assert.h',
    'inttypes.h',
    'stdatomic.h',
    'stdbit.h',
    'stdckdint.h',
    'wchar.h',
  ])
    assert.deepEqual(inspect('c23', `#include <${header.toUpperCase()}>`), [
      issue(1, header.toUpperCase(), header),
    ]);
  for (const header of [
    'source_location',
    'condition_variable',
    'string_view',
    'unordered_map',
    'span',
    'expected',
    'mdspan',
    'print',
    'flat_map',
  ])
    assert.deepEqual(inspect('cpp23', `#include <${header.toUpperCase()}>`), [
      issue(1, header.toUpperCase(), header),
    ]);
});

test('conditional branches are reported conservatively without pretending to preprocess', () => {
  assert.deepEqual(inspect('cpp17', '#if 0\n#include <String>\n#endif'), [
    issue(2, 'String', 'string'),
  ]);
});

test(
  'large adversarial comments, literals and custom headers finish within a bounded scan',
  { timeout: 5000 },
  () => {
    const source =
      '/*' +
      '*/'.repeat(100000) +
      '\nauto s = R"x(' +
      '#include <String>\n'.repeat(50000) +
      ')x";\n#include <' +
      'S'.repeat(250000) +
      '>\n#include <Vector>';
    const started = performance.now();
    assert.deepEqual(inspect('cpp17', source), [
      issue(50004, 'Vector', 'vector'),
    ]);
    assert.ok(performance.now() - started < 3000);
  },
);
