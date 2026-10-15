import type { Job } from '../../lib/types';

export default function StressDiscoveryStatistics({
  job,
  retryUncovered,
  retryBusy,
}: {
  job: Job;
  retryUncovered?: (names: string[]) => void;
  retryBusy?: boolean;
}) {
  const active = job.status === 'queued' || job.status === 'running';
  const missing =
    job.result.uncovered_candidates ||
    job.result.candidate_summaries
      ?.filter((row) => !row.first_counterexample_id)
      .map((row) => row.name) ||
    [];
  return (
    <>
      {missing.length > 0 && !active && (
        <section className="notice neutral stress-uncovered">
          <strong>아직 반례를 찾지 못한 풀이 · {missing.length}개</strong>
          <p>{missing.join(' · ')}</p>
          <p className="muted small">
            실행한 입력에서는 수집 대상 판정이 발견되지 않았습니다. 풀이가 모든
            입력에서 올바르다는 뜻은 아닙니다.
          </p>
          {retryUncovered && (
            <button
              type="button"
              className="button small"
              disabled={retryBusy}
              onClick={() => retryUncovered(missing)}
            >
              미검출 풀이만 다음 시드부터 실행
            </button>
          )}
        </section>
      )}
      {job.result.pattern_summaries?.length ? (
        <details className="stress-pattern-statistics">
          <summary>
            패턴별 발견률 · {job.result.pattern_summaries.length}개 패턴
          </summary>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>패턴</th>
                  <th>생성 시도</th>
                  <th>비교 입력</th>
                  <th>반례 입력</th>
                  <th>발견률</th>
                  <th>검출 풀이</th>
                </tr>
              </thead>
              <tbody>
                {job.result.pattern_summaries.map((pattern) => (
                  <tr key={pattern.index}>
                    <td>
                      <strong>{pattern.name}</strong>
                      <div
                        className="subtext stress-wrap"
                        title={pattern.command}
                      >
                        {pattern.command}
                      </div>
                    </td>
                    <td>
                      {pattern.attempts}회
                      <div className="subtext">
                        중복 {pattern.duplicates_skipped}개 제외
                      </div>
                    </td>
                    <td>{pattern.compared_inputs}개</td>
                    <td>{pattern.counterexample_inputs}개</td>
                    <td>
                      {pattern.compared_inputs
                        ? `${((100 * pattern.counterexample_inputs) / pattern.compared_inputs).toFixed(1)}%`
                        : '미비교'}
                    </td>
                    <td className="stress-wrap">
                      {Object.entries(pattern.solution_findings)
                        .map(([name, count]) => `${name} ${count}회`)
                        .join(' · ') || '미발견'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted small">
            발견률은 실제 비교한 서로 다른 입력 중 반례가 나온 비율입니다.
            미검출 집중 모드에서는 패턴마다 비교 대상 풀이가 달라질 수 있습니다.
          </p>
        </details>
      ) : null}
    </>
  );
}
