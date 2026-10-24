import { useState } from 'react';

export type Page<T> = {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
  counts?: { all: number; current: number; other: number } | null;
};

// Older API releases return arrays during a rolling deployment.
export function asPage<T>(value: Page<T> | T[], page = 1, size = 20): Page<T> {
  if (!Array.isArray(value)) return value;
  const pages = Math.max(1, Math.ceil(value.length / size));
  const current = Math.min(page, pages);
  return {
    items: value.slice((current - 1) * size, current * size),
    total: value.length,
    page: current,
    page_size: size,
    pages,
  };
}

export function usePagination<T>(items: T[], key: string, size = 20) {
  const [selection, setSelection] = useState({ key, page: 1 });
  const pages = Math.max(1, Math.ceil(items.length / size));
  const page = Math.min(selection.key === key ? selection.page : 1, pages);
  const offset = (page - 1) * size;
  return {
    items: items.slice(offset, offset + size),
    total: items.length,
    page,
    page_size: size,
    pages,
    offset,
    onPageChange: (next: number) =>
      setSelection({ key, page: Math.max(1, next) }),
  };
}
