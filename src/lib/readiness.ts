import type { Caution, ProblemDocument } from './types';

export function preparationCautions(doc: ProblemDocument): Caution[] {
  const rows: Caution[] = [];
  const add = (
    code: string,
    message: string,
    section: string,
    blocking = false,
  ) => rows.push({ code, message, section, blocking });
  if (!Object.values(doc.statements).some((s) => s.legend.trim()))
    add('NO_STATEMENT', '문제 지문을 작성하세요.', 'statements', true);
  if (!doc.checker) add('NO_CHECKER', 'checker를 선택하세요.', 'checker', true);
  if (!doc.validator)
    add(
      'NO_VALIDATOR',
      '입력 조건을 확인할 validator를 선택하세요.',
      'validator',
      true,
    );
  else if (!Object.keys(doc.validator_tests).length)
    add(
      'NO_VALIDATOR_TESTS',
      '유효·무효 입력으로 validator 자체도 테스트하세요.',
      'validator',
    );
  if (
    doc.checker &&
    !doc.checker.startsWith('std::') &&
    !Object.keys(doc.checker_tests).length
  )
    add(
      'NO_CHECKER_TESTS',
      '사용자 checker의 정상·오답 출력 테스트를 추가하세요.',
      'checker',
    );
  if (
    doc.info.points_enabled &&
    !Object.values(doc.testsets).some((s) =>
      Object.values(s.tests).some((t) => t.points > 0),
    )
  )
    add(
      'NO_POINTS',
      '부분 점수를 사용할 테스트에 점수를 지정하세요.',
      'tests',
      true,
    );
  if (!Object.values(doc.solutions).some((s) => s.tag === 'MA'))
    add(
      'NO_MAIN',
      '기대 출력을 생성할 Main 풀이를 지정하세요.',
      'solutions',
      true,
    );
  if (
    !Object.values(doc.testsets).some(
      (s) => Object.keys(s.tests).length || s.script.trim(),
    )
  )
    add(
      'NO_TESTS',
      '직접 입력이나 생성 스크립트로 테스트를 추가하세요.',
      'tests',
      true,
    );
  if (
    !Object.values(doc.solutions).some((s) =>
      ['WA', 'TL', 'ML', 'RE', 'RJ'].includes(s.tag),
    )
  )
    add(
      'NO_WRONG_SOLUTIONS',
      '의도한 오답 풀이를 추가해 테스트의 검출력을 확인하세요.',
      'solutions',
    );
  if (doc.info.interactive && !doc.interactor)
    add(
      'NO_INTERACTOR',
      '인터랙티브 문제의 interactor를 선택하세요.',
      'interactor',
      true,
    );
  return rows;
}
