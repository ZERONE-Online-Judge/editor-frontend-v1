import { PaginatedList } from '../../components/Pagination';
import { useState } from 'react';
import type { CaseResult, Job, StressSolutionResult } from '../../lib/types';
import { bytes, tags } from '../../lib/api';
import { Badge, Icon } from '../../components/ui';
import CaseResultGrid from './CaseResultGrid';

const pageSize = 100;
const cpu = (value: number | null) => (value == null ? '미제공' : `${value}ms`);
const memory = (value: number | null) =>
  value == null ? '미제공' : bytes(value * 1024);

function Metrics({
  cpuMs,
  memoryKb,
}: {
  cpuMs: number | null;
  memoryKb: number | null;
}) {
  return (
    <dl className="solution-judge-metrics">
      <div>
        <dt>최대 실행시간</dt>
        <dd>{cpu(cpuMs)}</dd>
      </div>
      <div>
        <dt>최대 메모리</dt>
        <dd>{memory(memoryKb)}</dd>
      </div>
    </dl>
  );
}

function SolutionCases({
  solution,
  onSelect,
  active,
}: {
  solution: StressSolutionResult;
  active: boolean;
  onSelect: (row: CaseResult, name: string) => void;
}) {
  const [requestedPage, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(solution.cases.length / pageSize));
  const page = Math.min(requestedPage, pages - 1);
  const cases = solution.cases.slice(page * pageSize, (page + 1) * pageSize);
  return (
    <details className="solution-result" open>
      <summary className="solution-result-heading">
        <span className="solution-result-toggle" aria-hidden="true">
          <Icon name="down" size={16} />
        </span>
        <strong>{solution.name}</strong>
        <span className="solution-result-badges">
          <Badge tone="accent">
            {solution.role === 'reference'
              ? '기준 풀이'
              : `기대 ${solution.tag} · ${tags[solution.tag as keyof typeof tags] || solution.tag}`}
          </Badge>
          <Badge tone="neutral">
            실행 {solution.cases.length.toLocaleString()}개
          </Badge>
        </span>
      </summary>
      <div className="solution-result-body">
        <div className="solution-judge-summary">
          <Metrics
            cpuMs={solution.max_cpu_ms}
            memoryKb={solution.max_memory_kb}
          />
        </div>
        {solution.cases.length ? (
          <section
            className="solution-testset-cases"
            aria-label={`${solution.name} 생성 테스트 결과`}
          >
            <h4 className="muted small">
              {solution.cases[0].testset} · 생성 테스트
            </h4>
            <CaseResultGrid
              cases={cases}
              solutionName={solution.name}
              onSelect={(row) => onSelect(row, solution.name)}
            />
            {pages > 1 && (
              <nav
                className="stress-case-pagination"
                aria-label={`${solution.name} 테스트 페이지`}
              >
                <button
                  type="button"
                  className="button small"
                  disabled={page === 0}
                  onClick={() => setPage(page - 1)}
                >
                  이전
                </button>
                <span className="muted small">
                  {page + 1} / {pages}페이지 · {page * pageSize + 1}–
                  {page * pageSize + cases.length} / {solution.cases.length}개
                </span>
                <button
                  type="button"
                  className="button small"
                  disabled={page + 1 >= pages}
                  onClick={() => setPage(page + 1)}
                >
                  다음
                </button>
              </nav>
            )}
          </section>
        ) : (
          <p className="muted small stress-cases-empty">
            {active
              ? '아직 저장된 실행 결과가 없습니다.'
              : '이 풀이의 저장된 테스트 실행 결과가 없습니다.'}
          </p>
        )}
      </div>
    </details>
  );
}

export default function StressTestResults({
  job,
  onSelect,
}: {
  job: Job;
  onSelect: (row: CaseResult, name: string) => void;
}) {
  const active = job.status === 'queued' || job.status === 'running';
  const solutions = job.result.stress_results;
  const summary = job.result.stress_result_summary;
  if (!solutions)
    return active ? null : (
      <p className="notice neutral small">
        이전 스트레스 기록은 반례만 보관해 통과한 테스트별 결과와 최대 자원을
        확인할 수 없습니다. 아래 반례 기록은 그대로 볼 수 있으며, 새 실행부터
        전체 실행 결과를 보관합니다.
      </p>
    );
  return (
    <section
      className="section-stack stress-test-results"
      aria-label="스트레스 풀이별 테스트 결과"
    >
      <div className="section-heading">
        <h4>풀이별 테스트 결과</h4>
        <span className="muted small">
          테스트를 누르면 입출력과 실행 정보를 확인합니다.
        </span>
      </div>
      {summary && (
        <section
          className="notice neutral stress-resource-summary"
          aria-label={
            active ? '현재까지 스트레스 실행 요약' : '스트레스 실행 요약'
          }
        >
          <strong>
            {active ? '현재까지' : '저장된 실행 범위'} · 생성 테스트{' '}
            {summary.testcase_count.toLocaleString()}개 · 풀이 실행{' '}
            {summary.executions.toLocaleString()}회
          </strong>
          <Metrics
            cpuMs={summary.max_cpu_ms}
            memoryKb={summary.max_memory_kb}
          />
        </section>
      )}
      <p className="muted small">
        시간은 CPU 실행시간이며, 최댓값은 생성 테스트의 풀이 실행만 집계합니다.
        생성기·Validator·Checker와 반례 축소 시도는 제외합니다. 기준 풀이의 AC는
        정상 실행을 뜻하며, 그 출력을 비교 풀이의 기대 출력으로 사용합니다.
      </p>
      {job.result.stress?.stop_reason === 'evidence_limit' && (
        <p className="notice neutral small">
          입력·출력 보관 한도에 도달해 종료했습니다. 아래에는 저장된 테스트와
          실제 실행한 풀이의 결과만 표시합니다.
        </p>
      )}
      <PaginatedList
        items={solutions}
        resetKey={job.id}
        label="스트레스 풀이 결과"
      >
        {(rows) =>
          rows.map((solution) => (
            <SolutionCases
              key={`${job.id}/${solution.name}`}
              solution={solution}
              onSelect={onSelect}
              active={active}
            />
          ))
        }
      </PaginatedList>
    </section>
  );
}
