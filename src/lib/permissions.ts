import type { Access, Problem } from './types';
export const permissionGroups = [
  {
    title: '문제 작성',
    items: [
      ['edit_info', '기본 설정 편집', '제목·시간·메모리 제한과 문제 설정'],
      ['edit_statements', '지문·해설 편집', '원문·번역·공통 지문과 번역 기준'],
      ['translate', '번역만 편집', '기준 원문을 제외한 언어별 지문'],
      [
        'edit_files',
        '파일·구성요소 편집',
        '생성기·Checker·Validator·리소스와 자체 테스트',
      ],
      [
        'edit_solutions',
        '풀이·기대 판정 편집',
        'Main·정답·오답 코드와 그룹별 기대 판정',
      ],
      [
        'edit_tests',
        '테스트 편집·결과 반영',
        '테스트 세트·그룹·스크립트와 반례 등록',
      ],
      [
        'edit_materials',
        '공개 자료 편집',
        '참가자에게 공개할 파일과 공개 시점',
      ],
    ],
  },
  {
    title: '실행·배포',
    items: [
      [
        'execute',
        '검증·스트레스 실행',
        '풀이·구성요소 검증과 임시 검수 코드 실행',
      ],
      ['render', '지문 HTML·PDF 생성', '지문을 인쇄·배포 파일로 렌더링'],
      [
        'prepare',
        '입력·정답 생성',
        'Validator와 Main을 실행합니다. 반영은 테스트 편집 권한 필요',
      ],
      [
        'package',
        '패키지 내보내기',
        '검증 여부를 선택해 커밋된 자료를 ZIP으로 생성',
      ],
      ['publish', 'ZOJ로 문제 전송', '본인의 ZOJ 대회 문제 등록 권한도 필요'],
    ],
  },
  {
    title: '협업',
    items: [
      [
        'issues',
        '이슈·검수 의견 작성',
        '이슈 생성·댓글·처리와 실행 기록의 의견',
      ],
      [
        'manage_access',
        '구성원·권한 관리',
        '본인이 가진 권한 범위에서 초대·변경·해제',
      ],
      [
        'manage_folders',
        '폴더 정리',
        '하위 폴더 생성·이름 변경·이동과 문제 정리',
      ],
      ['create_problems', '폴더에 문제 추가', '공유 폴더에 새 문제 생성'],
    ],
  },
] as const;
export type Permission = (typeof permissionGroups)[number]['items'][number][0];
export const editPermissions: Permission[] = [
  'edit_info',
  'edit_statements',
  'edit_files',
  'edit_solutions',
  'edit_tests',
  'edit_materials',
];
export const folderOnly: Permission[] = ['manage_folders', 'create_problems'];
export const allPermissions = permissionGroups.flatMap((g) =>
  g.items.map((i) => i[0]),
) as Permission[];
export const writerPermissions = allPermissions.filter(
  (p) => !folderOnly.includes(p) && p !== 'translate',
);
export const permissionPresets: { label: string; permissions: Permission[] }[] =
  [
    { label: '읽기', permissions: [] },
    {
      label: '편집',
      permissions: writerPermissions.filter((p) => p !== 'manage_access'),
    },
    { label: '검수', permissions: ['execute', 'render', 'issues'] },
    { label: '번역', permissions: ['translate', 'render', 'issues'] },
  ];
export function permissionsOf(
  problem:
    Pick<Problem, 'role' | 'reviewer' | 'translator' | 'permissions'> | Access,
): Permission[] {
  if (problem.permissions !== undefined) return problem.permissions;
  const result = new Set<Permission>(
    problem.role === 'OWNER'
      ? allPermissions
      : problem.role === 'WRITE'
        ? writerPermissions
        : [],
  );
  if (problem.reviewer)
    ['execute', 'render', 'issues'].forEach((p) => result.add(p as Permission));
  if (problem.translator)
    ['translate', 'render', 'issues'].forEach((p) =>
      result.add(p as Permission),
    );
  return [...result];
}
export const can = (
  problem: Parameters<typeof permissionsOf>[0],
  permission: Permission,
) => permissionsOf(problem).includes(permission);
export const canEdit = (problem: Parameters<typeof permissionsOf>[0]) =>
  permissionsOf(problem).some(
    (p) => editPermissions.includes(p) || p === 'translate',
  );
export const permissionLabel = (permission: Permission) =>
  permissionGroups
    .flatMap((g) => [...g.items])
    .find((i) => i[0] === permission)?.[1] || permission;
export function tabEditable(problem: Problem, tab: string) {
  const key: Record<string, Permission> = {
    overview: 'edit_info',
    statements: 'edit_statements',
    files: 'edit_files',
    solutions: 'edit_solutions',
    checker: 'edit_files',
    validator: 'edit_files',
    interactor: 'edit_files',
    tests: 'edit_tests',
    materials: 'edit_materials',
  };
  return key[tab] ? can(problem, key[tab]) : canEdit(problem);
}
