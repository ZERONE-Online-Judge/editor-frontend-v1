import type { Job } from '../../lib/types';
import { Badge } from '../../components/ui';
import {
  MotionNumber,
  MotionProgress,
  ResultTransition,
} from '../../components/ProgressMotion';

type Solution = NonNullable<Job['result']['solutions']>[number];

const preparationStages: Record<string, string> = {
  input: '입력 확인',
  validator: 'Validator 검사',
  answer: '정답 준비',
  checker: 'Checker 확인',
  sample: '지문 예제 검사',
  ready: '중복 확인·저장',
};

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
    <ResultTransition
      stateKey={`${solution.name}/${label}/${solution.matched}/${solution.expectations_complete}`}
    >
      <Badge tone={label ? 'neutral' : solution.matched ? 'success' : 'danger'}>
        {label ||
          (solution.matched
            ? solution.expectations_complete === false
              ? '일부 범위 미확인'
              : '기대 판정 일치'
            : '기대 판정 불일치')}
      </Badge>
    </ResultTransition>
  );
}

function PreparationSummary({ job }: { job: Job }) {
  const cache = job.result.preparation_cache;
  if (!cache) return null;
  const reused = Object.values(cache.reused).reduce(
    (sum, count) => sum + count,
    0,
  );
  const executed = Object.values(cache.executed).reduce(
    (sum, count) => sum + count,
    0,
  );
  const stages = {
    input: '입력 생성',
    validator: 'Validator 검사',
    answer: 'Main 정답 생성',
    checker: 'Checker 확인',
    sample: '지문 표시용 예제 검사',
  } as const;
  return (
    <details className="notice neutral preparation-summary">
      <summary>
        테스트 준비 · {reused.toLocaleString()}개 단계 재사용 ·{' '}
        {executed.toLocaleString()}개 단계 실행
      </summary>
      <p className="muted small">
        {cache.enabled
          ? '파일 내용·생성 인자·실행 환경이 같은 준비 결과를 재사용합니다.'
          : '이 작업은 준비 결과를 재사용하지 않고 실행합니다.'}{' '}
        아래 횟수는 준비 단계만 집계합니다. 풀이 채점은 매번 실행하며
        판정·시간·메모리를 재사용하지 않습니다.
      </p>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>준비 단계</th>
              <th>재사용</th>
              <th>실행</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(stages).map(([stage, label]) => (
              <tr key={stage}>
                <td>{label}</td>
                <td>
                  {cache.reused[stage as keyof typeof stages].toLocaleString()}
                </td>
                <td>
                  {cache.executed[
                    stage as keyof typeof stages
                  ].toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small">
        등록된 입력·정답 파일을 읽는 작업은 실행 횟수에 포함하지 않습니다.
      </p>
    </details>
  );
}

export default function VerificationProgress({ job }: { job: Job }) {
  const progress = job.result.verification_progress;
  if (!progress)
    return (
      <>
        <JobProgress job={job} />
        <PreparationSummary job={job} />
      </>
    );
  const percent = Math.max(0, Math.min(100, progress.percent));
  const scope = `${job.id}/verification/${progress.total}`;
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
    <>
      <section
        className="verification-progress"
        aria-label="전체 풀이 검증 진행률"
      >
        <div className="section-heading">
          <strong>
            <ResultTransition stateKey={`${job.id}/${label}`}>
              {label}
            </ResultTransition>
          </strong>
          <strong className="verification-percent">
            <MotionNumber value={percent} max={100} scope={scope} />%
          </strong>
        </div>
        <MotionProgress
          aria-label="전체 풀이 검증"
          value={percent}
          scope={scope}
        />
        {progress.preparation && progress.judging && (
          <ul
            className="verification-phases"
            aria-label="준비와 채점 진행 현황"
          >
            {[
              {
                title: '테스트 준비',
                count: progress.preparation,
                unit: '단계',
              },
              { title: '풀이 판정', count: progress.judging, unit: '건' },
            ].map(({ title, count, unit }) => (
              <li key={title}>
                <span>{title}</span>
                <strong>
                  <MotionNumber
                    value={count.current}
                    max={count.total}
                    scope={`${job.id}/${title}`}
                  />{' '}
                  / {count.total.toLocaleString()}
                  {unit}
                </strong>
                <MotionProgress
                  scope={`${job.id}/${title}`}
                  aria-label={title}
                  value={count.current}
                  max={count.total || 1}
                />
              </li>
            ))}
          </ul>
        )}
        {progress.preparation?.stages && (
          <p className="muted small verification-preparation-stages">
            {Object.entries(progress.preparation.stages)
              .filter(([, count]) => count.total > 0)
              .map(([stage, count]) => (
                <span key={stage}>
                  {preparationStages[stage] || stage}{' '}
                  <MotionNumber
                    value={count.current}
                    max={count.total}
                    scope={`${job.id}/${stage}`}
                  />{' '}
                  / {count.total.toLocaleString()}
                </span>
              ))}
          </p>
        )}
        <p className="muted small">
          {progress.preparation && progress.judging ? '전체 처리' : '판정 확인'}{' '}
          <MotionNumber
            value={progress.current}
            max={progress.total}
            scope={scope}
          />{' '}
          / {progress.total.toLocaleString()}개
          {progress.total_solutions != null && (
            <>
              {' '}
              · 풀이{' '}
              <MotionNumber
                value={progress.completed_solutions ?? 0}
                max={progress.total_solutions}
                scope={`${job.id}/completed-solutions`}
              />{' '}
              / {progress.total_solutions}개 종료
            </>
          )}
        </p>
        <p className="muted small">
          {progress.preparation && progress.judging
            ? '테스트 준비 단계와 풀이별 테스트 판정을 합산한 진행률입니다. 재사용한 준비 결과도 포함하며, 실패하거나 중단된 단계는 완료로 처리하지 않습니다. 소요 시간의 비율과는 다릅니다. '
            : '실행 대상 풀이 × 테스트 중 실제 판정이 저장된 비율입니다. '}
          WA·TLE·MLE도 확인한 판정으로 집계하며, 실행 제외(NR)는 풀이 판정
          건수에서 뺍니다.
        </p>
        {progress.testsets && Object.keys(progress.testsets).length > 1 && (
          <ul className="verification-testsets" aria-label="세트별 검증 진행률">
            {Object.entries(progress.testsets).map(([name, scoped]) => (
              <li key={name}>
                <strong>{name}</strong>
                <span>
                  {scoped.total > 0 ? (
                    <>
                      <MotionNumber
                        value={scoped.current}
                        max={scoped.total}
                        scope={`${job.id}/${name}`}
                      />{' '}
                      / {scoped.total.toLocaleString()} ·{' '}
                      <MotionNumber
                        value={scoped.percent}
                        max={100}
                        scope={`${job.id}/${name}/${scoped.total}`}
                      />
                      %
                    </>
                  ) : (
                    '실행 대상 없음'
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <PreparationSummary job={job} />
    </>
  );
}

function JobProgress({ job }: { job: Job }) {
  if (typeof job.result.progress !== 'number') return null;
  const percent = Math.max(0, Math.min(100, job.result.progress));
  const label =
    job.result.summary ||
    (job.status === 'running' || job.status === 'queued'
      ? '작업 진행 중'
      : '작업 종료');
  return (
    <section className="verification-progress" aria-label="작업 진행률">
      <div className="section-heading">
        <strong>
          <ResultTransition stateKey={`${job.id}/${job.status}/${label}`}>
            {label}
          </ResultTransition>
        </strong>
        <strong className="verification-percent">
          <MotionNumber value={percent} max={100} scope={job.id} />%
        </strong>
      </div>
      <MotionProgress aria-label="작업 진행률" value={percent} scope={job.id} />
    </section>
  );
}

export function SolutionRunProgress({
  solution,
  jobStatus,
  jobId,
}: {
  solution: Solution;
  jobStatus: Job['status'];
  jobId: string;
}) {
  if (solution.total_tests == null || solution.skipped) return null;
  const current = solution.completed_tests ?? 0;
  const total = solution.total_tests;
  const percent =
    total > 0
      ? Math.max(0, Math.min(100, Math.floor((current / total) * 100)))
      : 0;
  const scope = `${jobId}/${solution.name}/${total}`;
  return (
    <div className="solution-run-progress">
      <div className="solution-run-progress-heading">
        <span className="muted small">
          <ResultTransition
            stateKey={`${scope}/${jobStatus}/${solution.state}`}
          >
            {solutionRunLabel(solution, jobStatus) || '검증 종료'}
          </ResultTransition>{' '}
          · 판정 확인 <MotionNumber value={current} max={total} scope={scope} />{' '}
          / {total}개
        </span>
        {total > 0 && (
          <strong className="solution-run-percent">
            <MotionNumber value={percent} max={100} scope={scope} />%
          </strong>
        )}
      </div>
      {total > 0 && (
        <MotionProgress
          scope={scope}
          aria-label={`${solution.name} 테스트 진행률`}
          value={current}
          max={total}
        />
      )}
    </div>
  );
}
