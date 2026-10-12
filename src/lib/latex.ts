export function latexToMarkdown(value: string) {
  return value
    .replace(/\\textbf\{([^{}]*)\}/g, '**$1**')
    .replace(/\\textit\{([^{}]*)\}/g, '*$1*')
    .replace(/\\texttt\{([^{}]*)\}/g, '`$1`')
    .replace(/\\(?:begin|end)\{(?:itemize|enumerate)\}/g, '')
    .replace(/\\item\s*/g, '\n- ')
    .replace(/\\(?:begin|end)\{center\}/g, '')
    .replace(/\\(?:section|subsection)\*?\{([^{}]*)\}/g, '\n### $1\n')
    .replace(/\\leq/g, '\\le')
    .replace(/\\geq/g, '\\ge');
}
