import type { ProblemDocument, Statement } from './types';

export function effectiveStatement(
  doc: ProblemDocument,
  language: string,
): Statement | undefined {
  const local = doc.statements[language];
  if (!local) return undefined;
  return {
    ...local,
    legend: [doc.common_statement, local.legend].filter(Boolean).join('\n\n'),
    tutorial: [doc.common_tutorial, local.tutorial]
      .filter(Boolean)
      .join('\n\n'),
  };
}
export function translationCanonical(doc: ProblemDocument): string | null {
  const language = doc.translation_source;
  if (!language || !doc.statements[language]) return null;
  const statement: Record<string, string> = {};
  for (const key of [
    'name',
    'legend',
    'input',
    'output',
    'scoring',
    'interaction',
    'notes',
    'tutorial',
  ] as const)
    statement[key] = doc.statements[language][key] || '';
  const value = {
    common_statement: doc.common_statement || '',
    common_tutorial: doc.common_tutorial || '',
    language,
    statement,
  };
  const stable = (item: unknown): unknown =>
    item && typeof item === 'object'
      ? Object.fromEntries(
          Object.entries(item as Record<string, unknown>)
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
            .map(([key, value]) => [key, stable(value)]),
        )
      : item;
  return JSON.stringify(stable(value));
}
export async function translationHash(canonical: string) {
  const hash = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(canonical),
  );
  return Array.from(new Uint8Array(hash), (value) =>
    value.toString(16).padStart(2, '0'),
  ).join('');
}

export function statementCanonical(
  doc: ProblemDocument,
  language: string,
): string {
  const statement: Record<string, string> = {};
  for (const key of [
    'input',
    'interaction',
    'legend',
    'name',
    'notes',
    'output',
    'scoring',
    'tutorial',
  ] as const)
    statement[key] = doc.statements[language][key] || '';
  return JSON.stringify({ language, statement });
}
