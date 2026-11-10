import { Link } from 'react-router-dom';
import Pagination from '../../components/Pagination';
import { Badge } from '../../components/ui';
import { usePagination } from '../../lib/pagination';

type ConstraintEvidence = {
  name: string;
  low: string | number | null;
  high: string | number | null;
  expression: string;
  location: string;
};
type ConstraintStatus =
  | 'match'
  | 'difference'
  | 'partial'
  | 'statement_only'
  | 'validator_only'
  | 'unresolved'
  | 'ambiguous';
export type ConstraintRow = {
  id: string;
  name: string;
  status: ConstraintStatus;
  reason_code: string;
  reason: string;
  matching: 'exact' | 'case' | 'indexed' | null;
  statement: ConstraintEvidence[];
  validator: ConstraintEvidence[];
};
export type ConstraintComparisonData = {
  version: number;
  validator: { name: string; language: string } | null;
  counts: {
    compared: number;
    matched: number;
    different: number;
    unresolved: number;
    statement_only: number;
    validator_only: number;
  };
  rows: ConstraintRow[];
  notices: { code: string; message: string }[];
  limitations: string[];
};

const statuses: Record<ConstraintStatus, string> = {
  match: '일치',
  difference: '불일치',
  partial: '일부 확인',
  statement_only: '수동 확인 · 지문만',
  validator_only: '수동 확인 · Validator만',
  unresolved: '수동 확인',
  ambiguous: '수동 확인 · 대응 불명확',
};
const matchingLabels = {
  exact: '변수명 일치',
  case: '대소문자 대응',
  indexed: '배열 원소 대응',
};
const nextSteps: Record<ConstraintStatus, string> = {
  match: '',
  difference: '의도한 제한에 맞게 지문 또는 Validator를 수정하세요.',
  partial: '자동으로 해석하지 못한 나머지 제한을 원문에서 확인하세요.',
  statement_only: 'Validator에서 같은 변수의 제한과 이름을 확인하세요.',
  validator_only: '지문에서 같은 변수의 제한과 이름을 확인하세요.',
  unresolved: '조건·참조 변수·범위식을 원문에서 직접 확인하세요.',
  ambiguous: '여러 선언이나 다른 이름이 같은 변수를 가리키는지 확인하세요.',
};
function nextStep(row: ConstraintRow) {
  if (row.reason_code === 'missing_name')
    return '자동 대응하려면 입력 호출의 이름 인자에 "N"처럼 변수명만 쓰거나, int N = inf.readInt(...)처럼 단순 대입문으로 작성하세요.';
  return nextSteps[row.status];
}

function integer(value: string | number) {
  if (typeof value === 'number' && !Number.isSafeInteger(value))
    return '정밀도 확인 필요';
  const text = String(value);
  return /^-?\d+$/.test(text)
    ? text.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    : text;
}
function range(entry: ConstraintEvidence) {
  if (entry.low !== null && entry.high !== null)
    return `${integer(entry.low)} ≤ ${entry.name} ≤ ${integer(entry.high)}`;
  if (entry.low !== null)
    return `${integer(entry.low)} ≤ ${entry.name} · 상한 미확정`;
  if (entry.high !== null)
    return `${entry.name} ≤ ${integer(entry.high)} · 하한 미확정`;
  return `${entry.name} · 수치 범위 미확정`;
}
function statementLocation(location: string) {
  const labels: Record<string, string> = {
    korean: '한국어',
    english: '영어',
    legend: '문제 내용',
    input: '입력',
  };
  return location
    .split(' · ')
    .map((part) =>
      Object.hasOwn(labels, part)
        ? labels[part]
        : /^\d+$/.test(part)
          ? `${part}행`
          : part,
    )
    .join(' · ');
}
function Ranges({
  title,
  entries,
}: {
  title: string;
  entries: ConstraintEvidence[];
}) {
  // Repeated translations retain every original below without repeating ranges.
  const unique = entries.filter(
    (entry, index) =>
      entries.findIndex(
        (other) =>
          other.name === entry.name &&
          other.low === entry.low &&
          other.high === entry.high,
      ) === index,
  );
  return (
    <div className="constraint-range">
      <h4>{title}</h4>
      {unique.length ? (
        <ul>
          {unique.map((entry, index) => (
            <li key={index}>
              <code>{range(entry)}</code>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">확인된 범위 없음</p>
      )}
    </div>
  );
}

export default function ConstraintComparison({
  comparison,
  rows,
  problemId,
  resetKey,
  showInformation,
}: {
  comparison: ConstraintComparisonData;
  rows: ConstraintRow[];
  problemId: string;
  resetKey: string;
  showInformation: boolean;
}) {
  const paging = usePagination(rows, resetKey, 10);
  const counts = comparison.counts;
  const notCompared =
    counts.unresolved + counts.statement_only + counts.validator_only;
  return (
    <section
      className="constraint-comparison"
      aria-label="지문·Validator 제한 비교"
    >
      <header className="constraint-heading">
        <div>
          <h2>지문·Validator 제한 비교</h2>
          <p className="muted">
            명시된 정수 범위를 비교한 결과입니다. 문제 전체의 검증 통과를 뜻하지
            않습니다.
          </p>
        </div>
        <div className="constraint-links">
          <Link to={`/problems/${problemId}/statements`}>지문 확인 →</Link>
          <Link to={`/problems/${problemId}/validator`}>Validator 확인 →</Link>
        </div>
      </header>
      <dl className="constraint-counts" aria-label="전체 제한 비교 요약">
        <div>
          <dt>범위 비교</dt>
          <dd>{counts.compared.toLocaleString()}개</dd>
          <small>일치 {counts.matched.toLocaleString()}개</small>
        </div>
        <div>
          <dt>불일치</dt>
          <dd>{counts.different.toLocaleString()}개</dd>
          <small>지문·허용 범위 차이</small>
        </div>
        <div>
          <dt>자동 비교 안 됨</dt>
          <dd>{notCompared.toLocaleString()}개</dd>
          <small>
            지문만 {counts.statement_only.toLocaleString()} · Validator만{' '}
            {counts.validator_only.toLocaleString()} · 미확정{' '}
            {counts.unresolved.toLocaleString()}
          </small>
        </div>
      </dl>
      <p className="constraint-source muted">
        {comparison.validator ? (
          <>
            Validator <code>{comparison.validator.name}</code> ·{' '}
            {comparison.validator.language}
          </>
        ) : (
          '선택된 Validator 없음'
        )}
      </p>
      {comparison.notices.length > 0 && (
        <ul className="constraint-notices">
          {comparison.notices.map((notice, index) => (
            <li key={`${notice.code}-${index}`}>{notice.message}</li>
          ))}
        </ul>
      )}
      <p className="constraint-row-count muted">
        현재 필터 {rows.length.toLocaleString()}개 · 제공된 비교 항목{' '}
        {comparison.rows.length.toLocaleString()}개
      </p>
      <div className="constraint-rows">
        {paging.items.map((row) => (
          <article
            key={row.id}
            className="constraint-row"
            data-constraint-status={row.status}
          >
            <header>
              <h3>
                <code>{row.name}</code>
              </h3>
              <Badge
                tone={
                  row.status === 'difference'
                    ? 'warning'
                    : row.status === 'match'
                      ? 'accent'
                      : 'neutral'
                }
              >
                {statuses[row.status] || '수동 확인'}
              </Badge>
              {row.matching && (
                <small className="muted">{matchingLabels[row.matching]}</small>
              )}
            </header>
            <div className="constraint-ranges">
              <Ranges title="지문 범위" entries={row.statement} />
              <span className="constraint-arrow" aria-hidden="true">
                ↔
              </span>
              <Ranges title="Validator 허용 범위" entries={row.validator} />
            </div>
            <p className="constraint-reason">{row.reason}</p>
            {nextStep(row) && (
              <p className="constraint-next muted">{nextStep(row)}</p>
            )}
            {(row.statement.length > 0 || row.validator.length > 0) && (
              <details className="constraint-evidence">
                <summary>원문 · 위치 확인</summary>
                {[
                  ...row.statement.map((entry) => ({ entry, statement: true })),
                  ...row.validator.map((entry) => ({
                    entry,
                    statement: false,
                  })),
                ].map(({ entry, statement }, index) => (
                  <div key={index}>
                    <p>
                      {statement
                        ? `지문 · ${statementLocation(entry.location)}`
                        : `${comparison.validator?.name || 'Validator'}:${entry.location}`}
                    </p>
                    <pre>
                      <code>{entry.expression || '원문 정보 없음'}</code>
                    </pre>
                  </div>
                ))}
              </details>
            )}
          </article>
        ))}
        {!rows.length && (
          <p className="muted">
            {!showInformation && counts.different > 0
              ? '제공된 항목에 불일치 행이 없습니다. 전체 불일치 수와 위의 제공 범위 안내를 확인하세요.'
              : '선택한 조건에 표시할 제한 비교 항목이 없습니다.'}
          </p>
        )}
      </div>
      <Pagination {...paging} label="제한 비교" />
      {showInformation && comparison.limitations.length > 0 && (
        <details className="constraint-limitations">
          <summary>자동 비교 범위와 한계</summary>
          <ul>
            {comparison.limitations.map((limitation, index) => (
              <li key={index}>{limitation}</li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
