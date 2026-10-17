import type { Folder, FolderRole, Problem } from './types';
export const folderRoles: Record<FolderRole, string> = {
  OWNER: '소유자',
  CUSTOM: '기능별 권한',
  ADMIN: '관리자',
  EDITOR: '편집자',
  REVIEWER: '검수자',
  TRANSLATOR: '번역자',
  VIEWER: '읽기',
};
export const folderRoleHelp: Record<Exclude<FolderRole, 'OWNER'>, string> = {
  CUSTOM: '선택한 기능만 허용',
  ADMIN: '구성원 초대·권한 관리, 하위 폴더와 문제 편집',
  EDITOR: '문제 자료 수정·실행·커밋, 하위 폴더 정리',
  REVIEWER: '커밋된 자료로 검증 실행, 임시 검수 코드 실행, 이슈 작성',
  TRANSLATOR: '지문 번역·커밋, 지문 렌더링, 이슈 작성',
  VIEWER: '문제 자료와 실행 결과 열람',
};
export function shareScopeChanges(
  rows: Problem[],
  ids: string[],
  target?: Folder,
) {
  return rows.some(
    (p) =>
      ids.includes(p.id) &&
      (p.workspace_id || null) !== (target?.workspace_id || null),
  );
}
export function canEditFolder(folder?: Folder) {
  return folder?.can_edit !== false;
}
export function folderDestinations(folders: Folder[], editing?: Folder | null) {
  return folders.filter(
    (f) =>
      canEditFolder(f) &&
      (!editing || (f.workspace_id || null) === (editing.workspace_id || null)),
  );
}

export function canOrganizeProblem(problem: Problem, handle?: string) {
  return (
    !problem.workspace_id ||
    problem.owner === handle ||
    (problem.workspace_permissions
      ? problem.workspace_permissions.includes('manage_folders')
      : ['OWNER', 'ADMIN', 'EDITOR'].includes(problem.workspace_role || ''))
  );
}
