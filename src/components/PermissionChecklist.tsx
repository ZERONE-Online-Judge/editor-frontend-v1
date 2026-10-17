import {
  allPermissions,
  folderOnly,
  permissionGroups,
  permissionPresets,
  permissionLabel,
} from '../lib/permissions';
import type { Permission } from '../lib/permissions';
export function PermissionSummary({ value }: { value: Permission[] }) {
  return (
    <span className="permission-summary">
      {value.length
        ? value.map(permissionLabel).join(' · ')
        : '자료·실행 결과 읽기'}
    </span>
  );
}
export default function PermissionChecklist({
  value,
  onChange,
  folder = false,
  disabled = false,
  allowed = allPermissions,
}: {
  value: Permission[];
  onChange: (value: Permission[]) => void;
  folder?: boolean;
  disabled?: boolean;
  allowed?: Permission[];
}) {
  const visible = (p: Permission) => folder || !folderOnly.includes(p);
  return (
    <div className="permission-checklist">
      <div className="permission-presets">
        <span>빠른 선택</span>
        {permissionPresets.map((preset) => (
          <button
            key={preset.label}
            type="button"
            className="button small"
            disabled={disabled}
            onClick={() =>
              onChange(
                preset.permissions.filter(
                  (p) => visible(p) && allowed.includes(p),
                ),
              )
            }
          >
            {preset.label}
          </button>
        ))}
        {folder && (
          <button
            type="button"
            className="button small"
            disabled={disabled}
            onClick={() =>
              onChange(allPermissions.filter((p) => allowed.includes(p)))
            }
          >
            관리
          </button>
        )}
      </div>
      <p className="muted small">
        자료·실행 결과 읽기는 기본입니다. 편집이 허용된 항목은 저장·커밋할 수
        있습니다.
      </p>
      {permissionGroups.map((group) => (
        <fieldset key={group.title} disabled={disabled}>
          <legend>{group.title}</legend>
          <div className="permission-options">
            {group.items
              .filter(([p]) => visible(p))
              .map(([key, label, help]) => (
                <label key={key} className="permission-option">
                  <input
                    type="checkbox"
                    checked={value.includes(key)}
                    disabled={!allowed.includes(key)}
                    onChange={(e) =>
                      onChange(
                        e.target.checked
                          ? [...value, key]
                          : value.filter((p) => p !== key),
                      )
                    }
                  />
                  <span>
                    <strong>{label}</strong>
                    <small>
                      {help}
                      {!allowed.includes(key) ? ' · 부여할 수 없는 권한' : ''}
                    </small>
                  </span>
                </label>
              ))}
          </div>
        </fieldset>
      ))}
    </div>
  );
}
