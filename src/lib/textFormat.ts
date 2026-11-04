export type LineEnding = 'none' | 'lf' | 'crlf' | 'cr' | 'mixed';

export function textFormat(value: string) {
  let lf = false,
    crlf = false,
    cr = false;
  for (let index = 0; index < value.length; index++) {
    if (value[index] === '\r') {
      if (value[index + 1] === '\n') {
        crlf = true;
        index++;
      } else {
        cr = true;
      }
    } else if (value[index] === '\n') {
      lf = true;
    }
  }
  const kinds = Number(lf) + Number(crlf) + Number(cr);
  const lineEnding: LineEnding =
    kinds > 1 ? 'mixed' : crlf ? 'crlf' : cr ? 'cr' : lf ? 'lf' : 'none';
  return {
    lineEnding,
    hasFinalNewline: /[\r\n]$/.test(value),
    needsLfConversion: crlf || cr,
  };
}

/** Change line separators only; malformed test contents remain malformed. */
export function toLf(value: string) {
  return value.replace(/\r\n|\r/g, '\n');
}

/** Automatic judging-data formatting leaves binary content untouched. */
export function automaticToLf(value: string) {
  return value.includes('\0') ? value : toLf(value);
}

/** Apply textarea edits without normalizing unchanged raw line separators. */
export function preserveEditedLineEndings(original: string, edited: string) {
  const before = toLf(original);
  const after = toLf(edited);
  let prefix = 0;
  while (
    prefix < before.length &&
    prefix < after.length &&
    before[prefix] === after[prefix]
  )
    prefix++;
  let suffix = 0;
  while (
    suffix < before.length - prefix &&
    suffix < after.length - prefix &&
    before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  )
    suffix++;
  const rawOffset = (normalizedOffset: number) => {
    let raw = 0;
    for (let offset = 0; offset < normalizedOffset; offset++) {
      raw += original[raw] === '\r' && original[raw + 1] === '\n' ? 2 : 1;
    }
    return raw;
  };
  const ending = original.match(/\r\n|\r|\n/)?.[0] ?? '\n';
  const insertion = after
    .slice(prefix, after.length - suffix)
    .replace(/\n/g, ending);
  return (
    original.slice(0, rawOffset(prefix)) +
    insertion +
    original.slice(rawOffset(before.length - suffix))
  );
}

export function appendFinalNewline(value: string) {
  const format = textFormat(value);
  if (!value || format.hasFinalNewline) return value;
  const ending =
    format.lineEnding === 'crlf'
      ? '\r\n'
      : format.lineEnding === 'cr'
        ? '\r'
        : '\n';
  return value + ending;
}
