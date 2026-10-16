import type { ReactNode } from 'react';
import type { Job } from '../../lib/types';
import { tags } from '../../lib/api';
import { Badge, Icon } from '../../components/ui';
import { SolutionRunProgress, SolutionRunStatus } from './VerificationProgress';

type Solution = NonNullable<Job['result']['solutions']>[number];

export default function SolutionResultPanel({
  solution,
  jobStatus,
  children,
}: {
  solution: Solution;
  jobStatus: Job['status'];
  children: ReactNode;
}) {
  return (
    <details className="solution-result" open>
      <summary className="solution-result-heading">
        <span className="solution-result-toggle" aria-hidden="true">
          <Icon name="down" size={16} />
        </span>
        <strong>{solution.name}</strong>
        <span className="solution-result-badges">
          <Badge tone="accent">
            {solution.tag} · {tags[solution.tag as keyof typeof tags]}
          </Badge>
          <SolutionRunStatus solution={solution} jobStatus={jobStatus} />
        </span>
      </summary>
      <div className="solution-result-body">
        <SolutionRunProgress solution={solution} jobStatus={jobStatus} />
        {children}
      </div>
    </details>
  );
}
