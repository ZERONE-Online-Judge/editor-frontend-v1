import Select from '../../components/Select';
import { tags } from '../../lib/api';
import type { ProblemDocument, Solution } from '../../lib/types';

export default function SolutionExpectations({
  source,
  document,
  disabled,
  change,
}: {
  source: Solution;
  document: ProblemDocument;
  disabled: boolean;
  change: (
    extra: Record<string, string>,
    groups: Record<string, Record<string, string>>,
  ) => void;
}) {
  function select(
    label: string,
    value: string,
    update: (value: string) => void,
  ) {
    return (
      <label key={label}>
        {label}
        <Select
          aria-label={label}
          value={value}
          disabled={disabled}
          onChange={(e) => update(e.target.value)}
        >
          <option value="">기본 기대 판정 사용</option>
          {Object.entries(tags)
            .filter(([tag]) => tag !== 'MA')
            .map(([tag, name]) => (
              <option key={tag} value={tag}>
                {tag} · {name}
              </option>
            ))}
        </Select>
      </label>
    );
  }
  return (
    <details className="scoped-expectations">
      <summary>세트·그룹별 기대 판정</summary>
      <p className="muted small">
        그룹 설정 → 세트 설정 → 기본 판정 순서로 적용합니다. WA·TL 등은 해당
        범위에서 한 번 이상 재현되어야 합니다. NR은 해당 범위를 실행하지
        않습니다. 기본 판정이 NR인 풀이는 전체 실행에서 제외합니다.
      </p>
      {Object.entries(document.testsets).map(([setName, set]) => (
        <fieldset key={setName} disabled={disabled}>
          <legend>{setName}</legend>
          {select(
            `${setName} 세트 기대 판정`,
            source.extra_tags[setName] || '',
            (value) => {
              const extra = { ...source.extra_tags };
              if (value) extra[setName] = value;
              else delete extra[setName];
              change(extra, source.group_tags || {});
            },
          )}
          {set.groups_enabled &&
            Object.keys(set.groups).map((group) =>
              select(
                `${setName} / ${group} 그룹 기대 판정`,
                source.group_tags?.[setName]?.[group] || '',
                (value) => {
                  const groups = structuredClone(source.group_tags || {});
                  const scoped = { ...groups[setName] };
                  if (value) scoped[group] = value;
                  else delete scoped[group];
                  if (Object.keys(scoped).length) groups[setName] = scoped;
                  else delete groups[setName];
                  change(source.extra_tags, groups);
                },
              ),
            )}
        </fieldset>
      ))}
    </details>
  );
}
