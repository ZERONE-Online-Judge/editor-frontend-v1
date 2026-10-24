import Pagination from '../../components/Pagination';
import { usePagination } from '../../lib/pagination';
import type { CaseResult } from '../../lib/types';

export default function CaseResultGrid({
  cases,
  onSelect,
  solutionName = '',
}: {
  cases: CaseResult[];
  onSelect: (row: CaseResult) => void;
  solutionName?: string;
}) {
  const paging = usePagination(
    cases,
    `${solutionName}/${cases[0]?.testset}`,
    100,
  );
  return (
    <>
      <div className="case-grid">
        {paging.items.map((result) => (
          <button
            type="button"
            key={`${result.testset}-${result.index}`}
            className={`case-chip ${result.verdict === 'AC' ? 'accepted' : result.verdict === 'JUDGE_ERROR' ? 'error' : 'rejected'}`}
            aria-label={`${solutionName ? `${solutionName} · ` : ''}${result.testset} · 테스트 #${result.index} · ${result.verdict}`}
            title={`${result.testset} · ${result.index ? `#${result.index}` : '컴파일·실행 환경'}${result.seed == null ? '' : ` · 시드 ${result.seed}`} · CPU ${result.cpu_ms == null ? '개별 값 미제공' : `${result.cpu_ms}ms`} · 메모리 ${result.memory_kb == null ? '개별 값 미제공' : `${result.memory_kb}KiB`}`}
            onClick={() => onSelect(result)}
          >
            <span>{result.index ? `#${result.index}` : '환경'}</span>
            <strong>{result.verdict}</strong>
            <small>
              {result.cpu_ms == null ? '시간 미제공' : `${result.cpu_ms}ms`}
            </small>
          </button>
        ))}
      </div>
      <Pagination {...paging} label={`${solutionName} 테스트 결과`} />
    </>
  );
}
