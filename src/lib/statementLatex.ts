/** Polygon-style statement TeX, mixed with Markdown. Never executes TeX. */
const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );
// Keep Markdown from consuming TeX escapes or interpreting math as markup.
const escapeMath = (value: string) =>
  value.replace(/[^\p{L}\p{N}\t ]/gu, (c) => `&#${c.codePointAt(0)};`);
const unescapeText = (value: string) =>
  value.replace(/\\([%&#_${}])/g, '$1').replace(/\\textbackslash\{\}/g, '\\');

const htmlElements = new Set(
  'a b blockquote br code dd del details div dl dt em h1 h2 h3 h4 h5 h6 hr i img input li ol p pre s small span strong sub summary sup table tbody td th thead tr u ul script style iframe object embed form link meta'.split(
    ' ',
  ),
);

type Argument = { value: string; end: number };
function argument(
  source: string,
  start: number,
  open = '{',
  close = '}',
): Argument | null {
  let index = start;
  while (/\s/.test(source[index] || '') && index < source.length) index++;
  if (source[index] !== open) return null;
  const begin = ++index;
  let depth = 1;
  for (; index < source.length; index++) {
    if (source[index] === '\\') {
      index++;
      continue;
    }
    if (source[index] === open) depth++;
    if (source[index] === close) {
      depth--;
      if (depth === 0)
        return { value: source.slice(begin, index), end: index + 1 };
    }
  }
  return null;
}

const styles: Record<string, string> = {
  textbf: 'strong',
  bf: 'strong',
  bfseries: 'strong',
  textit: 'em',
  it: 'em',
  itshape: 'em',
  emph: 'em',
  underline: 'u',
  sout: 'del',
  textsc: 'span class="zoj-tex-smallcaps"',
  sc: 'span class="zoj-tex-smallcaps"',
  textrm: 'span class="zoj-tex-roman"',
  rm: 'span class="zoj-tex-roman"',
  textsf: 'span class="zoj-tex-sans"',
  sf: 'span class="zoj-tex-sans"',
  textnormal: 'span',
  text: 'span',
  textsuperscript: 'sup',
  textsubscript: 'sub',
};
for (const name of [
  'tiny',
  'scriptsize',
  'footnotesize',
  'small',
  'normalsize',
  'large',
  'Large',
  'LARGE',
  'huge',
  'Huge',
])
  styles[name] = `span class="zoj-tex-size-${name}"`;
const declarations = new Set([
  'bf',
  'bfseries',
  'it',
  'itshape',
  'rm',
  'sf',
  'sc',
  'tiny',
  'scriptsize',
  'footnotesize',
  'small',
  'normalsize',
  'large',
  'Large',
  'LARGE',
  'huge',
  'Huge',
]);
const wrap = (tag: string, body: string) =>
  `<${tag}>${body}</${tag.split(' ')[0]}>`;
const block = (tag: string, body: string) =>
  `\n\n<${tag}>\n\n${body.trim()}\n\n</${tag.split(' ')[0]}>\n\n`;

/** HTML is deliberately sanitized by the shared rendering pipeline afterwards. */
export function statementToMarkdown(value: string): string {
  const original = value.replace(/\r\n?/g, '\n');
  let prefix = '\uE000ZOJTEX';
  while (original.includes(prefix)) prefix += 'X';
  const protectedParts: string[] = [];
  const keep = (html: string) =>
    `${prefix}${protectedParts.push(html) - 1}\uE001`;
  const code = (text: string, language = '') =>
    language
      ? `<pre><code class="language-${escapeHtml(language)}">${escapeHtml(text)}</code></pre>`
      : `<code>${escapeHtml(text)}</code>`;
  const math = (text: string, display: boolean) =>
    keep(
      `<code class="language-math math-${display ? 'display' : 'inline'}">${escapeMath(text)}</code>`,
    );
  const findEnd = (
    source: string,
    token: string,
    from: number,
    multiline = true,
  ) => {
    for (let i = from; i < source.length; i++) {
      if (!multiline && source[i] === '\n') return -1;
      if (source.startsWith(token, i)) return i;
      if (source[i] === '\\') i++;
    }
    return -1;
  };

  // Protect whole math/code spans instead of splitting formatting arguments.
  function protect(source: string): string {
    let output = '';
    for (let i = 0; i < source.length;) {
      const tail = source.slice(i);
      if (source.startsWith('](', i)) {
        const destination = argument(source, i + 1, '(', ')');
        if (destination) {
          output += `](${keep(destination.value)})`;
          i = destination.end;
          continue;
        }
      }
      if (i === 0 || source[i - 1] === '\n') {
        const fence = /^( {0,3})(`{3,}|~{3,})([^\n]*)\n/.exec(tail);
        if (fence) {
          const endPattern = new RegExp(
            `^ {0,3}${fence[2][0]}{${fence[2].length},}[^\\S\\n]*$`,
            'm',
          );
          const after = i + fence[0].length;
          const end = endPattern.exec(source.slice(after));
          const contentEnd = end ? after + end.index : source.length;
          const language = /^[\w+-]+/.exec(fence[3].trim())?.[0] || 'text';
          output += keep(
            code(source.slice(after, contentEnd).replace(/\n$/, ''), language),
          );
          i = end ? contentEnd + end[0].length : source.length;
          continue;
        }
      }
      const literalEnv =
        /^\\begin\s*\{(verbatim\*?|lstlisting|minted)\}(?:\[[^\]\n]*\])?/.exec(
          tail,
        );
      if (literalEnv) {
        let after = i + literalEnv[0].length;
        let language = 'text';
        if (literalEnv[1] === 'minted') {
          const lang = argument(source, after);
          if (lang) {
            language = /^\w+$/.test(lang.value) ? lang.value : 'text';
            after = lang.end;
          }
        }
        const closing = new RegExp(
          `\\\\end\\s*\\{${literalEnv[1].replace('*', '\\*')}\\}`,
        ).exec(source.slice(after));
        const end = closing ? after + closing.index : source.length;
        output += keep(
          code(source.slice(after, end).replace(/^\n|\n$/g, ''), language),
        );
        i = closing ? end + closing[0].length : source.length;
        continue;
      }
      const verb = /^\\verb\*?([^\w\s])/.exec(tail);
      if (verb) {
        const end = source.indexOf(verb[1], i + verb[0].length);
        if (end !== -1) {
          output += keep(code(source.slice(i + verb[0].length, end)));
          i = end + 1;
          continue;
        }
      }
      const mono = /^\\(?:texttt|tt|t)\s*(?=\{)/.exec(tail);
      const monoGroup = /^\{\s*\\(?:tt|ttfamily)\b\s*/.exec(tail);
      if (mono || monoGroup) {
        const group = argument(source, mono ? i + mono[0].length : i);
        if (group) {
          const content = monoGroup
            ? group.value.replace(/^\s*\\(?:tt|ttfamily)\b\s*/, '')
            : group.value;
          output += keep(code(unescapeText(content)));
          i = group.end;
          continue;
        }
        return output + source.slice(i);
      }
      if (source[i] === '`') {
        const ticks = /^`+/.exec(tail)![0];
        const quote = ticks.length === 2 ? source.indexOf("''", i + 2) : -1;
        const closing = source.indexOf(ticks, i + ticks.length);
        if (quote !== -1 && (closing === -1 || quote < closing)) {
          output += '“';
          i += 2;
          continue;
        }
        let end = i + ticks.length;
        while (end < source.length) {
          const next = source.indexOf('`', end);
          if (next === -1) {
            end = -1;
            break;
          }
          const run = /^`+/.exec(source.slice(next))![0];
          if (run.length === ticks.length) {
            end = next;
            break;
          }
          end = next + run.length;
        }
        if (end >= i + ticks.length && end < source.length) {
          let content = source.slice(i + ticks.length, end).replace(/\n/g, ' ');
          if (/^ .* $/.test(content) && content.trim())
            content = content.slice(1, -1);
          output += keep(code(content));
          i = end + ticks.length;
          continue;
        }
      }
      if (source.startsWith('<<', i) || source.startsWith('>>', i)) {
        output += source[i] === '<' ? '«' : '»';
        i += 2;
        continue;
      }
      if (source[i] === '<') {
        const literal = /^<(pre|code)\b[^>]*>[\s\S]*?<\/\1\s*>/i.exec(tail);
        const tag =
          literal || /^(?:<!--[\s\S]*?-->|<\/?[A-Za-z][^>]*>)/.exec(tail);
        if (tag) {
          const name = /^<\/?([a-z][\w-]*)/i.exec(tag[0])?.[1].toLowerCase();
          const autolink = /^<(?:https?:\/\/|mailto:|[^<>\s@]+@)[^>]+>$/i.test(
            tag[0],
          );
          // Preserve literal type names such as vector<int> rather than
          // treating them as unknown HTML elements and losing their text.
          output += keep(
            name && !htmlElements.has(name) && !autolink
              ? escapeHtml(tag[0])
              : tag[0],
          );
          i += tag[0].length;
          continue;
        }
      }
      const delimiter = source.startsWith('\\[', i)
        ? (['\\[', '\\]', true] as const)
        : source.startsWith('\\(', i)
          ? (['\\(', '\\)', false] as const)
          : source.startsWith('$$', i)
            ? (['$$', '$$', true] as const)
            : source[i] === '$'
              ? (['$', '$', false] as const)
              : null;
      if (delimiter) {
        const end = findEnd(
          source,
          delimiter[1],
          i + delimiter[0].length,
          delimiter[2],
        );
        if (end !== -1) {
          output += math(
            source.slice(i + delimiter[0].length, end),
            delimiter[2],
          );
          i = end + delimiter[1].length;
          continue;
        }
      }
      const mathEnv =
        /^\\begin\s*\{(equation\*?|align\*?|aligned|gather\*?|gathered|multline\*?|displaymath|math)\}/.exec(
          tail,
        );
      if (mathEnv) {
        const ending = new RegExp(
          `\\\\end\\s*\\{${mathEnv[1].replace('*', '\\*')}\\}`,
        ).exec(source.slice(i + mathEnv[0].length));
        if (ending) {
          const end = i + mathEnv[0].length + ending.index;
          const bare = ['displaymath', 'math'].includes(mathEnv[1]);
          output += math(
            bare
              ? source.slice(i + mathEnv[0].length, end)
              : source.slice(i, end + ending[0].length),
            mathEnv[1] !== 'math',
          );
          i = end + ending[0].length;
          continue;
        }
      }
      // An escaped dollar/backtick must not open another protected span.
      if (source[i] === '\\' && /[%&#_${}\\`]/.test(source[i + 1] || '')) {
        output += source.slice(i, i + 2);
        i += 2;
        continue;
      }
      output += source[i++];
    }
    return output;
  }

  const source = protect(original);
  let pixelsInCm = 37.8;
  function environment(text: string, from: number, name: string) {
    const pattern = /\\(begin|end)\s*\{([^{}]+)\}/g;
    pattern.lastIndex = from;
    let depth = 1;
    for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
      if (match[2] !== name) continue;
      depth += match[1] === 'begin' ? 1 : -1;
      if (!depth)
        return { value: text.slice(from, match.index), end: pattern.lastIndex };
    }
    return null;
  }
  const dimension = (value: string) => {
    const fraction = /^([\d.]+)\\(?:textwidth|linewidth|columnwidth)$/.exec(
      value.trim(),
    );
    if (fraction)
      return `${Math.min(100, Math.max(1, Number(fraction[1]) * 100))}%`;
    const unit = /^([\d.]+)\s*(cm|mm|pt|px)$/.exec(value.trim());
    if (!unit || !Number.isFinite(Number(unit[1]))) return '';
    const factor =
      unit[2] === 'cm'
        ? pixelsInCm
        : unit[2] === 'mm'
          ? pixelsInCm / 10
          : unit[2] === 'pt'
            ? 4 / 3
            : 1;
    return `${Math.min(4096, Math.max(1, Number(unit[1]) * factor))}px`;
  };
  function list(text: string, name: string, depth: number) {
    const items: { label: string; value: string }[] = [];
    let nesting = 0,
      braces = 0,
      start = -1,
      label = '';
    for (let i = 0; i < text.length;) {
      const env = /^\\(begin|end)\s*\{[^{}]+\}/.exec(text.slice(i));
      if (env) {
        nesting += env[1] === 'begin' ? 1 : -1;
        i += env[0].length;
        continue;
      }
      const item =
        !nesting && !braces ? /^\\item\b\s*/.exec(text.slice(i)) : null;
      if (item) {
        if (start !== -1) items.push({ label, value: text.slice(start, i) });
        const option = argument(text, i + item[0].length, '[', ']');
        label = option?.value || '';
        start = option?.end ?? i + item[0].length;
        i = start;
        continue;
      }
      if (text[i] === '\\') {
        i += 2;
        continue;
      }
      if (text[i] === '{') braces++;
      if (text[i] === '}') braces--;
      i++;
    }
    if (start !== -1) items.push({ label, value: text.slice(start) });
    if (!items.length) return render(text, depth + 1);
    if (name === 'description')
      return block(
        'dl',
        items
          .map(
            (item) =>
              `<dt>${render(item.label, depth + 1)}</dt>${block('dd', render(item.value, depth + 1))}`,
          )
          .join('\n'),
      );
    return block(
      name === 'enumerate' ? 'ol' : 'ul',
      items
        .map((item) =>
          block(
            'li',
            `${item.label ? `<strong>${render(item.label, depth + 1)}</strong> ` : ''}${render(item.value, depth + 1)}`,
          ),
        )
        .join('\n'),
    );
  }
  function table(text: string, name: string, depth: number) {
    let pos = argument(text, 0, '[', ']')?.end || 0;
    if (name !== 'tabular') pos = argument(text, pos)?.end || pos;
    const spec = argument(text, pos);
    if (!spec) return render(text, depth + 1);
    let specification = spec.value.replace(
      /\*\{(\d+)\}\{([^{}]*)\}/g,
      (_, n: string, value: string) => value.repeat(Math.min(100, Number(n))),
    );
    specification = specification.replace(/[@!><]\{[^{}]*\}/g, '');
    const columns = Array.from(
      specification.matchAll(/([lcrX])|[pmb]\{[^{}]*\}/g),
      (m) => (m[1] === 'c' ? 'center' : m[1] === 'r' ? 'right' : 'left'),
    ).slice(0, 100);
    const rows: string[][] = [];
    let row: string[] = [],
      cell = '',
      braces = 0;
    const body = text.slice(spec.end);
    for (let i = 0; i < body.length;) {
      const tail = body.slice(i);
      const rule = !braces
        ? /^(?:\\(?:hline|toprule|midrule|bottomrule)\b|\\cline\s*\{[^{}]*\})/.exec(
            tail,
          )
        : null;
      if (rule) {
        i += rule[0].length;
        continue;
      }
      const end = !braces
        ? /^(?:\\\\|\\tabularnewline\b)(?:\s*\[[^\]]*\])?/.exec(tail)
        : null;
      if (end) {
        row.push(cell.trim());
        if (row.some(Boolean)) rows.push(row);
        row = [];
        cell = '';
        i += end[0].length;
        continue;
      }
      if (!braces && body[i] === '&') {
        row.push(cell.trim());
        cell = '';
        i++;
        continue;
      }
      if (body[i] === '\\') {
        cell += body.slice(i, i + 2);
        i += 2;
        continue;
      }
      if (body[i] === '{') braces++;
      if (body[i] === '}') braces--;
      cell += body[i++];
    }
    row.push(cell.trim());
    if (row.some(Boolean)) rows.push(row);
    let occupied: number[] = [];
    const html = rows
      .slice(0, 1000)
      .map((cells) => {
        const next = occupied.map((n) => Math.max(0, n - 1));
        let column = 0;
        const result: string[] = [];
        for (let content of cells.slice(0, 100)) {
          let colspan = 1,
            rowspan = 1,
            align = columns[column] || 'left';
          for (let n = 0; n < 3; n++) {
            const span = /^\\(multicolumn|multirow)\s*/.exec(content);
            if (!span) break;
            const count = argument(content, span[0].length);
            const format = count && argument(content, count.end);
            const inner = format && argument(content, format.end);
            if (!count || !format || !inner || content.slice(inner.end).trim())
              break;
            const size = Math.min(
              100,
              Math.max(1, Number.parseInt(count.value) || 1),
            );
            if (span[1] === 'multicolumn') {
              colspan = size;
              align = format.value.includes('c')
                ? 'center'
                : format.value.includes('r')
                  ? 'right'
                  : 'left';
            } else rowspan = size;
            content = inner.value.trim();
          }
          if (!content && occupied[column]) {
            column += colspan;
            continue;
          }
          while (occupied[column]) column++;
          if (column >= 100) break;
          align = colspan === 1 ? columns[column] || align : align;
          result.push(
            `<td align="${align}"${colspan > 1 ? ` colspan="${colspan}"` : ''}${rowspan > 1 ? ` rowspan="${rowspan}"` : ''}>\n\n${render(content, depth + 1)}\n\n</td>`,
          );
          for (let c = column; c < column + colspan; c++)
            next[c] = Math.max(next[c] || 0, rowspan - 1);
          column += colspan;
        }
        occupied = next;
        return `<tr>${result.join('')}</tr>`;
      })
      .join('\n');
    const ruled =
      specification.includes('|') ||
      /\\(?:hline|cline|toprule|midrule|bottomrule)\b/.test(text);
    return `\n\n<div class="zoj-tex-table${ruled ? ' zoj-tex-table-ruled' : ''}"><table><tbody>${html}</tbody></table></div>\n\n`;
  }
  function render(text: string, depth = 0): string {
    if (depth > 32) return text;
    let output = '';
    for (let i = 0; i < text.length;) {
      if ((i === 0 || text[i - 1] === '\n') && /^[ \t]*%/.test(text.slice(i))) {
        const end = text.indexOf('\n', i);
        i = end === -1 ? text.length : end;
        if (end !== -1) output += text[i++];
        continue;
      }
      if (
        text[i] === '{' &&
        /^\{\s*\\(?:bf|bfseries|it|itshape|rm|sf|sc|tiny|scriptsize|footnotesize|small|normalsize|large|Large|LARGE|huge|Huge)\b/.test(
          text.slice(i),
        )
      ) {
        const group = argument(text, i);
        if (group) {
          output += render(group.value, depth + 1);
          i = group.end;
          continue;
        }
        return output + text.slice(i);
      }
      if (text.startsWith("''", i)) {
        output += '”';
        i += 2;
        continue;
      }
      if (text.startsWith('~---', i) || text.startsWith('"---', i)) {
        output += '&nbsp;—';
        i += 4;
        continue;
      }
      if (text.startsWith('~~', i)) {
        const run = /^~+/.exec(text.slice(i))![0];
        output += run;
        i += run.length;
        continue;
      }
      if (text[i] === '~') {
        output += '&nbsp;';
        i++;
        continue;
      }
      if (text[i] !== '\\') {
        output += text[i++];
        continue;
      }
      const escaped = text[i + 1];
      if ('%&#_${}'.includes(escaped || '\u0000')) {
        output += `&#${escaped.charCodeAt(0)};`;
        i += 2;
        continue;
      }
      if (escaped === '\\') {
        const space = argument(text, i + 2, '[', ']');
        output += '<br />';
        i = space?.end ?? i + 2;
        continue;
      }
      if (escaped === ' ') {
        output += '&nbsp;';
        i += 2;
        continue;
      }
      if (escaped === ',' || escaped === ';' || escaped === ':') {
        output += '&#8201;';
        i += 2;
        continue;
      }
      const match = /^\\([A-Za-z]+)(\*)?/.exec(text.slice(i));
      if (!match) {
        output += text[i++];
        continue;
      }
      const command = match[1];
      const after = i + match[0].length;
      const expectsArgument =
        styles[command] ||
        [
          'begin',
          'section',
          'subsection',
          'subsubsection',
          'paragraph',
          'subparagraph',
          'url',
          'href',
          'epigraph',
          'caption',
          'vspace',
          'hspace',
        ].includes(command);
      const arg = expectsArgument ? argument(text, after) : null;
      if (expectsArgument && /^\s*\{/.test(text.slice(after)) && !arg)
        return output + text.slice(i);
      if (command === 'def') {
        const pixels = /^\s*\\htmlPixelsInCm\s*\{([\d.]+)\}/.exec(
          text.slice(after),
        );
        if (pixels) {
          pixelsInCm = Math.min(200, Math.max(1, Number(pixels[1]) || 37.8));
          i = after + pixels[0].length;
          continue;
        }
      }
      if (command === 'begin' && arg) {
        const env = environment(text, arg.end, arg.value);
        if (env) {
          if (['itemize', 'enumerate', 'description'].includes(arg.value))
            output += list(env.value, arg.value, depth);
          else if (['tabular', 'tabular*', 'tabularx'].includes(arg.value))
            output += table(env.value, arg.value, depth);
          else if (['center', 'flushleft', 'flushright'].includes(arg.value))
            output += block(
              `div class="zoj-tex-${arg.value}"`,
              render(env.value, depth + 1),
            );
          else if (['quote', 'quotation'].includes(arg.value))
            output += block('blockquote', render(env.value, depth + 1));
          else if (['figure', 'table'].includes(arg.value))
            output += render(
              env.value.replace(/^\s*\[[^\]]*\]/, ''),
              depth + 1,
            );
          else {
            output += text.slice(i, env.end);
            i = env.end;
            continue;
          }
          i = env.end;
          continue;
        }
      }
      if (styles[command]) {
        if (arg) {
          output += wrap(styles[command], render(arg.value, depth + 1));
          i = arg.end;
          continue;
        }
        if (declarations.has(command)) {
          output += wrap(
            styles[command],
            render(text.slice(after).replace(/^\s+/, ''), depth + 1),
          );
          return output;
        }
      }
      if (
        [
          'section',
          'subsection',
          'subsubsection',
          'paragraph',
          'subparagraph',
        ].includes(command) &&
        arg
      ) {
        output += block(
          command === 'section' ? 'h3' : command === 'subsection' ? 'h4' : 'h5',
          render(arg.value, depth + 1),
        );
        i = arg.end;
        continue;
      }
      if (command === 'url' && arg) {
        const url = unescapeText(arg.value);
        output += `<a href="${escapeHtml(url)}">${escapeHtml(url)}</a>`;
        i = arg.end;
        continue;
      }
      if (command === 'href' && arg) {
        const label = argument(text, arg.end);
        if (label) {
          output += `<a href="${escapeHtml(unescapeText(arg.value))}">${render(label.value, depth + 1)}</a>`;
          i = label.end;
          continue;
        }
      }
      if (command === 'includegraphics') {
        const options = argument(text, after, '[', ']');
        const path = argument(text, options?.end ?? after);
        if (path) {
          const opts = Object.fromEntries(
            (options?.value || '')
              .split(',')
              .map((entry) => entry.trim().split(/\s*=\s*/, 2)),
          );
          const width = dimension(opts.width || '');
          const height = dimension(opts.height || '');
          const scale = Number(opts.scale);
          output += `<img src="${escapeHtml(unescapeText(path.value))}" alt="${escapeHtml(unescapeText(path.value))}"${width ? ` data-tex-width="${width}"` : ''}${height ? ` data-tex-height="${height}"` : ''}${Number.isFinite(scale) && scale > 0 ? ` data-tex-scale="${Math.min(4, Math.max(0.1, scale))}"` : ''} />`;
          i = path.end;
          continue;
        }
      }
      if (command === 'epigraph' && arg) {
        const author = argument(text, arg.end);
        if (author) {
          output += block(
            'blockquote',
            `${render(arg.value, depth + 1)}\n\n<cite>${render(author.value, depth + 1)}</cite>`,
          );
          i = author.end;
          continue;
        }
      }
      if (command === 'caption' && arg) {
        output += block(
          'div class="zoj-tex-caption"',
          render(arg.value, depth + 1),
        );
        i = arg.end;
        continue;
      }
      if (
        ['par', 'smallskip', 'medskip', 'bigskip', 'vspace'].includes(command)
      ) {
        output += '\n\n';
        i = arg?.end ?? after;
        continue;
      }
      if (['newline', 'linebreak'].includes(command)) {
        output += '<br />';
        i = argument(text, after, '[', ']')?.end ?? after;
        continue;
      }
      if (['noindent', 'hfill'].includes(command)) {
        i = after;
        continue;
      }
      if (['quad', 'qquad', 'hspace'].includes(command)) {
        output += '&emsp;';
        i = arg?.end ?? after;
        continue;
      }
      if (command === 'centering') {
        output += block(
          'div class="zoj-tex-center"',
          render(text.slice(after), depth + 1),
        );
        return output;
      }
      if (command === 'item') {
        const label = argument(text, after, '[', ']');
        output += `\n- ${label ? render(label.value, depth + 1) + ' ' : ''}`;
        i = label?.end ?? after;
        continue;
      }
      const symbols: Record<string, string> = {
        ldots: '…',
        dots: '…',
        textellipsis: '…',
        textbackslash: '&#92;',
        textasciitilde: '~',
        textasciicircum: '^',
        LaTeX: 'LaTeX',
        TeX: 'TeX',
        textendash: '–',
        textemdash: '—',
      };
      if (symbols[command]) {
        output += symbols[command];
        i = arg?.value === '' ? arg.end : after;
        continue;
      }
      // Unknown commands remain visible instead of silently losing content.
      output += match[0];
      i = after;
    }
    return output;
  }
  const rendered = render(source);
  const pattern = new RegExp(`${prefix}(\\d+)\uE001`, 'g');
  return rendered.replace(
    pattern,
    (_, index: string) => protectedParts[Number(index)] || '',
  );
}
