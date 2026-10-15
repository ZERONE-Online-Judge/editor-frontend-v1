import type { ProblemDocument } from './types';
export type BulkAction =
  | 'group'
  | 'description'
  | 'sample-on'
  | 'sample-off'
  | 'delete'
  | 'renumber'
  | 'copy'
  | 'move';

export function bulkTests(
  document: ProblemDocument,
  setName: string,
  indices: number[],
  action: BulkAction,
  options: {
    group?: string;
    description?: string;
    target?: string;
    limit?: number;
  } = {},
) {
  const next = structuredClone(document),
    source = next.testsets[setName];
  if (!source) throw new Error('테스트 세트가 없습니다.');
  if (source.script.trim())
    throw new Error('입력·정답 생성 결과를 반영한 뒤 일괄 작업을 사용하세요.');
  const selected = new Set(indices),
    entries = Object.entries(source.tests)
      .filter(([, test]) => selected.has(test.index))
      .sort((a, b) => a[1].index - b[1].index);
  if (!entries.length || entries.length !== selected.size)
    throw new Error('현재 존재하는 테스트를 선택하세요.');
  const group = (target: typeof source, value: string) => {
    if (value && (!target.groups_enabled || !target.groups[value]))
      throw new Error('대상 세트에 등록된 그룹을 선택하세요.');
    return value;
  };
  if (action === 'renumber') {
    if (entries.length !== Object.keys(source.tests).length)
      throw new Error('번호 정렬은 전체 테스트에 적용하세요.');
    source.tests = Object.fromEntries(
      entries.map(([, test], index) => [
        String(index + 1),
        { ...test, index: index + 1 },
      ]),
    );
  } else if (action === 'copy' || action === 'move') {
    const target = next.testsets[options.target || ''];
    if (!target || target === source || target.script.trim())
      throw new Error('생성 결과가 반영된 다른 테스트 세트를 선택하세요.');
    const used = new Set(Object.values(target.tests).map((test) => test.index));
    const hashes = new Set(
      Object.values(target.tests)
        .map((test) => test.input_sha)
        .filter(Boolean),
    );
    let index = 1;
    for (const [key, test] of entries) {
      while (used.has(index)) index++;
      if (options.limit != null && index > options.limit)
        throw new Error('대상 테스트 세트의 개수 한도를 넘습니다.');
      if (
        !next.info.skip_duplicate_validation &&
        test.input_sha &&
        hashes.has(test.input_sha)
      )
        throw new Error(
          '대상 세트에 같은 입력이 있습니다. 중복 검증 설정을 확인하세요.',
        );
      let targetKey = String(index);
      while (target.tests[targetKey]) targetKey = 'copy-' + targetKey;
      target.tests[targetKey] = {
        ...test,
        index,
        group: group(target, options.group ?? test.group),
      };
      used.add(index);
      if (test.input_sha) hashes.add(test.input_sha);
      if (action === 'move') delete source.tests[key];
    }
  } else
    for (const [key, test] of entries) {
      if (action === 'group') test.group = group(source, options.group || '');
      if (action === 'description') {
        if ((options.description || '').length > 200)
          throw new Error('설명은 200자 이하로 입력하세요.');
        test.description = options.description || '';
      }
      if (action === 'sample-on' || action === 'sample-off')
        test.sample = action === 'sample-on';
      if (action === 'delete') delete source.tests[key];
    }
  return next;
}
