import type { Test, TestSet } from './types';

export function orderedTests(set?: TestSet): Test[] {
  const ranks = new Map((set?.order || []).map((index, rank) => [index, rank]));
  return Object.values(set?.tests || {}).sort(
    (a, b) =>
      (ranks.get(a.index) ?? ranks.size) - (ranks.get(b.index) ?? ranks.size) ||
      a.index - b.index,
  );
}

export function moveTest(order: number[], index: number, position: number) {
  if (
    !order.includes(index) ||
    !Number.isInteger(position) ||
    position < 1 ||
    position > order.length
  )
    throw new Error(
      `이동할 위치는 1~${order.length} 사이의 정수로 입력하세요.`,
    );
  const next = order.filter((value) => value !== index);
  next.splice(position - 1, 0, index);
  return next;
}
