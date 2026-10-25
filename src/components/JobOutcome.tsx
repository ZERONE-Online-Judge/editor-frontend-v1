import type { Job } from '../lib/types';
import { jobOutcomePresentation } from '../lib/jobOutcomes';
import { Badge } from './ui';

export default function JobOutcome({
  job,
  compact = false,
}: {
  job: Job;
  compact?: boolean;
}) {
  const { execution, assessment } = jobOutcomePresentation(job);
  return (
    <section
      className={compact ? 'job-outcome is-compact' : 'job-outcome'}
      aria-label={`실행 상태: ${execution.label} · 결과 확인: ${assessment.label}`}
    >
      <dl>
        <div>
          <dt>실행 상태</dt>
          <dd>
            <Badge tone={execution.tone}>{execution.label}</Badge>
          </dd>
        </div>
        <div>
          <dt>결과 확인</dt>
          <dd>
            <Badge tone={assessment.tone}>{assessment.label}</Badge>
          </dd>
        </div>
      </dl>
      {assessment.partial && (
        <p className="job-outcome-partial">일부 결과 · 전체 확인 미완료</p>
      )}
      {assessment.counts && (
        <p className="job-outcome-counts">{assessment.counts}</p>
      )}
      {!compact && (
        <p className="job-outcome-description">{assessment.description}</p>
      )}
    </section>
  );
}
