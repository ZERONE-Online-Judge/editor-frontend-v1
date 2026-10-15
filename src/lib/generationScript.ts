export function loopScript(
  command: string,
  start: number,
  end: number,
  step: number,
  group: string,
) {
  if (!command.trim() || !command.includes('{seed}') || /[\r\n]/.test(command))
    throw new Error('한 줄 명령에 {seed}를 포함하세요.');
  if (
    ![start, end, step].every(Number.isSafeInteger) ||
    !step ||
    (end - start) * step < 0
  )
    throw new Error('시드 범위와 증가 방향을 확인하세요.');
  if (group && !/^[A-Za-z0-9_][A-Za-z0-9_.-]*$/.test(group))
    throw new Error('등록된 그룹을 선택하세요.');
  return `repeat seed in ${start}..${end}${step === 1 ? '' : ` step ${step}`}\n${group ? `  group ${group}\n` : ''}  ${command.trim()} > $\nend`;
}
