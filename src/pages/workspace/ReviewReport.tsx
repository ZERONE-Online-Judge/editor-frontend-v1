import Pagination from '../../components/Pagination';
import { usePagination } from '../../lib/pagination';
import Select from '../../components/Select';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { useWorkspace } from '../../lib/workspace';
import { Badge, SectionHeading } from '../../components/ui';

export type ReviewReportData = {
  document_hash: string;
  generated_at: number;
  categories: Record<string, string>;
  counts: Record<string, number>;
  evidence_jobs: string[];
  method: string;
  items: {
    code: string;
    severity: string;
    category: string;
    message: string;
    section: string;
    evidence: string;
    job_id?: string | null;
  }[];
};
const labels: Record<string, string> = {
  error: '필수 오류',
  warning: '경고',
  recommendation: '권장 사항',
  info: '확인 범위',
};
export function ReviewReportView({
  report,
  problemId,
  stale = false,
}: {
  report: ReviewReportData;
  problemId: string;
  stale?: boolean;
}) {
  const [category, setCategory] = useState('all');
  const [severity, setSeverity] = useState('all');
  const items = report.items.filter(
    (item) =>
      (category === 'all' || item.category === category) &&
      (severity === 'all' || item.severity === severity),
  );
  const paging = usePagination(
    items,
    `${problemId}/${report.document_hash}/${category}/${severity}`,
  );
  return (
    <>
      {stale && (
        <p className="notice warning" role="status">
          저장 전 편집 내용이 있습니다. 아래 보고서는 이전 저장 자료 기준입니다.
          저장 후 새로고침하세요.
        </p>
      )}
      <div className="review-report-counts">
        {Object.entries(labels).map(([key, label]) => (
          <button
            type="button"
            key={key}
            className={`button small ${severity === key ? 'primary' : ''}`}
            onClick={() => setSeverity(severity === key ? 'all' : key)}
          >
            {label} {report.counts[key] || 0}
          </button>
        ))}
      </div>
      <label className="review-report-filter">
        분류{' '}
        <Select
          aria-label="검수 보고서 분류"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        >
          <option value="all">전체 분류</option>
          {Object.entries(report.categories).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </Select>
      </label>
      <div className="review-report-list">
        {paging.items.map((item, index) => (
          <article key={`${item.code}-${index}`}>
            <div>
              <Badge
                tone={
                  item.severity === 'error'
                    ? 'danger'
                    : item.severity === 'warning'
                      ? 'warning'
                      : 'neutral'
                }
              >
                {labels[item.severity]}
              </Badge>
              <small>{report.categories[item.category]}</small>
            </div>
            <strong>{item.message}</strong>
            {item.evidence && <p>{item.evidence}</p>}
            <Link
              to={`/problems/${problemId}/${item.section}${item.job_id ? `?job=${item.job_id}` : ''}`}
            >
              {item.job_id ? '근거 실행 기록 보기' : '관련 항목 보기'} →
            </Link>
          </article>
        ))}
        {!items.length && (
          <p className="muted">선택한 분류에 표시할 항목이 없습니다.</p>
        )}
      </div>
      <Pagination {...paging} label="검수 보고서" />
      <p className="muted review-report-method">
        {report.method}
        <br />
        자료 {report.document_hash.slice(0, 8)} · 대응 작업{' '}
        {report.evidence_jobs.length}개 ·{' '}
        {new Date(report.generated_at * 1000).toLocaleString('ko-KR')}
      </p>
    </>
  );
}
export default function ReviewReport() {
  const { data, dirty, busy } = useWorkspace();
  const [report, setReport] = useState<ReviewReportData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let cancelled = false;
    api<ReviewReportData>(`/problems/${data.problem.id}/review-report`)
      .then((value) => {
        if (!cancelled) {
          setReport(value);
          setError('');
        }
      })
      .catch((error) => {
        if (!cancelled) setError(error.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [data.problem.id, data.document_hash, refresh]);
  return (
    <section className="card review-report">
      <SectionHeading
        title="문제 검수 보고서"
        description="저장된 자료와 실제 실행 근거를 함께 검토합니다. 보고서를 열어도 AI나 채점 작업을 새로 시작하지 않습니다."
        actions={
          <button
            className="button small"
            disabled={busy || loading}
            onClick={() => {
              setLoading(true);
              setRefresh((n) => n + 1);
            }}
          >
            새로고침
          </button>
        }
      />
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {report ? (
        <ReviewReportView
          report={report}
          problemId={data.problem.id}
          stale={dirty || report.document_hash !== data.document_hash}
        />
      ) : (
        <p className="muted">검수 근거를 불러오고 있습니다.</p>
      )}
    </section>
  );
}
