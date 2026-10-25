import type { Job, JobAssessment } from './types';

type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';
const executionLabels: Record<Job['status'], { label: string; tone: Tone }> = {
  queued: { label: '대기', tone: 'neutral' },
  running: { label: '진행 중', tone: 'accent' },
  completed: { label: '완료', tone: 'success' },
  failed: { label: '실패', tone: 'danger' },
  cancelled: { label: '중단', tone: 'warning' },
};
const labels: Record<string, [string, string]> = {
  queued: ['실행 후 확인', '작업이 실행되면 결과를 확인할 수 있습니다.'],
  running: ['확인 중', '작업이 진행 중입니다. 완료 후 최종 결과를 확인합니다.'],
  expectations_match: [
    '기대 판정 일치',
    '실행 당시 설정한 기대 판정과 실제 결과가 모두 일치합니다.',
  ],
  expectations_differ: [
    '기대 판정 불일치',
    '기대 판정과 다른 풀이 또는 자체 테스트가 있습니다.',
  ],
  component_matches: [
    '기대 동작 일치',
    '테스트에 설정한 기대 동작과 실제 동작이 일치합니다.',
  ],
  component_differs: [
    '기대 동작 불일치',
    '예상과 다르게 동작한 자체 테스트가 있습니다.',
  ],
  input_valid: [
    '입력 검사 통과',
    '선택한 입력이 입력 조건 검사를 통과했습니다.',
  ],
  input_rejected: [
    '입력 검사 불통과',
    '입력 조건을 만족하지 않은 테스트가 있습니다.',
  ],
  input_format: [
    '입력 형식 불통과',
    '입력의 줄바꿈·파일 형식 조건을 만족하지 않았습니다.',
  ],
  input_duplicate: [
    '중복 입력 발견',
    '중복 입력을 허용하지 않는 설정에서 같은 입력이 발견됐습니다.',
  ],
  preparation_ready: [
    '생성·검사 통과',
    '입력 검사와 기준 풀이의 정답 생성·확인이 완료됐습니다. 풀이의 정확성은 별도 검증에서 확인하세요.',
  ],
  reference_failed: [
    '기준 풀이 실행 실패',
    '기준 풀이가 정상적으로 종료되지 않아 정답을 생성하지 못했습니다.',
  ],
  reference_rejected: [
    '정답 확인 불통과',
    'Checker가 기준 풀이의 출력을 거부했습니다.',
  ],
  incomplete_checks: [
    '확인 미완료',
    '실행된 범위만으로 결과를 모두 확인하지 못했습니다.',
  ],
  verification_skipped: [
    '검증 생략',
    '패키지만 생성하도록 요청해 풀이·자체 테스트 검증을 실행하지 않았습니다.',
  ],
  no_targets: [
    '검사 대상 없음',
    '검사할 대상이 없어 통과 여부를 판정하지 않았습니다.',
  ],
  missing_evidence: [
    '결과 미확인',
    '이 기록에는 판정에 필요한 결과가 충분히 남아 있지 않습니다.',
  ],
  render_ready: [
    '문서 생성 확인',
    '요청한 지문의 HTML·PDF 파일이 생성됐습니다.',
  ],
  render_failed: [
    '문서 생성 불완전',
    'HTML 또는 PDF 생성에 실패한 지문이 있습니다.',
  ],
  counterexample_found: [
    '반례 발견',
    '기준 풀이와 다른 결과를 내는 입력을 찾았습니다.',
  ],
  counterexample_not_found: [
    '반례 미발견',
    '실행한 탐색 범위에서 반례를 찾지 못했습니다. 풀이의 정답 여부를 확정하는 결과는 아닙니다.',
  ],
};

function compactLabel(check: JobAssessment, fallback: string) {
  const labels: Record<string, string> = {
    queued: '대기',
    running: '확인 중',
    expectations_match: '예상 일치',
    component_matches: '예상 일치',
    expectations_differ: '예상 불일치',
    component_differs: '예상 불일치',
    input_valid: '통과',
    input_rejected: '불통과',
    input_format: '형식 불통과',
    preparation_ready: '생성·검사 통과',
    reference_failed: '기준 풀이 실패',
    incomplete_checks: '미완료',
    no_targets: '대상 없음',
    missing_evidence: '미확인',
    render_ready: '생성 완료',
    render_failed: '생성 불완전',
  };
  let label = labels[check.code] || fallback;
  if (
    ['expectations_differ', 'component_differs'].includes(check.code) &&
    check.counts?.failed
  )
    label = `불일치 ${check.counts.failed}개`;
  if (check.code === 'counterexample_found' && check.found)
    label = `반례 ${check.found}개`;
  if (check.partial && ['failed', 'found'].includes(check.status))
    label += ' · 일부';
  return label;
}

function countSummary(check: JobAssessment) {
  if (check.kind === 'stress' && check.iterations !== undefined) {
    return `${check.iterations}회 탐색 · 반례 ${check.found || 0}개${check.uncovered ? ` · 미발견 풀이 ${check.uncovered}개` : ''}`;
  }
  const counts = check.counts;
  if (!counts?.total) return '';
  const noun =
    check.kind === 'component'
      ? '테스트'
      : check.kind === 'render'
        ? '언어'
        : check.kind === 'input' || check.kind === 'preparation'
          ? '입력'
          : '검증 항목';
  const positive =
    check.kind === 'expectations' || check.kind === 'component'
      ? '일치'
      : check.kind === 'render'
        ? '완료'
        : '통과';
  const negative =
    check.kind === 'input' || check.kind === 'preparation'
      ? '불통과'
      : check.kind === 'render'
        ? '실패'
        : '불일치';
  return `${noun} ${counts.total}개 · ${positive} ${counts.passed}개${counts.failed ? ` · ${negative} ${counts.failed}개` : ''}${counts.unconfirmed ? ` · 미확인 ${counts.unconfirmed}개` : ''}`;
}

export function jobOutcomePresentation(job: Job) {
  // Older APIs and incomplete records must never turn completion into a pass.
  const check: JobAssessment = job.outcome?.assessment ?? {
    kind: 'none',
    status:
      job.status === 'queued' || job.status === 'running'
        ? 'pending'
        : 'unknown',
    code:
      job.status === 'queued' || job.status === 'running'
        ? job.status
        : 'missing_evidence',
    partial: false,
  };
  const [label, description] = labels[check.code] || labels.missing_evidence;
  const tone: Tone =
    check.status === 'passed'
      ? 'success'
      : check.status === 'failed'
        ? 'danger'
        : check.status === 'incomplete'
          ? 'warning'
          : check.status === 'found' || check.status === 'pending'
            ? 'accent'
            : 'neutral';
  return {
    execution: executionLabels[job.status],
    assessment: {
      label,
      compactLabel: compactLabel(check, label),
      description,
      tone,
      partial: check.partial,
      counts: countSummary(check),
    },
  };
}
