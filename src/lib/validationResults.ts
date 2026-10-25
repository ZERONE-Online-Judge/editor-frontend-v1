import type { Job } from './types';

export function isInputCheck(job: Job) {
  return (
    job.kind === 'prepare' &&
    ['inputs', 'validate'].includes(
      String(job.result.prepare_mode || job.options.prepare_mode),
    )
  );
}

export function isCheckOnly(job: Job) {
  if (!isInputCheck(job)) return false;
  const mode = job.result.prepare_mode || job.options.prepare_mode;
  if (mode === 'validate') return true;
  if (typeof job.options.check_only === 'boolean')
    return job.options.check_only;
  // Older whole-input checks did not store an explicit intent marker.
  return (
    !Array.isArray(job.options.test_indices) || !job.options.test_indices.length
  );
}

export function isComponentCheck(job: Job) {
  return job.kind === 'validator-tests' || job.kind === 'checker-tests';
}

export function validationVerdict(value: string) {
  return (
    (
      {
        VALID: '입력 허용',
        INVALID: '입력 거부',
        OK: '정답으로 판정',
        WRONG_ANSWER: '오답으로 판정',
        PRESENTATION_ERROR: '출력 형식 오류',
        CRASHED: '프로그램 실행 오류',
      } as Record<string, string>
    )[value] || value
  );
}

export function validationExplanation(
  test: NonNullable<Job['result']['unit_tests']>[number],
) {
  if (test.matched) {
    if (test.actual === 'VALID') return '정상 입력을 올바르게 허용했습니다.';
    if (test.actual === 'INVALID')
      return '조건을 위반한 입력을 올바르게 거부했습니다.';
    if (test.actual === 'CRASHED')
      return '예상한 실행 오류가 발생했습니다. 정상적인 입력 판정 결과는 아닙니다.';
    return '기대 판정과 일치합니다.';
  }
  if (test.actual === 'CRASHED')
    return '프로그램 실행 오류로 판정하지 못했습니다. 실행 메시지를 확인하세요.';
  if (test.expected === 'VALID' && test.actual === 'INVALID')
    return '정상 입력을 거부했습니다. 입력 조건과 Validator 코드를 확인하세요.';
  if (test.expected === 'INVALID' && test.actual === 'VALID')
    return '조건을 위반한 입력을 허용했습니다. Validator에서 누락된 조건을 확인하세요.';
  return '기대 판정과 다릅니다. 테스트 자료와 프로그램을 확인하세요.';
}
