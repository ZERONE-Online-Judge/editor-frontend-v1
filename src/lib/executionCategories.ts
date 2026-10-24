import type { Job } from './types';

export const executionCategories = [
  {
    id: 'all',
    label: '모든 작업',
    description: '생성·검증·검사·스트레스 테스트의 모든 실행 기록입니다.',
  },
  {
    id: 'prepare',
    label: '입력·정답 관련 작업 전체',
    description: '입력·정답 생성과 입력 검사 기록을 함께 봅니다.',
  },
  {
    id: 'prepare-full',
    label: '입력·정답 생성',
    description:
      '테스트 입력을 준비하고 Validator 검사와 Main 정답 생성을 실행합니다.',
  },
  {
    id: 'prepare-inputs',
    label: '입력 생성·검사',
    description:
      '입력을 생성하고 Validator로 검사합니다. Main 정답 생성은 포함하지 않습니다.',
  },
  {
    id: 'prepare-validate',
    label: '저장 입력 검사',
    description:
      '이미 저장된 입력을 다시 생성하지 않고 Validator로 검사합니다.',
  },
  {
    id: 'prepare-answers',
    label: '정답 생성',
    description: '저장된 입력을 사용해 Main 풀이의 정답을 생성합니다.',
  },
  {
    id: 'verify',
    label: '풀이 검증 · 전체 검증',
    description: '선택한 풀이를 테스트로 채점하고 기대 판정과 비교합니다.',
  },
  {
    id: 'validator-tests',
    label: 'Validator 검사',
    description:
      '입력 검증 코드가 정상 입력을 허용하고 잘못된 입력을 거부하는지 검사합니다.',
  },
  {
    id: 'checker-tests',
    label: 'Checker 검사',
    description:
      '출력 채점 코드가 정답·오답·출력 형식 오류를 올바르게 구분하는지 검사합니다.',
  },
  {
    id: 'stress',
    label: '스트레스 테스트',
    description:
      '입력을 반복 생성해 기준 풀이와 다른 결과가 나오는 반례를 찾습니다.',
  },
  {
    id: 'render',
    label: '지문 파일 생성',
    description: '문제 지문을 HTML·PDF 파일로 생성합니다.',
  },
  {
    id: 'package',
    label: '패키지 생성',
    description: '문제 자료를 배포·보관용 ZIP으로 내보냅니다.',
  },
] as const;

export type ExecutionCategory = (typeof executionCategories)[number]['id'];
export function isExecutionCategory(value: string): value is ExecutionCategory {
  return executionCategories.some((category) => category.id === value);
}
export function jobCategory(job: Job) {
  let id = job.category;
  if (!id || !isExecutionCategory(id)) {
    const mode = job.options.prepare_mode || job.result.prepare_mode || 'full';
    id = job.kind === 'prepare' ? `prepare-${mode}` : job.kind;
  }
  return (
    executionCategories.find((category) => category.id === id) ||
    executionCategories[1]
  );
}
