import { useMemo, useState } from 'react';
import type { Job, CaseResult } from '../../lib/types';

export default function TestVerdictMatrix({ job }: { job: Job }) {
  const [mode, setMode] = useState('verdict'),
    [coverOnly, setCoverOnly] = useState(false);
  const matrix = job.result.test_matrix;
  const observed = useMemo(
    () =>
      new Map<string, CaseResult>(
        job.result.solutions?.flatMap((s) =>
          s.cases.map(
            (c) => [`${s.name}\0${c.testset}/${c.index}`, c] as const,
          ),
        ),
      ),
    [job.result.solutions],
  );
  if (!matrix) return null;
  const selected = new Set(matrix.cover.test_ids);
  const rows = matrix.rows.filter((row) => !coverOnly || selected.has(row.id));
  return (
    <section className="test-verdict-matrix card compact">
      <div className="section-heading">
        <div>
          <h3>테스트별 검출력</h3>
          <p>
            저장된 실제 실행 기록을 비교합니다. 미실행은 통과로 간주하지 않으며,
            배치 최댓값을 개별 테스트 시간·메모리로 표시하지 않습니다.
          </p>
        </div>
      </div>
      {matrix.uncovered_solutions.length > 0 && (
        <p className="notice">
          아직 검출하지 못한 풀이: {matrix.uncovered_solutions.join(' · ')}
        </p>
      )}
      {!matrix.targets.length && (
        <p className="muted small">
          이번 실행에는 WA·TL·ML 등 검출 대상 풀이가 없습니다.
        </p>
      )}
      {matrix.unassigned_errors.length > 0 && (
        <p className="notice error">
          테스트 번호가 없는 컴파일·환경 오류:{' '}
          {matrix.unassigned_errors
            .map((e) => `${e.solution}: ${e.verdict}`)
            .join(' · ')}
        </p>
      )}
      <div className="inline-form">
        <label>
          비교할 값
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="verdict">판정</option>
            <option value="cpu">CPU 시간</option>
            <option value="memory">최대 메모리</option>
          </select>
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={coverOnly}
            onChange={(e) => setCoverOnly(e.target.checked)}
          />
          {matrix.cover.method === 'exact' ? '최소' : '근사'} 커버{' '}
          {matrix.cover.test_ids.length}개만 보기
        </label>
      </div>
      <p className="muted small">
        관측한 오답 풀이 {matrix.cover.covered_solutions}개를 검출하는
        선택입니다. 검출하지 못한 풀이까지 잡는 집합이라는 뜻은 아닙니다. 제거
        영향도 현재 실행 기록을 기준으로 계산합니다.
      </p>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>테스트</th>
              {matrix.solutions.map((name) => (
                <th key={name}>{name}</th>
              ))}
              <th>검출력</th>
              <th>검토</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className={selected.has(row.id) ? 'matrix-cover-row' : ''}
              >
                <th>
                  {row.testset} #{row.index}
                  <small className="muted block">{row.group}</small>
                </th>
                {matrix.solutions.map((name) => {
                  const cell = observed.get(`${name}\0${row.id}`);
                  return (
                    <td
                      key={name}
                      title={
                        cell
                          ? `${cell.verdict} · CPU ${cell.cpu_ms ?? '—'}ms · 메모리 ${cell.memory_kb ?? '—'}KiB\n${cell.comment}`
                          : '개별 실행 기록 없음'
                      }
                    >
                      {!cell
                        ? row.skipped.includes(name)
                          ? '제외(NR)'
                          : '미실행'
                        : mode === 'verdict'
                          ? cell.verdict
                          : mode === 'cpu'
                            ? cell.cpu_ms == null
                              ? '—'
                              : `${cell.cpu_ms}ms`
                            : cell.memory_kb == null
                              ? '—'
                              : `${cell.memory_kb.toLocaleString()}KiB`}
                    </td>
                  );
                })}
                <td>
                  {row.detected.length}
                  <small className="muted block">
                    {row.detected.join(' · ')}
                  </small>
                </td>
                <td>
                  {row.no_detection && (
                    <span className="block">오답 검출 없음</span>
                  )}
                  {row.missing_targets.length > 0 && (
                    <span className="block">
                      미확인 {row.missing_targets.length}개
                    </span>
                  )}
                  {row.same_pattern_as.length > 0 && (
                    <small className="block">
                      같은 판정 패턴: {row.same_pattern_as.join(', ')}
                      {row.same_pattern_count > 5
                        ? ` 외 ${row.same_pattern_count - 5}개`
                        : ''}
                    </small>
                  )}
                  {row.exclusive_detections.length > 0 && (
                    <strong className="block">
                      제거 시 관측 검출 소실:{' '}
                      {row.exclusive_detections.join(', ')}
                    </strong>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small">
        같은 판정 패턴이라도 같은 입력이나 같은 결함을 뜻하지 않습니다. 선택
        기능은 테스트를 삭제하지 않습니다.
      </p>
    </section>
  );
}
