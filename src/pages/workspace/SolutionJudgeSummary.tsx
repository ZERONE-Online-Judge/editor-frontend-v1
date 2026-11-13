import { BoundedText } from '../../components/ui';
import type { Job } from '../../lib/types';
import { bytes } from '../../lib/api';

type Solution = NonNullable<Job['result']['solutions']>[number];

export default function SolutionJudgeSummary({
  solution,
}: {
  solution: Solution;
}) {
  const groups = solution.groups || [];
  const hasScore =
    solution.total_score != null ||
    groups.length > 0 ||
    solution.score_scope_complete === false;
  const hasRuns = Boolean(solution.judge_runs?.length);
  const multipleSets = new Set(groups.map((group) => group.testset)).size > 1;
  if (!hasScore && !hasRuns) return null;
  return (
    <section className="solution-judge-summary" aria-label="점수 및 채점 기록">
      {hasScore && (
        <section className="solution-score-summary" aria-label="점수 요약">
          <div className="solution-score-heading">
            <dl className="solution-score-total">
              <dt>총점</dt>
              <dd>
                {solution.total_score == null ? (
                  <span className="solution-score-pending">미확정</span>
                ) : (
                  <>
                    {solution.total_score.toLocaleString()}
                    <span>점</span>
                  </>
                )}
              </dd>
            </dl>
            {groups.length > 0 && (
              <span className="solution-score-count">
                서브태스크 {groups.length}개
              </span>
            )}
          </div>
          {groups.length > 0 && (
            <ul className="solution-subtasks" aria-label="서브태스크별 점수">
              {groups.map((group) => (
                <li
                  key={`${group.testset}-${group.name}`}
                  className={`solution-subtask ${group.passed ? 'passed' : 'pending'}`}
                >
                  <span className="solution-subtask-name">{group.name}</span>
                  <strong className="solution-subtask-score">
                    {group.score.toLocaleString()}
                    <span>점</span>
                  </strong>
                  {multipleSets && (
                    <span className="solution-subtask-set">
                      {group.testset}
                    </span>
                  )}
                  {group.blocked ? (
                    <span className="solution-subtask-note">
                      의존 그룹 미통과
                    </span>
                  ) : !group.complete ? (
                    <span className="solution-subtask-note">
                      전체 실행 필요
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {solution.score_scope_complete === false && (
            <p className="solution-judge-note">
              일부 테스트만 실행했으므로 세트 전체 점수는 계산하지 않았습니다.
            </p>
          )}
        </section>
      )}
      {hasRuns && (
        <p className="solution-judge-note">
          실제 채점 기록 · 시간·메모리는 요청별 최댓값입니다. 개별 테스트의 값은
          아래 결과에서 확인하세요.
        </p>
      )}
      {solution.judge_runs?.map((record) => (
        <div className="solution-judge-run" key={record.id}>
          <div className="solution-judge-agent">
            <span>{record.node_name || '채점 노드 정보 없음'}</span>
            {record.agent_version && <span>v{record.agent_version}</span>}
            <span>
              {record.testset} · {record.testcase_count}개 테스트
            </span>
          </div>
          <dl className="solution-judge-metrics">
            <div>
              <dt>최대 실행 시간</dt>
              <dd>
                {record.runtime_ms == null
                  ? '미제공'
                  : `${record.runtime_ms}ms`}
              </dd>
            </div>
            <div>
              <dt>최대 메모리</dt>
              <dd>
                {record.memory_kb == null
                  ? '미제공'
                  : bytes(record.memory_kb * 1024)}
              </dd>
            </div>
          </dl>
          {(record.compile_message ||
            (record.status === 'system_error' && record.judge_message)) && (
            <BoundedText className="solution-judge-message">
              {record.compile_message || record.judge_message}
            </BoundedText>
          )}
        </div>
      ))}
      {solution.complete === false && (
        <p className="solution-judge-note">
          일부 테스트의 판정이 확인되지 않았습니다. 실행 범위와 오류를
          확인하세요.
        </p>
      )}
    </section>
  );
}
