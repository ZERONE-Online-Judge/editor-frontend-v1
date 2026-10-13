import type { ProblemDocument, SolutionTag, SourceRole } from './types';

export const roleLabels: Record<SourceRole, string> = {
  validator: 'Validator',
  checker: 'Checker',
  generator: 'Generator',
  interactor: 'Interactor',
};

function generates(doc: ProblemDocument, name: string) {
  const stem = name.replace(/\.[^.]+$/, '');
  return Object.values(doc.testsets).some((set) =>
    [
      ...set.script.split('\n'),
      ...Object.values(set.tests).map((t) => t.command),
    ].some((line) => {
      const first = line.trim().match(/^(?:["']([^"']+)["']|([^\s]+))/);
      return first && [name, stem].includes(first[1] || first[2]);
    }),
  );
}

export function sourceRoles(doc: ProblemDocument, name: string): SourceRole[] {
  const roles = new Set(doc.files[name]?.roles || []);
  for (const role of ['validator', 'checker', 'interactor'] as const)
    if (doc[role] === name) roles.add(role);
  if (doc.extra_validators.includes(name)) roles.add('validator');
  if (generates(doc, name)) roles.add('generator');
  return [...roles];
}

export function solutionReuseIssue(doc: ProblemDocument, name: string) {
  const source = doc.files[name];
  if (!source || source.kind !== 'source' || source.language === 'text')
    return '실행 소스만 풀이로 지정할 수 있습니다.';
  if (doc.solutions[name]) return '같은 이름의 풀이가 이미 있습니다.';
  const roles = sourceRoles(doc, name);
  if (roles.length)
    return `${roles.map((r) => roleLabels[r]).join('·')} 연결과 역할을 먼저 해제하세요.`;
  if (source.compile_with_solution)
    return '풀이와 함께 컴파일하는 보조 파일입니다.';
  return '';
}

export function reuseAsSolution(
  doc: ProblemDocument,
  name: string,
  tag: SolutionTag,
) {
  const issue = solutionReuseIssue(doc, name);
  if (issue) throw new Error(issue);
  const source = doc.files[name];
  if (tag === 'MA')
    for (const solution of Object.values(doc.solutions))
      if (solution.tag === 'MA') solution.tag = 'OK';
  doc.solutions[name] = { ...source, tag, extra_tags: {} };
  delete doc.files[name];
  for (const material of Object.values(doc.materials)) {
    if (material.files.includes(name)) {
      material.files = material.files.filter((n) => n !== name);
      material.solutions = [...new Set([...material.solutions, name])];
    }
  }
}
