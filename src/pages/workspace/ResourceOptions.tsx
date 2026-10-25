import { languages } from '../../lib/api';
import type { ResourcePolicy, Language } from '../../lib/types';

export default function ResourceOptions({
  policy,
  disabled,
  change,
}: {
  policy: ResourcePolicy | null;
  disabled: boolean;
  change: (value: ResourcePolicy | null) => void;
}) {
  return (
    <section className="scoped-expectations resource-options">
      <label className="checkbox">
        <input
          type="checkbox"
          checked={!!policy}
          disabled={disabled}
          onChange={(e) =>
            change(
              e.target.checked
                ? {
                    languages: ['cpp17', 'cpp20'],
                    targets: ['SOLUTION'],
                    stages: ['COMPILE'],
                  }
                : null,
            )
          }
        />
        리소스 적용 조건 지정
      </label>
      {!policy ? (
        <p className="muted small">
          기존 방식으로 모든 프로그램의 컴파일에 첨부합니다. 적용 조건을
          지정하면 선택한 언어의 풀이 컴파일에만 제공합니다.
        </p>
      ) : (
        <>
          <div className="checkbox-list">
            {Object.entries(languages)
              .filter(([key]) => key !== 'text')
              .map(([key, label]) => (
                <label className="checkbox" key={key}>
                  <input
                    type="checkbox"
                    disabled={disabled}
                    checked={policy.languages.includes(key as Language)}
                    onChange={(e) =>
                      change({
                        ...policy,
                        languages: e.target.checked
                          ? [...policy.languages, key as Language]
                          : policy.languages.filter((lang) => lang !== key),
                      })
                    }
                  />
                  {label}
                </label>
              ))}
          </div>
          <p className="muted small">
            적용 대상: Solution(풀이) · 적용 단계: Compile(컴파일). 실행 시 원본
            리소스 파일은 제공하지 않습니다. 이 정책은 오프라인 재현 실행에서
            지원합니다. ZOJ 실제 채점 검증에는 사용할 수 없습니다.
          </p>
          {!policy.languages.length && (
            <p role="alert">적용 언어를 하나 이상 선택하세요.</p>
          )}
        </>
      )}
    </section>
  );
}
