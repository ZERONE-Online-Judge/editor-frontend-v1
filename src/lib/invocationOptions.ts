export function parseTestIndices(source: string, maximum: number): number[] {
  if (!Number.isInteger(maximum) || maximum < 1) throw new Error('서버의 실행 한도를 확인하고 있습니다.');
  if (!source.trim()) throw new Error('테스트 번호나 범위를 입력하세요.');
  const values = new Set<number>();
  for (const part of source.split(',')) {
    const match = part.trim().match(/^(\d+)(?:\s*[-~]\s*(\d+))?$/);
    if (!match) throw new Error('번호는 1-10, 15, 20-25 형식으로 입력하세요.');
    const first = Number(match[1]), last = Number(match[2] || match[1]);
    if (first < 1 || last < first || last > maximum) throw new Error(`테스트 번호는 1~${maximum} 범위에서 작은 번호부터 입력하세요.`);
    for (let index = first; index <= last; index++) values.add(index);
  }
  return [...values].sort((a, b) => a - b);
}
