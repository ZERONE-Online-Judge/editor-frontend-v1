import type { TestSet } from '../../lib/types';

export default function TestsetSelector({
  label,
  testsets,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  testsets: Record<string, TestSet>;
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
}) {
  const names = Object.keys(testsets);
  return (
    <fieldset className="testset-selector span-2" disabled={disabled}>
      <legend>{label}</legend>
      <div className="testset-selection-actions">
        <small>
          {value.length} / {names.length}개 선택
        </small>
        <button
          type="button"
          className="text-button"
          aria-label={`${label} 전체 선택`}
          onClick={() => onChange(names)}
        >
          전체 선택
        </button>
        <button
          type="button"
          className="text-button"
          aria-label={`${label} 선택 해제`}
          onClick={() => onChange([])}
        >
          선택 해제
        </button>
      </div>
      <div className="testset-choices">
        {names.map((name) => (
          <label className="checkbox" key={name}>
            <input
              type="checkbox"
              aria-label={`${label}: ${name}`}
              checked={value.includes(name)}
              onChange={(e) =>
                onChange(
                  names.filter((key) =>
                    key === name ? e.target.checked : value.includes(key),
                  ),
                )
              }
            />
            <span>
              <strong>{name}</strong>
              <small>
                {Object.keys(testsets[name].tests).length}개 등록
                {testsets[name].script.trim() ? ' · 생성 스크립트' : ''}
              </small>
            </span>
          </label>
        ))}
      </div>
      {!value.length && (
        <p className="muted small" role="alert">
          테스트 세트를 하나 이상 선택하세요.
        </p>
      )}
    </fieldset>
  );
}
