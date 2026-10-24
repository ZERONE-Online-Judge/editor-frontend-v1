import type { ReactNode } from 'react';
import { usePagination } from '../lib/pagination';

export default function Pagination({
  page,
  pages,
  total,
  page_size: size,
  onPageChange,
  label,
  busy = false,
}: {
  page: number;
  pages: number;
  total: number;
  page_size: number;
  onPageChange: (page: number) => void;
  label: string;
  busy?: boolean;
}) {
  if (pages <= 1) return null;
  const numbers = [...new Set([1, page - 1, page, page + 1, pages])]
    .filter((value) => value >= 1 && value <= pages)
    .sort((a, b) => a - b);
  return (
    <nav
      className="list-pagination"
      aria-label={`${label} 페이지`}
      aria-busy={busy}
    >
      <span className="pagination-range" role="status">
        전체 {total.toLocaleString()}개 · {(page - 1) * size + 1}–
        {Math.min(page * size, total)}
      </span>
      <div className="pagination-buttons">
        <button
          type="button"
          className="button small"
          aria-label={`${label} 이전 페이지`}
          disabled={busy || page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          이전
        </button>
        {numbers.map((number, index) => (
          <span key={number}>
            {index > 0 && number - numbers[index - 1] > 1 && (
              <span className="pagination-gap" aria-hidden="true">
                …
              </span>
            )}
            <button
              type="button"
              className={`button small ${page === number ? 'primary' : ''}`}
              aria-label={`${label} ${number}페이지`}
              aria-current={page === number ? 'page' : undefined}
              disabled={busy}
              onClick={() => onPageChange(number)}
            >
              {number}
            </button>
          </span>
        ))}
        <button
          type="button"
          className="button small"
          aria-label={`${label} 다음 페이지`}
          disabled={busy || page >= pages}
          onClick={() => onPageChange(page + 1)}
        >
          다음
        </button>
      </div>
    </nav>
  );
}

export function PaginatedList<T>({
  items,
  label,
  resetKey = label,
  size = 20,
  children,
}: {
  items: T[];
  label: string;
  resetKey?: string;
  size?: number;
  children: (items: T[], offset: number) => ReactNode;
}) {
  const paging = usePagination(items, resetKey, size);
  return (
    <>
      {children(paging.items, paging.offset)}
      <Pagination {...paging} label={label} />
    </>
  );
}
