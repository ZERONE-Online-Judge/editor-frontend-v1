export type CHeaderCaseIssue = {
  line: number;
  header: string;
  suggestion: string;
};

// Only standard, bare header names are checked. In particular, spelling of
// project headers, implementation headers and paths must not be guessed.
const C_HEADERS = [
  'assert.h',
  'complex.h',
  'ctype.h',
  'errno.h',
  'fenv.h',
  'float.h',
  'inttypes.h',
  'iso646.h',
  'limits.h',
  'locale.h',
  'math.h',
  'setjmp.h',
  'signal.h',
  'stdalign.h',
  'stdarg.h',
  'stdatomic.h',
  'stdbit.h',
  'stdbool.h',
  'stdckdint.h',
  'stddef.h',
  'stdint.h',
  'stdio.h',
  'stdlib.h',
  'stdnoreturn.h',
  'string.h',
  'tgmath.h',
  'threads.h',
  'time.h',
  'uchar.h',
  'wchar.h',
  'wctype.h',
];

// C++ standard headers through C++23, including older deprecated headers
// which existing contest code may still use. Availability by compiler/version
// is deliberately left to the compiler; this check only explains letter case.
const CPP_HEADERS = [
  'algorithm',
  'any',
  'array',
  'atomic',
  'barrier',
  'bit',
  'bitset',
  'cassert',
  'ccomplex',
  'cctype',
  'cerrno',
  'cfenv',
  'cfloat',
  'charconv',
  'chrono',
  'cinttypes',
  'ciso646',
  'climits',
  'clocale',
  'cmath',
  'codecvt',
  'compare',
  'complex',
  'concepts',
  'condition_variable',
  'coroutine',
  'csetjmp',
  'csignal',
  'cstdalign',
  'cstdarg',
  'cstdbool',
  'cstddef',
  'cstdint',
  'cstdio',
  'cstdlib',
  'cstring',
  'cstdnoreturn',
  'ctgmath',
  'ctime',
  'cuchar',
  'cwchar',
  'cwctype',
  'deque',
  'exception',
  'execution',
  'expected',
  'filesystem',
  'flat_map',
  'flat_set',
  'format',
  'forward_list',
  'fstream',
  'functional',
  'future',
  'generator',
  'initializer_list',
  'iomanip',
  'ios',
  'iosfwd',
  'iostream',
  'istream',
  'iterator',
  'latch',
  'limits',
  'list',
  'locale',
  'map',
  'mdspan',
  'memory',
  'memory_resource',
  'mutex',
  'new',
  'numbers',
  'numeric',
  'optional',
  'ostream',
  'print',
  'queue',
  'random',
  'ranges',
  'ratio',
  'regex',
  'scoped_allocator',
  'semaphore',
  'set',
  'shared_mutex',
  'source_location',
  'span',
  'spanstream',
  'sstream',
  'stack',
  'stacktrace',
  'stdexcept',
  'stdfloat',
  'stop_token',
  'streambuf',
  'string',
  'string_view',
  'strstream',
  'syncstream',
  'system_error',
  'thread',
  'tuple',
  'type_traits',
  'typeindex',
  'typeinfo',
  'unordered_map',
  'unordered_set',
  'utility',
  'valarray',
  'variant',
  'vector',
  'version',
];

const cHeaders = new Set(C_HEADERS);
const cppHeaders = new Set([...C_HEADERS, ...CPP_HEADERS]);

type Cursor = { index: number; line: number };
type Character = Cursor & { value: string; next: Cursor };

function languageHeaders(language: string): Set<string> | null {
  const id = language.trim().toLowerCase();
  if (/^(?:c|gnuc?)(?:89|90|99|11|17|18|23|2x)?$/.test(id)) return cHeaders;
  if (
    /^(?:cpp|cxx|c\+\+|g\+\+|gnupp|gnu\+\+)(?:98|03|11|14|17|20|23|26|2a|2b|2c)?$/.test(
      id,
    )
  )
    return cppHeaders;
  return null;
}

function newlineWidth(source: string, index: number): number {
  if (source[index] === '\n') return 1;
  if (source[index] === '\r') return source[index + 1] === '\n' ? 2 : 1;
  return 0;
}

// Translation-phase line splices are read lazily rather than rewriting the
// source. This keeps physical line numbers and raw-string contents intact.
function read(source: string, cursor: Cursor): Character {
  let { index, line } = cursor;
  while (source[index] === '\\') {
    const width = newlineWidth(source, index + 1);
    if (!width) break;
    index += width + 1;
    line++;
  }
  const width = newlineWidth(source, index);
  return {
    index,
    line,
    value: width ? '\n' : (source[index] ?? ''),
    next: {
      index: index + (width || (index < source.length ? 1 : 0)),
      line: line + (width ? 1 : 0),
    },
  };
}

function skipComment(source: string, cursor: Cursor, block: boolean): Cursor {
  let current = cursor;
  while (current.index < source.length) {
    const char = read(source, current);
    if (!block && char.value === '\n') return char.next;
    if (block && char.value === '*') {
      const next = read(source, char.next);
      if (next.value === '/') return next.next;
    }
    current = char.next;
  }
  return current;
}

function skipQuoted(source: string, quote: Character): Cursor {
  let current = quote.next;
  while (current.index < source.length) {
    const char = read(source, current);
    if (char.value === quote.value) return char.next;
    current = char.value === '\\' ? read(source, char.next).next : char.next;
  }
  return current;
}

function skipRawString(source: string, quote: Character): Cursor | null {
  let current = quote.next;
  let delimiter = '';
  while (current.index < source.length) {
    const char = read(source, current);
    if (char.value === '(') {
      const terminator = `)${delimiter}"`;
      const close = source.indexOf(terminator, char.next.index);
      const end = close < 0 ? source.length : close + terminator.length;
      let line = char.next.line;
      // Unlike ordinary tokens, raw-string contents do not splice lines.
      for (let index = char.next.index; index < end; index++) {
        const width = newlineWidth(source, index);
        if (width) {
          line++;
          index += width - 1;
        }
      }
      return { index: end, line };
    }
    if (
      delimiter.length === 16 ||
      !char.value ||
      char.value === ')' ||
      char.value === '\\' ||
      /\s/.test(char.value)
    )
      return null;
    delimiter += char.value;
    current = char.next;
  }
  return null;
}

function inlineTrivia(source: string, cursor: Cursor): Character | null {
  let current = cursor;
  while (current.index < source.length) {
    const char = read(source, current);
    if (!char.value || char.value === '\n') return null;
    if (/[ \t\v\f]/.test(char.value)) {
      current = char.next;
      continue;
    }
    if (char.value === '/') {
      const next = read(source, char.next);
      if (next.value === '/') return null;
      if (next.value === '*') {
        current = skipComment(source, next.next, true);
        continue;
      }
    }
    return char;
  }
  return null;
}

function inspectDirective(
  source: string,
  hash: Character,
  headers: Set<string>,
): { issue: CHeaderCaseIssue | null; end: Cursor } | null {
  let char = inlineTrivia(source, hash.next);
  if (!char) return null;
  let directive = '';
  while (char.value && /[A-Za-z0-9_]/.test(char.value)) {
    if (directive.length >= 16) return null;
    directive += char.value;
    char = read(source, char.next);
  }
  if (directive !== 'include') return null;
  char = inlineTrivia(source, char);
  // Header-name tokens are not string literals: quotes/apostrophes inside
  // <...>, or backslashes inside "...", must not affect lexing of later code.
  // Only angle includes may produce suggestions; quoted includes stay custom.
  if (char?.value !== '<' && char?.value !== '"') return null;
  const angle = char.value === '<';
  const close = angle ? '>' : '"';
  let current = char.next;
  let header = '';
  let tooLong = false;
  while (current.index < source.length) {
    char = read(source, current);
    if (!char.value || char.value === '\n') return null;
    if (char.value === close) {
      const suggestion = header.toLowerCase();
      return {
        issue:
          angle && !tooLong && header !== suggestion && headers.has(suggestion)
            ? { line: hash.line, header, suggestion }
            : null,
        end: char.next,
      };
    }
    if (header.length < 64) header += char.value;
    else tooLong = true;
    current = char.next;
  }
  return null;
}

/** Explain mis-cased standard #include names without changing source code. */
export function inspectCHeaderCase(
  language: string,
  source: string,
): CHeaderCaseIssue[] {
  const headers = languageHeaders(language);
  if (!headers) return [];
  const issues: CHeaderCaseIssue[] = [];
  let current: Cursor = { index: 0, line: 1 };
  let lineStart = true;
  while (current.index < source.length) {
    const char = read(source, current);
    const next = read(source, char.next);
    if (!char.value) break;
    if (char.value === '\n') {
      lineStart = true;
      current = char.next;
    } else if (
      /[ \t\v\f]/.test(char.value) ||
      (char.index === 0 && char.value === '\uFEFF')
    ) {
      current = char.next;
    } else if (
      char.value === '/' &&
      (next.value === '/' || next.value === '*')
    ) {
      current = skipComment(source, next.next, next.value === '*');
      // A block comment is one whitespace token, including its physical
      // newlines. Its contents cannot start another preprocessor directive.
      if (next.value === '/') lineStart = true;
    } else if (char.value === '"' || char.value === "'") {
      current = skipQuoted(source, char);
      lineStart = false;
    } else if (/[A-Za-z_]/.test(char.value)) {
      let word = '';
      let end = char;
      while (end.value && /[A-Za-z0-9_]/.test(end.value)) {
        word += end.value;
        end = read(source, end.next);
      }
      const raw =
        end.value === '"' && ['R', 'u8R', 'uR', 'UR', 'LR'].includes(word)
          ? skipRawString(source, end)
          : null;
      current = raw ?? end;
      lineStart = false;
    } else if (
      /[0-9]/.test(char.value) ||
      (char.value === '.' && /[0-9]/.test(next.value))
    ) {
      // Preprocessing numbers include digit separators. An apostrophe in
      // 1'000 must not swallow the rest of the file as a character literal.
      let end = char.next;
      let previous = char.value;
      while (end.index < source.length) {
        const part = read(source, end);
        if (
          !part.value ||
          (!/[A-Za-z0-9_.']/.test(part.value) &&
            !(/[+-]/.test(part.value) && /[eEpP]/.test(previous)))
        )
          break;
        previous = part.value;
        end = part.next;
      }
      current = end;
      lineStart = false;
    } else {
      if (lineStart && char.value === '#') {
        const directive = inspectDirective(source, char, headers);
        if (directive) {
          if (directive.issue) issues.push(directive.issue);
          current = directive.end;
          lineStart = false;
          continue;
        }
      }
      lineStart = false;
      current = char.next;
    }
  }
  return issues;
}
