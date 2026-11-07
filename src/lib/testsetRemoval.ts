import type { ProblemDocument, Solution } from './types';

export type TestsetRemovalImpact = {
  tests: number;
  groups: number;
  script: boolean;
  solutions: number;
  materials: number;
};

type RemovalPermissions = {
  editTests: boolean;
  editSolutions: boolean;
  editMaterials: boolean;
};

function removedScopes(document: ProblemDocument, name: string) {
  if (!Object.hasOwn(document.testsets, name))
    throw new Error('삭제할 테스트 세트가 없습니다. 다시 선택해 주세요.');
  const scopes = new Set([name]);
  for (const group of Object.keys(document.testsets[name].groups)) {
    // Match the server's meaning before deletion: a set name takes priority
    // over an unqualified group, even when their names happen to match.
    if (Object.hasOwn(document.testsets, group)) continue;
    const owners = Object.entries(document.testsets).filter(([, set]) =>
      Object.hasOwn(set.groups, group),
    );
    if (owners.length === 1 && owners[0][0] === name) scopes.add(group);
  }
  return scopes;
}

function affectedSolution(source: Solution, name: string, scopes: Set<string>) {
  return (
    Object.keys(source.extra_tags ?? {}).some((scope) => scopes.has(scope)) ||
    Object.hasOwn(source.group_tags ?? {}, name)
  );
}

export function testsetRemovalImpact(
  document: ProblemDocument,
  name: string,
): TestsetRemovalImpact {
  const scopes = removedScopes(document, name);
  const set = document.testsets[name];
  return {
    tests: Object.keys(set.tests).length,
    groups: Object.keys(set.groups).length,
    script: Boolean(set.script.trim()),
    solutions: Object.values(document.solutions).filter((source) =>
      affectedSolution(source, name, scopes),
    ).length,
    materials: Object.values(document.materials).filter((material) =>
      material.testsets.includes(name),
    ).length,
  };
}

export function testsetRemovalIssue(
  document: ProblemDocument,
  name: string,
  permissions: RemovalPermissions,
): string | null {
  if (!Object.hasOwn(document.testsets, name))
    return '삭제할 테스트 세트가 없습니다. 다시 선택해 주세요.';
  if (!permissions.editTests) return '테스트 편집 권한이 필요합니다.';
  if (Object.keys(document.testsets).length <= 1)
    return '테스트 세트는 최소 1개 남아 있어야 합니다.';
  const impact = testsetRemovalImpact(document, name);
  const required = [
    impact.solutions && !permissions.editSolutions ? '풀이·기대 판정 편집' : '',
    impact.materials && !permissions.editMaterials ? '공개 자료 편집' : '',
  ].filter(Boolean);
  return required.length
    ? `연결된 설정을 함께 정리하려면 ${required.join(' 및 ')} 권한이 필요합니다.`
    : null;
}

/** Remove draft references only; blobs, revisions and job snapshots stay intact. */
export function removeTestset(document: ProblemDocument, name: string) {
  const scopes = removedScopes(document, name);
  if (Object.keys(document.testsets).length <= 1)
    throw new Error('테스트 세트는 최소 1개 남아 있어야 합니다.');
  const next = structuredClone(document);
  delete next.testsets[name];
  for (const source of Object.values(next.solutions)) {
    for (const scope of scopes) delete source.extra_tags[scope];
    if (source.group_tags) delete source.group_tags[name];
  }
  for (const material of Object.values(next.materials))
    material.testsets = material.testsets.filter((set) => set !== name);
  return next;
}
