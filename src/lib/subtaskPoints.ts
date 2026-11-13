import type { Test } from './types';

export function groupTests(tests: Record<string, Test>, group: string): Test[] {
  return Object.values(tests)
    .filter((test) => test.group === group)
    .sort((a, b) => a.index - b.index);
}

export function groupPoints(
  tests: Record<string, Test>,
  group: string,
): number {
  return groupTests(tests, group).reduce((sum, test) => sum + test.points, 0);
}

/** COMPLETE_GROUP already sums member weights; changing their distribution
 * does not change which tests must pass. Other groups and inputs stay intact. */
export function allocateGroupPoints(
  tests: Record<string, Test>,
  group: string,
  points: number,
): boolean {
  const members = groupTests(tests, group);
  if (
    !members.length ||
    !Number.isInteger(points) ||
    points < 0 ||
    points > 100
  )
    return false;
  for (const [index, test] of members.entries())
    test.points = index === 0 ? points : 0;
  return true;
}
