import { useState, type ReactNode } from 'react';
import { post, tags } from '../../lib/api';
import type {
  Counterexample,
  CounterexampleFinding,
  Job,
} from '../../lib/types';
import { Notice } from '../../components/ui';

const stopReasons: Record<string, string> = {
  duration: '실행 시간 도달',
  iterations: '반복 횟수 도달',
  first_counterexample: '첫 반례 발견',
  counterexample_target: '목표 반례 수 도달',
};

export default function StressCounterexamples({
  job,
  problemId,
  testsets,
  allowed,
  save,
  applied,
  evidence,
}: {
  job: Job;
  problemId: string;
  testsets: string[];
  allowed: boolean;
  save: () => Promise<number>;
  applied: () => Promise<void>;
  evidence: (
    example: Counterexample,
    finding: CounterexampleFinding,
  ) => ReactNode;
}) {
  const legacy = job.result.counterexample;
  const examples: Counterexample[] =
    job.result.counterexamples ||
    (legacy
      ? [
          {
            ...legacy,
            id: legacy.input_sha.slice(0, 32),
            findings: [
              {
                solution: String(job.options.candidate || '비교 풀이'),
                verdict: legacy.verdict,
                actual_sha: legacy.actual_sha,
                comment: legacy.comment,
              },
            ],
          },
        ]
      : []);
  const [selection, setSelection] = useState<{ id: string; ids: string[] }>({
    id: '',
    ids: [],
  });
  const selected = selection.id === job.id ? selection.ids : [];
  const [target, setTarget] = useState({ id: '', name: '' });
  const setName =
    target.id === job.id
      ? target.name
      : testsets.includes(String(job.options.testset))
        ? String(job.options.testset)
        : testsets[0] || '';
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{
    id: string;
    message: string;
    error: boolean;
  } | null>(null);
  const active = job.status === 'queued' || job.status === 'running';
  const stats = job.result.stress;
  async function add() {
    setBusy(true);
    try {
      const version = await save();
      const result = await post<{
        added_count: number;
        duplicate_count: number;
      }>(`/problems/${problemId}/jobs/${job.id}/counterexamples/apply`, {
        version,
        testset: setName,
        counterexample_ids: selected,
      });
      await applied();
      setNotice({
        id: job.id,
        message: `${result.added_count}개를 ${setName}에 저장했습니다. 중복 ${result.duplicate_count}개는 추가하지 않았습니다.`,
        error: false,
      });
      setSelection({ id: job.id, ids: [] });
    } catch (e) {
      setNotice({ id: job.id, message: (e as Error).message, error: true });
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="section-stack stress-results">
      {stats && (
        <section className="notice neutral" aria-label="스트레스 테스트 진행">
          <strong>
            {stats.iterations_completed.toLocaleString()}회 완료 ·{' '}
            {stats.elapsed_seconds.toFixed(1)}초 경과 · 반례 입력{' '}
            {stats.counterexample_count}개
          </strong>
          <p className="muted small">
            {stats.stop_reason
              ? `종료 이유: ${stopReasons[stats.stop_reason] || stats.stop_reason}`
              : active
                ? `반복 ${stats.iterations_started} 처리 중`
                : job.status === 'cancelled'
                  ? '사용자 취소로 종료'
                  : job.status === 'failed'
                    ? '오류로 종료'
                    : '실행 종료'}{' '}
            · 중복 입력 {stats.duplicates_skipped}개 제외
          </p>
        </section>
      )}
      {job.result.candidate_summaries?.length ? (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>비교 풀이</th>
                <th>기대 판정</th>
                <th>실행 수</th>
                <th>관측한 판정</th>
                <th>첫 반례</th>
              </tr>
            </thead>
            <tbody>
              {job.result.candidate_summaries.map((row) => (
                <tr key={row.name}>
                  <td>{row.name}</td>
                  <td>{tags[row.tag as keyof typeof tags] || row.tag}</td>
                  <td>{row.tested}</td>
                  <td>
                    {Object.entries(row.verdicts)
                      .map(([code, count]) => `${code} ${count}회`)
                      .join(' · ') || '대기'}
                  </td>
                  <td>
                    {row.first_counterexample_id
                      ? `반례 #${examples.findIndex((item) => item.id === row.first_counterexample_id) + 1}`
                      : '미발견'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {examples.length ? (
        <>
          <div className="section-heading">
            <h4>유효한 반례 입력 {examples.length}개</h4>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={selected.length === examples.length}
                onChange={(e) =>
                  setSelection({
                    id: job.id,
                    ids: e.target.checked
                      ? examples.map((item) => item.id)
                      : [],
                  })
                }
              />
              전체 선택
            </label>
          </div>
          {examples.map((example, index) => (
            <section className="counterexample card compact" key={example.id}>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={selected.includes(example.id)}
                  onChange={(e) =>
                    setSelection({
                      id: job.id,
                      ids: e.target.checked
                        ? [...selected, example.id]
                        : selected.filter((id) => id !== example.id),
                    })
                  }
                />
                <strong>반례 #{index + 1}</strong>
                <span className="muted small">
                  반복 {example.iteration} ·{' '}
                  {example.findings
                    .map((item) => `${item.solution}: ${item.verdict}`)
                    .join(' · ')}
                </span>
              </label>
              <details>
                <summary>입력·출력과 풀이별 판정 보기</summary>
                {example.findings.map((finding) => (
                  <section className="section-stack" key={finding.solution}>
                    <h4>
                      {finding.solution} · {finding.verdict}
                    </h4>
                    {evidence(example, finding)}
                    {finding.comment && (
                      <p
                        className="muted small"
                        style={{ whiteSpace: 'pre-wrap' }}
                      >
                        {finding.comment}
                      </p>
                    )}
                  </section>
                ))}
              </details>
            </section>
          ))}
          <div className="inline-form">
            <label>
              추가할 테스트 세트
              <select
                value={setName}
                onChange={(e) =>
                  setTarget({ id: job.id, name: e.target.value })
                }
              >
                {testsets.map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </select>
            </label>
            <button
              className="button primary"
              disabled={
                !allowed || active || busy || !selected.length || !setName
              }
              onClick={() => void add()}
            >
              선택한 {selected.length}개 반례를 테스트에 추가
            </button>
          </div>
          <p className="muted small">
            쓰기 권한이 있는 협업자만 추가할 수 있습니다. 내 작업 사본에 자동
            저장되며, 커밋해야 공유됩니다. 같은 입력은 중복 추가하지 않습니다.
          </p>
        </>
      ) : (
        !active && (
          <p className="muted">
            {job.status === 'completed'
              ? '실행한 범위에서 수집할 판정의 반례를 찾지 못했습니다. 모든 입력에 대한 정답 증명을 뜻하지는 않습니다.'
              : '종료 전까지 수집된 반례가 없습니다. 진행 기록과 종료 사유를 확인하세요.'}
          </p>
        )
      )}
      {notice?.id === job.id && (
        <Notice tone={notice.error ? 'error' : 'success'}>
          {notice.message}
        </Notice>
      )}
    </div>
  );
}
