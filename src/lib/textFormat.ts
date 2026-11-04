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
