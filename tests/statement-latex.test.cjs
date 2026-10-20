const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const editor = fs.existsSync(path.resolve(__dirname, '../src/lib/latex.ts'));
const loaded = new Map();
const ready = Promise.all(
  [
    'react-markdown',
    'rehype-raw',
    'rehype-sanitize',
    'rehype-katex',
    'remark-math',
    'remark-gfm',
  ].map(async (name) => [name, await import(name)]),
).then((values) => new Map(values));
function source(file, imports) {
  if (loaded.has(file)) return loaded.get(file).exports;
  const mod = new Module(file, module);
  mod.filename = file;
  mod.paths = Module._nodeModulePaths(path.dirname(file));
  const native = mod.require.bind(mod);
  mod.require = (name) => {
    if (name.endsWith('.css')) return {};
    if (imports.has(name)) return { __esModule: true, ...imports.get(name) };
    if (name.startsWith('.') || name.startsWith('@/')) {
      const base = name.startsWith('@/')
        ? path.resolve(__dirname, '../src', name.slice(2))
        : path.resolve(path.dirname(file), name);
      const found = ['.ts', '.tsx', '']
        .map((ext) => base + ext)
        .find((item) => fs.existsSync(item));
      return source(found, imports);
    }
    return native(name);
  };
  loaded.set(file, mod);
  mod._compile(
    ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    }).outputText,
    file,
  );
  return mod.exports;
}
async function render(value, withAsset = false) {
  const imports = await ready;
  const file = path.resolve(
    __dirname,
    editor
      ? '../src/components/Markdown.tsx'
      : '../src/shared/ui/MarkdownPreview.tsx',
  );
  const Component = source(file, imports).default;
  const url = 'https://example.test/authorized/diagram.png';
  const assets = editor
    ? { 'diagram.png': url, 'asset://image-id': url }
    : [
        {
          asset_id: 'image-id',
          original_filename: 'diagram.png',
          storage_key: 'contests/test/diagram.png',
          download_url: url,
        },
      ];
  const props = editor
    ? { children: value, assets: withAsset ? assets : {} }
    : { statement: value, assets: withAsset ? assets : [] };
  return new JSDOM(renderToStaticMarkup(React.createElement(Component, props)))
    .window.document;
}

test('user zombie statement renders bold text spanning inline code', async () => {
  const doc = await render(
    '점검 구간 `[L,R]`의 \\textbf{평균 좀비 수가 기준치 `K` 이상}이면 `DANGER`, \\textbf{평균 좀비 수가 `K` 미만}이면 `SAFE`입니다.',
  );
  assert.equal(doc.querySelectorAll('strong').length, 2);
  assert.equal(doc.querySelector('strong code').textContent, 'K');
  assert.ok(!doc.body.textContent.includes('textbf'));
});
test('nested prose formatting can contain protected KaTeX expressions', async () => {
  const doc = await render(
    String.raw`\textbf{굵게 \textit{기울임 $K\ge 10$}와 \underline{밑줄}} \sout{취소} \textsc{Hello}`,
  );
  assert.ok(doc.querySelector('strong em .katex'));
  assert.equal(doc.querySelector('strong u').textContent, '밑줄');
  assert.equal(doc.querySelector('del').textContent, '취소');
  assert.ok(doc.querySelector('.zoj-tex-smallcaps'));
  assert.equal(doc.querySelectorAll('.katex-error').length, 0);
});
test('math commands and all common math delimiters keep their semantics', async () => {
  const doc =
    await render(String.raw`$\textbf{x}+\frac{1}{2}$ and \(A_i\le N\) and \[\begin{cases}x&x>0\\-x&x\le0\end{cases}\]
\begin{align*}a&=b+c\\d&=e\end{align*}`);
  assert.equal(doc.querySelectorAll('.katex').length, 4);
  assert.equal(doc.querySelectorAll('.katex-error').length, 0);
  assert.equal(doc.querySelectorAll('.katex-display').length, 2);
});
test('math spacing and escaped punctuation reach KaTeX unchanged', async () => {
  const expressions = [
    String.raw`100\,000`,
    String.raw`1\;000 + a\!b`,
    String.raw`\{x\}`,
    String.raw`\text{a*b*c [x](y) ~~z~~ a|b}`,
  ];
  for (const expression of expressions) {
    for (const input of [
      `$${expression}$`,
      `\\(${expression}\\)`,
      `$$\n${expression}\n$$`,
      `\\[${expression}\\]`,
    ]) {
      const doc = await render(input);
      assert.equal(doc.querySelectorAll('.katex-error').length, 0, input);
      assert.equal(
        doc
          .querySelector('annotation[encoding="application/x-tex"]')
          ?.textContent.trim(),
        expression,
        input,
      );
      if (expression === String.raw`100\,000`)
        assert.equal(doc.querySelector('.katex-html').textContent, '100000');
    }
  }
});
test('display math preserves matrix row separators and internal line breaks', async () => {
  const expression = String.raw`\begin{matrix}
a & b \\
c & d
\end{matrix}`;
  const doc = await render(`$$\n${expression}\n$$`);
  assert.equal(doc.querySelectorAll('.katex-error').length, 0);
  assert.equal(
    doc
      .querySelector('annotation[encoding="application/x-tex"]')
      ?.textContent.trim(),
    expression,
  );
  assert.equal(doc.querySelectorAll('.katex-display').length, 1);
});
test('math containing pipes remains in one Markdown table cell', async () => {
  const expression = String.raw`\lvert x\rvert + \text{a|b}`;
  const doc = await render(
    `| Math | Value |\n| --- | --- |\n| $${expression}$ | 1 |`,
  );
  const cells = doc.querySelectorAll('tbody td');
  assert.equal(cells.length, 2);
  assert.equal(
    cells[0].querySelector('annotation[encoding="application/x-tex"]')
      ?.textContent,
    expression,
  );
  assert.equal(cells[1].textContent, '1');
});
test('Markdown code fences, inline code and TeX verbatim are literal', async () => {
  const code = String.raw`\textbf{literal} $x$ <img src=x onerror=alert(1)>`;
  const doc = await render(
    '```cpp\n' +
      code +
      '\n```\n\n`' +
      code +
      '`\n\n' +
      String.raw`\verb|\textbf{x} $x$|` +
      '\n\n' +
      String.raw`\begin{lstlisting}\textbf{literal}\end{lstlisting}`,
  );
  assert.equal(doc.querySelector('pre code').textContent, code);
  assert.equal(doc.querySelectorAll('pre').length, 2);
  assert.equal(doc.querySelectorAll('img').length, 0);
  assert.equal(doc.querySelectorAll('.katex').length, 0);
  assert.equal(doc.querySelectorAll('strong').length, 0);
});
test('nested numbered and bullet lists preserve hierarchy and item labels', async () => {
  const doc =
    await render(String.raw`\begin{enumerate}\item 첫 번째 \textbf{항목}\begin{itemize}\item 하위 $x$\item 하위 둘\end{itemize}\item 두 번째\end{enumerate}
\begin{description}\item[정의] 설명\end{description}`);
  assert.equal(doc.querySelectorAll('ol > li').length, 2);
  assert.equal(
    doc.querySelectorAll('ol > li > ul > li, ol > li ul > li').length,
    2,
  );
  assert.equal(doc.querySelector('dt').textContent, '정의');
  assert.equal(doc.querySelector('dd').textContent.trim(), '설명');
});
test('tabular cells support math, alignment, escaped separators and merged cells', async () => {
  const doc =
    await render(String.raw`\begin{center}\begin{tabular}{|c|c|r|}\hline
\multirow{2}{*}{\textbf{Group}} & \multicolumn{2}{c}{Limits} \\ \cline{2-3}
 & $n\le10$ & $a_i$ \\ \hline
1 & A\&B & \texttt{a|b} \\
\end{tabular}\end{center}`);
  assert.equal(doc.querySelectorAll('tr').length, 3);
  assert.equal(doc.querySelector('[rowspan="2"]').textContent.trim(), 'Group');
  assert.equal(doc.querySelector('[colspan="2"]').textContent.trim(), 'Limits');
  assert.equal(doc.querySelectorAll('tr')[1].querySelectorAll('td').length, 2);
  assert.equal(doc.querySelectorAll('.katex').length, 2);
  assert.ok(doc.body.textContent.includes('A&B'));
  assert.equal(
    doc.querySelector('td code:not(.language-math)').textContent,
    'a|b',
  );
  assert.ok(doc.querySelector('.zoj-tex-center .zoj-tex-table'));
});
test('graphics resolve authorized attachments and safe width/scale options', async () => {
  const doc = await render(
    String.raw`\begin{center}\def \htmlPixelsInCm {40}\includegraphics[width=2cm,scale=0.5]{diagram.png}\end{center}
![linked](asset://image-id)`,
    true,
  );
  const images = doc.querySelectorAll('img');
  assert.equal(images.length, 2);
  assert.equal(images[0].src, 'https://example.test/authorized/diagram.png');
  assert.equal(images[1].src, images[0].src);
  assert.equal(images[0].style.width, '80px');
  assert.match(images[0].getAttribute('style'), /zoom:\s*0\.5/);
});
test('font declarations, escaped symbols, headings and epigraphs render', async () => {
  const doc =
    await render(String.raw`\section*{제목 $N$} {\bf 굵은 글자} \small{작게} \Large{크게} \texttt{a\_b} \textsuperscript{2} \textsubscript{i}
\epigraph{인용}{저자} \url{https://example.test/a\_b} \href{https://example.test}{링크} \par 50\% \& \# \$ \{x\}`);
  assert.ok(doc.querySelector('h3 .katex'));
  assert.ok(doc.querySelector('strong').textContent.includes('굵은'));
  assert.ok(doc.querySelector('.zoj-tex-size-Large'));
  assert.equal(doc.querySelector('sup').textContent, '2');
  assert.equal(doc.querySelector('sub').textContent, 'i');
  assert.equal(doc.querySelector('cite').textContent, '저자');
  assert.ok(doc.body.textContent.includes('50% & # $ {x}'));
  assert.equal(doc.querySelector('a').href, 'https://example.test/a_b');
});
test('raw HTML and TeX wrappers cannot introduce scripts, events or unsafe URLs', async () => {
  const doc =
    await render(String.raw`\textbf{<img src=x onerror="alert(1)"><script>alert(1)</script>텍스트}
\href{javascript:alert(1)}{bad} \includegraphics{data:text/html;base64,PHNjcmlwdD4=}
<iframe src="https://evil.test"></iframe><span style="position:fixed" onclick="alert(1)">safe</span>
$\href{javascript:alert(1)}{x}$`);
  assert.equal(
    doc.querySelectorAll(
      'script,iframe,object,embed,[onerror],[onclick],[style*="fixed"]',
    ).length,
    0,
  );
  for (const node of doc.querySelectorAll('[href],[src]'))
    assert.ok(
      !/^(javascript:|data:text)/i.test(
        node.getAttribute('href') || node.getAttribute('src'),
      ),
    );
  assert.ok(doc.body.textContent.includes('텍스트'));
});
test('plain Markdown, braces, long code fences and unknown TeX remain intact', async () => {
  const doc = await render(
    '# Markdown\n\n**bold** set {1, 2} [link](https://example.test)\n\n````\n```\n\\textbf{literal}\n````\n\n\\unknown{kept}\n\\textbf{unclosed',
  );
  assert.equal(doc.querySelector('h1').textContent, 'Markdown');
  assert.ok(doc.body.textContent.includes('set {1, 2}'));
  assert.ok(doc.body.textContent.includes('unknown{kept}'));
  assert.ok(doc.querySelector('pre').textContent.includes('\\textbf{literal}'));
});

test('Polygon quotation marks and Markdown within TeX table cells are preserved', async () => {
  const doc = await render(String.raw`<<안전>> ~--- \textbf{중요}
\begin{tabular}{lr}**Header** & \textit{Second} \\ $N$ & 10 \\ \end{tabular}`);
  assert.ok(doc.body.textContent.includes('«안전»'));
  assert.equal(doc.querySelector('td strong').textContent, 'Header');
  assert.equal(doc.querySelector('.zoj-tex-table-ruled'), null);
  assert.equal(doc.querySelectorAll('.katex').length, 1);
});
test('incomplete formatting does not repeatedly rescan the remaining document', async () => {
  const imports = await ready;
  const module = source(
    path.resolve(
      __dirname,
      editor
        ? '../src/lib/statementLatex.ts'
        : '../src/shared/lib/statementLatex.ts',
    ),
    imports,
  );
  const input = String.raw`\textbf{`.repeat(4000);
  assert.equal(module.statementToMarkdown(input), input);
});

test('Markdown strikethrough, task lists and literal URL characters still work', async () => {
  const doc = await render(
    '~~old~~\n\n- [x] done\n\n[label](https://example.test/a$one$?x=1)',
  );
  assert.equal(doc.querySelector('del').textContent, 'old');
  const input = doc.querySelector('input');
  assert.equal(input.type, 'checkbox');
  assert.equal(input.disabled, true);
  assert.equal(doc.querySelector('a').href, 'https://example.test/a$one$?x=1');
});

test('unrecognized angle-bracket text stays visible and Markdown autolinks still resolve', async () => {
  const doc = await render('vector<int> set<N> <https://example.test>');
  assert.ok(doc.body.textContent.includes('vector<int> set<N>'));
  assert.equal(doc.querySelector('a').href, 'https://example.test/');
});
