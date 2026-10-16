import type { Job } from '../../lib/types';
import { bytes } from '../../lib/api';

type Solution = NonNullable<Job['result']['solutions']>[number];

export default function SolutionJudgeSummary({
  solution,
}: {
  solution: Solution;
}) {
  if (!solution.judge_runs?.length) return null;
  return (
    <section className="solution-judge-summary" aria-label="ZOJ 채점 기록">
      <p className="solution-judge-note">
        실제 채점 기록 · 시간·메모리는 요청별 최댓값입니다. 개별 테스트의 값은
        아래 결과에서 확인하세요.
      </p>
      {solution.judge_runs.map((record) => (
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
            <pre className="solution-judge-message">
              {record.compile_message || record.judge_message}
            </pre>
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
