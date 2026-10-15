import type { Job } from '../../lib/types';
import { Badge } from '../../components/ui';

type Solution = NonNullable<Job['result']['solutions']>[number];

function solutionRunLabel(solution: Solution, status: Job['status']) {
  if (!solution.state || solution.state === 'completed') return null;
  if (status !== 'running' && status !== 'queued') return '검증 중단';
  return solution.state === 'queued' ? '채점 대기' : '검증 중';
}

export function SolutionRunStatus({
  solution,
  jobStatus,
}: {
  solution: Solution;
  jobStatus: Job['status'];
}) {
  const label = solutionRunLabel(solution, jobStatus);
  return (
    <Badge tone={label ? 'neutral' : solution.matched ? 'success' : 'danger'}>
      {label ||
        (solution.matched
          ? solution.expectations_complete === false
            ? '일부 범위 미확인'
            : '기대 판정 일치'
          : '기대 판정 불일치')}
    </Badge>
  );
}

export default function VerificationProgress({ job }: { job: Job }) {
  const progress = job.result.verification_progress;
  if (!progress) return null;
  const percent = Math.max(0, Math.min(100, progress.percent));
  const active = job.status === 'running' || job.status === 'queued';
  const label =
    progress.phase === 'preparing' && active
      ? '테스트 자료 준비 중'
      : active
        ? '전체 풀이 검증 중'
        : job.status === 'completed'
          ? '전체 풀이 검증 종료'
          : '전체 풀이 검증 중단';
  return (
    <section
      className="verification-progress"
      aria-label="전체 풀이 검증 진행률"
    >
      <div className="section-heading">
        <strong>{label}</strong>
        <strong className="verification-percent">{percent}%</strong>
      </div>
      <progress aria-label="전체 풀이 검증" value={percent} max={100} />
      <p className="muted small">
        판정 확인 {progress.current.toLocaleString()} /{' '}
        {progress.total.toLocaleString()}개
        {progress.total_solutions != null &&
          ` · 풀이 ${progress.completed_solutions ?? 0} / ${progress.total_solutions}개 종료`}
      </p>
      <p className="muted small">
        실행 대상 풀이 × 테스트 중 실제 판정이 저장된 비율입니다. WA·TLE·MLE도
        확인한 결과로 집계하며, 실행 제외(NR)는 분모에서 뺍니다.
      </p>
    </section>
  );
}

export function SolutionRunProgress({
  solution,
  jobStatus,
}: {
  solution: Solution;
  jobStatus: Job['status'];
}) {
  if (solution.total_tests == null || solution.skipped) return null;
  const current = solution.completed_tests ?? 0;
  const total = solution.total_tests;
  return (
    <div className="solution-run-progress">
      <span className="muted small">
        {solutionRunLabel(solution, jobStatus) || '검증 종료'} · 판정 확인{' '}
        {current} / {total}개
      </span>
      {total > 0 && (
        <progress
          aria-label={`${solution.name} 테스트 진행률`}
          value={current}
          max={total}
        />
      )}
    </div>
  );
}
