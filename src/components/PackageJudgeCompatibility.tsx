import type { ImportReport } from './PackageImportSummary';
import { languageChangeKey } from '../lib/importCompatibility';

export default function PackageJudgeCompatibility({
  plan,
  selected,
  onChange,
  busy,
}: {
  plan: NonNullable<ImportReport['zoj_compatibility']>;
  selected: string[];
  onChange: (keys: string[]) => void;
  busy: boolean;
}) {
  const available = plan.changes
    .filter((row) => row.to_language)
    .map((row) => languageChangeKey(row.kind, row.name));
  return (
    <section
      className="import-compatibility"
      aria-label="ZOJ 채점기 언어 설정 확인"
    >
      <p>
        ZOJ 채점기에서 사용할 수 있도록 아래 파일의 언어 설정을 변경할까요?
        적용할 파일만 선택하세요.
      </p>
      <label className="checkbox">
        <input
          type="checkbox"
          disabled={busy || !available.length}
          checked={available.length > 0 && selected.length === available.length}
          onChange={(event) => onChange(event.target.checked ? available : [])}
        />
        변경 가능한 항목 전체 선택
      </label>
      <div
        className="import-language-table"
        tabIndex={0}
        role="region"
        aria-label="파일별 언어 변경 제안"
      >
        <table>
          <thead>
            <tr>
              <th>적용</th>
              <th>파일 · 역할</th>
              <th>현재 언어</th>
              <th>변경할 언어</th>
            </tr>
          </thead>
          <tbody>
            {plan.changes.map((row) => {
              const key = languageChangeKey(row.kind, row.name);
              return (
                <tr key={key}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`${row.name} 언어 변경`}
                      disabled={busy || !row.to_language}
                      checked={selected.includes(key)}
                      onChange={(event) =>
                        onChange(
                          event.target.checked
                            ? [...selected, key]
                            : selected.filter((value) => value !== key),
                        )
                      }
                    />
                  </td>
                  <td>
                    <code>{row.name}</code>
                    <small>{row.kind === 'checker' ? 'Checker' : '풀이'}</small>
                  </td>
                  <td>{row.from_label}</td>
                  <td>{row.to_label || '자동 변경 제안 없음'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="muted small">
        소스 코드는 그대로 두고 언어 설정만 바꿉니다. 가져온 원본은 r0에
        보관하고 변경사항은 새 리비전에 저장합니다. 적용 후 전체 검증으로
        컴파일과 판정을 확인하세요. 언어 설정 변경만으로 컴파일 성공을
        보장하지는 않습니다.
      </p>
      {plan.changes.some((row) => !row.to_language) && (
        <p className="muted small">
          자동 제안이 없는 파일은 문제를 연 뒤 ‘파일 · 리소스’에서 확인하세요.
        </p>
      )}
      {plan.issues.length > 0 && (
        <details>
          <summary>언어 외에 확인할 문제 설정 {plan.issues.length}개</summary>
          <ul>
            {plan.issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
