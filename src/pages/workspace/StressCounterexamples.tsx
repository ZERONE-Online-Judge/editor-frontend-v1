import { useState, type ReactNode } from 'react';
import { post, tags, bytes } from '../../lib/api';
import type {
  Counterexample,
  CounterexampleFinding,
  Job,
} from '../../lib/types';
import { Notice } from '../../components/ui';
import StressDiscoveryStatistics from './StressDiscoveryStatistics';
import { DownloadActions } from '../../components/Downloads';
import { counterexampleDownloads } from '../../lib/downloads';

const stopReasons: Record<string, string> = {
  duration: '실행 시간 도달',
  iterations: '반복 횟수 도달',
  first_counterexample: '첫 반례 발견',
  counterexample_target: '목표 반례 수 도달',
  all_candidates_covered: '모든 비교 풀이에서 반례 발견',
  evidence_limit: '수집 자료 한도 도달',
  collection_limit: '반례 보관 한도 도달',
};
const reductionReasons: Record<string, string> = {
  running: '축소 중',
  finished: '축소 탐색 완료',
  budget: '축소 한도 도달',
  input_limit: '축소 입력 크기 한도',
  unsupported: '지원하지 않는 입력 형식',
  interrupted: '작업 중단',
  evidence_limit: '수집 자료 한도 도달',
};

export default function StressCounterexamples({
  job,
  problemId,
  testsets,
  allowed,
  save,
  applied,
  evidence,
  testsetGroups = {},
  advanced = false,
  retryUncovered,
  retryBusy,
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
  testsetGroups?: Record<string, string[]>;
  advanced?: boolean;
  retryUncovered?: (names: string[]) => void;
  retryBusy?: boolean;
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
  const [filter, setFilter] = useState({ id: '', solution: '', verdict: '' });
  const currentFilter =
    filter.id === job.id ? filter : { id: job.id, solution: '', verdict: '' };
  const visibleExamples = examples.filter((example) =>
    example.findings.some(
      (finding) =>
        (!currentFilter.solution ||
          finding.solution === currentFilter.solution) &&
        (!currentFilter.verdict || finding.verdict === currentFilter.verdict),
    ),
  );
  const solutionNames = [
    ...new Set(
      examples.flatMap((example) =>
        example.findings.map((finding) => finding.solution),
      ),
    ),
  ];
  const verdictNames = [
    ...new Set(
      examples.flatMap((example) =>
        example.findings.map((finding) => finding.verdict),
      ),
    ),
  ];
  const [originalsOnly, setOriginalsOnly] = useState({ id: '', value: false });
  const useReduced = originalsOnly.id !== job.id || !originalsOnly.value;
  const [groupTarget, setGroupTarget] = useState({
    id: '',
    testset: '',
    value: '',
  });
  const groups = testsetGroups[setName] || [];
  const savedGroup =
    typeof job.options.group === 'string' &&
    job.options.testset === setName &&
    groups.includes(job.options.group)
      ? job.options.group
      : '';
  const group =
    groupTarget.id === job.id && groupTarget.testset === setName
      ? groupTarget.value
      : savedGroup;
  async function add() {
    setBusy(true);
    try {
      const version = await save();
      const result = await post<{
        added_count: number;
        duplicate_count: number;
        needs_context_validation?: boolean;
      }>(`/problems/${problemId}/jobs/${job.id}/counterexamples/apply`, {
        version,
        testset: setName,
        counterexample_ids: selected,
        ...(advanced ? { group, use_minimized: useReduced } : {}),
      });
      await applied();
      setNotice({
        id: job.id,
        message: `${result.added_count}개를 ${setName}${group ? ` / ${group}` : ''}에 저장했습니다. 중복 ${result.duplicate_count}개는 추가하지 않았습니다.${result.needs_context_validation ? ' 검증 당시와 다른 세트·그룹이므로 입력·정답 생성에서 Validator를 다시 실행하세요.' : ''}`,
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
                ? stats.parallelism && stats.parallelism > 1
                  ? `${stats.parallelism}개 병렬 처리 중 · ${stats.iterations_scheduled ?? stats.iterations_started}회 배정`
                  : `반복 ${stats.iterations_started} 처리 중`
                : job.status === 'cancelled'
                  ? '사용자 취소로 종료'
                  : job.status === 'failed'
                    ? '오류로 종료'
                    : '실행 종료'}{' '}
            · 중복 입력 {stats.duplicates_skipped}개 제외
            {stats.phase === 'minimize' && ' · 발견한 반례 축소 검증 중'}
          </p>
        </section>
      )}
      <StressDiscoveryStatistics
        job={job}
        retryUncovered={retryUncovered}
        retryBusy={retryBusy}
      />
      {!job.result.stress_results && job.result.candidate_summaries?.length ? (
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
          <DownloadActions
            problemId={problemId}
            files={counterexampleDownloads(examples, useReduced)}
            selectedFiles={counterexampleDownloads(
              examples,
              useReduced,
              selected,
            )}
            filename={`stress-${job.id.slice(0, 12)}.zip`}
            selectionLabel={`선택 다운로드${selected.length ? ` (${selected.length}개 반례)` : ''}`}
            note="입력·기대 출력과 모든 비교 풀이의 실제 출력을 함께 받습니다. 아래 원본·축소본 선택을 그대로 적용하며, 실행 중에도 수집된 반례를 다운로드할 수 있습니다."
          />
          <div className="section-heading">
            <h4>
              유효한 반례 입력 {examples.length}개
              {visibleExamples.length !== examples.length
                ? ` · 표시 ${visibleExamples.length}개`
                : ''}
            </h4>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={
                  visibleExamples.length > 0 &&
                  visibleExamples.every((item) => selected.includes(item.id))
                }
                disabled={!visibleExamples.length}
                onChange={(e) =>
                  setSelection({
                    id: job.id,
                    ids: e.target.checked
                      ? [
                          ...new Set([
                            ...selected,
                            ...visibleExamples.map((item) => item.id),
                          ]),
                        ]
                      : selected.filter(
                          (id) =>
                            !visibleExamples.some((item) => item.id === id),
                        ),
                  })
                }
              />
              표시된 반례 전체 선택
            </label>
          </div>
          <div className="form-grid stress-counterexample-filters">
            <label>
              검출한 풀이로 분류
              <select
                value={currentFilter.solution}
                onChange={(event) =>
                  setFilter({
                    ...currentFilter,
                    id: job.id,
                    solution: event.target.value,
                  })
                }
              >
                <option value="">모든 풀이</option>
                {solutionNames.map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </select>
            </label>
            <label>
              관측 판정으로 분류
              <select
                value={currentFilter.verdict}
                onChange={(event) =>
                  setFilter({
                    ...currentFilter,
                    id: job.id,
                    verdict: event.target.value,
                  })
                }
              >
                <option value="">모든 판정</option>
                {verdictNames.map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </select>
            </label>
          </div>
          {job.result.coverage?.example_ids.length ? (
            <div className="stress-cover-selection">
              <button
                type="button"
                className="button small"
                disabled={active}
                onClick={() =>
                  setSelection({
                    id: job.id,
                    ids: job.result.coverage!.example_ids,
                  })
                }
              >
                {job.result.coverage.method === 'exact'
                  ? '최소 커버 선택'
                  : '중복 커버 줄여 선택'}{' '}
                · {job.result.coverage.example_ids.length}개
              </button>
              <p className="muted small">
                전체 발견 반례에서 관측한 풀이·판정 조합{' '}
                {job.result.coverage.covered_pairs}개를 모두 유지합니다.
                {job.result.coverage.method === 'greedy'
                  ? ' 많은 반례에는 근사 선택을 사용하며 최소 개수를 보장하지 않습니다.'
                  : ''}{' '}
                같은 원인인지 추정해 합치는 기능은 아닙니다.
              </p>
            </div>
          ) : null}
          {examples.some((example) => example.minimized) && (
            <label className="checkbox">
              <input
                type="checkbox"
                checked={useReduced}
                onChange={(event) =>
                  setOriginalsOnly({ id: job.id, value: !event.target.checked })
                }
              />
              검증된 축소본 보기·등록에 사용
              <small>해제하면 원본 입력과 판정을 확인하고 등록합니다.</small>
            </label>
          )}
          {!visibleExamples.length && (
            <p className="muted small">
              선택한 분류에 해당하는 반례가 없습니다.
            </p>
          )}
          {visibleExamples.map((original) => {
            const example =
              useReduced && original.minimized
                ? { ...original, ...original.minimized }
                : original;
            const index = examples.findIndex((item) => item.id === original.id);
            return (
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
                    반복 {example.iteration}
                    {example.seed != null
                      ? ` · 시드 ${example.seed}`
                      : ''} ·{' '}
                    {example.findings
                      .map((item) => `${item.solution}: ${item.verdict}`)
                      .join(' · ')}
                  </span>
                </label>
                {original.pattern_name && (
                  <p className="muted small">
                    생성 패턴 · {original.pattern_name}
                    {original.range_values?.length
                      ? ` · ${original.range_values.map((draw) => `${draw.expression} → ${draw.value}`).join(' · ')}`
                      : ''}
                  </p>
                )}
                {original.minimization && (
                  <div className="notice neutral stress-reduction-summary">
                    <strong>
                      {original.minimized
                        ? `검증된 축소본 · ${bytes(original.minimization.original_bytes)} → ${bytes(original.minimization.final_bytes)}`
                        : '추가 축소본 없음'}
                    </strong>
                    <p className="muted small">
                      {reductionReasons[original.minimization.status] ||
                        original.minimization.status}{' '}
                      · 후보 {original.minimization.attempts}개 검사 ·{' '}
                      {original.minimization.accepted_steps}단계 채택 ·{' '}
                      {original.minimization.elapsed_seconds.toFixed(1)}초
                    </p>
                    {original.minimized && (
                      <p className="muted small">
                        원래 실패한 모든 풀이·판정을 Validator와 기준 풀이를
                        거쳐 다시 확인했습니다. 생성 명령은 원본 입력의 명령이며
                        축소본은 별도 저장된 입력입니다.
                      </p>
                    )}
                  </div>
                )}
                {example.command && (
                  <div className="stress-command-block">
                    <strong>
                      {useReduced && original.minimized
                        ? '축소 전 원본을 생성한 명령'
                        : '이 반례를 생성한 명령'}
                    </strong>
                    <pre className="stress-command">
                      <code>{example.command}</code>
                    </pre>
                  </div>
                )}
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
            );
          })}
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
            {advanced && (
              <label>
                등록할 테스트 그룹
                <select
                  value={group}
                  onChange={(event) =>
                    setGroupTarget({
                      id: job.id,
                      testset: setName,
                      value: event.target.value,
                    })
                  }
                >
                  <option value="">그룹 없음</option>
                  {groups.map((name) => (
                    <option key={name}>{name}</option>
                  ))}
                </select>
              </label>
            )}
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
          {advanced &&
            (setName !== job.options.testset ||
              group !== (job.options.group || '')) && (
              <p className="muted small">
                검증 당시와 다른 세트·그룹입니다. 등록 후 입력·정답 생성에서
                해당 그룹의 Validator 조건을 다시 확인하세요.
              </p>
            )}
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
