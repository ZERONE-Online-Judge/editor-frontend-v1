import type { LanguageResourceLimits, ProblemDocument } from '../lib/types';
import { effectiveLimits, limitLanguages } from '../lib/languageLimits';

export default function LanguageLimits({
  document: doc,
  disabled = false,
  onChange,
}: {
  document: ProblemDocument;
  disabled?: boolean;
  onChange?: (value: LanguageResourceLimits) => void;
}) {
  const values = doc.language_resource_limits ?? {};
  function update(
    language: keyof LanguageResourceLimits,
    patch: {
      time_limit_ms?: number;
      memory_limit_mb?: number;
      disable_auto_adjustment?: boolean;
    },
  ) {
    const row = { ...values[language], ...patch };
    const clean = Object.fromEntries(
      Object.entries(row).filter(
        ([key, value]) =>
          value !== undefined && (key !== 'disable_auto_adjustment' || value),
      ),
    );
    const next = { ...values };
    if (Object.keys(clean).length) next[language] = clean;
    else delete next[language];
    onChange?.(next);
  }
  return (
    <section
      className="card language-resource-limits"
      aria-label="언어별 시간·메모리 제한"
    >
      <div className="section-heading">
        <div>
          <h3>언어별 시간·메모리 제한</h3>
          <p>
            빈칸은 ZOJ 자동 보정을 적용합니다. 직접 입력한 값은 보정 없이 그대로
            사용합니다.
          </p>
          <p>
            ‘자동 보정 끄기’를 체크하면 빈칸에는 문제 기본 제한을 적용합니다.
            설정은 ZOJ로 문제를 가져갈 때도 유지됩니다.
          </p>
        </div>
      </div>
      <fieldset disabled={disabled || !onChange}>
        {limitLanguages.map(({ key, label, corrected }) => {
          const limits = values[key] ?? {};
          const effective = effectiveLimits(doc, key);
          return (
            <div className="language-limit-row" key={key}>
              <div className="language-limit-name">
                <strong>{label}</strong>
                {corrected && (
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      aria-label={`${label} 자동 보정 끄기`}
                      checked={Boolean(limits.disable_auto_adjustment)}
                      onChange={(e) =>
                        update(key, {
                          disable_auto_adjustment: e.target.checked,
                        })
                      }
                    />
                    자동 보정 끄기
                  </label>
                )}
              </div>
              <label>
                시간 제한 (ms)
                <input
                  aria-label={`${label} 시간 제한 (ms)`}
                  type="number"
                  min={100}
                  max={10000}
                  step={1}
                  value={limits.time_limit_ms ?? ''}
                  placeholder={String(effective.time_limit_ms)}
                  onChange={(e) =>
                    update(key, {
                      time_limit_ms:
                        e.target.value === ''
                          ? undefined
                          : Number(e.target.value),
                    })
                  }
                />
                <small>
                  {limits.time_limit_ms !== undefined
                    ? '직접 지정'
                    : corrected && !limits.disable_auto_adjustment
                      ? '자동 보정'
                      : '기본 제한'}{' '}
                  · {effective.time_limit_ms.toLocaleString()}ms
                </small>
              </label>
              <label>
                메모리 제한 (MiB)
                <input
                  aria-label={`${label} 메모리 제한 (MiB)`}
                  type="number"
                  min={16}
                  max={1024}
                  step={1}
                  value={limits.memory_limit_mb ?? ''}
                  placeholder={String(effective.memory_limit_mb)}
                  onChange={(e) =>
                    update(key, {
                      memory_limit_mb:
                        e.target.value === ''
                          ? undefined
                          : Number(e.target.value),
                    })
                  }
                />
                <small>
                  {limits.memory_limit_mb !== undefined
                    ? '직접 지정'
                    : corrected && !limits.disable_auto_adjustment
                      ? '자동 보정'
                      : '기본 제한'}{' '}
                  · {effective.memory_limit_mb.toLocaleString()}MiB
                </small>
              </label>
            </div>
          );
        })}
      </fieldset>
      {!onChange && (
        <p className="muted small">
          언어별 제한은 기본 설정 편집 권한이 있는 사용자가 변경할 수 있습니다.
        </p>
      )}
    </section>
  );
}
