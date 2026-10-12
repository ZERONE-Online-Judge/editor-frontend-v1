import { useId, useState } from 'react';
import type { InputHTMLAttributes } from 'react';
import { passwordRequirements } from './passwordPolicy';
import './PasswordInput.css';

export function PasswordInput({
  label,
  id,
  className = '',
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { label: string }) {
  const generated = useId();
  const inputId = id ?? generated;
  const [visible, setVisible] = useState(false);
  return (
    <div className="zoj-password-field">
      <label htmlFor={inputId}>{label}</label>
      <div className="zoj-password-input">
        <input
          {...props}
          id={inputId}
          type={visible ? 'text' : 'password'}
          className={`zoj-password-control ${className}`}
          spellCheck={false}
          autoCapitalize="none"
          autoCorrect="off"
        />
        <button
          type="button"
          className="zoj-password-toggle"
          aria-label={`${label} ${visible ? '숨기기' : '보기'}`}
          aria-controls={inputId}
          aria-pressed={visible}
          disabled={props.disabled}
          onClick={() => setVisible((old) => !old)}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
            <circle cx="12" cy="12" r="3" />
            {visible && <path d="m3 3 18 18" />}
          </svg>
          <span>{visible ? '숨기기' : '보기'}</span>
        </button>
      </div>
    </div>
  );
}

export function PasswordRequirements({ value }: { value: string }) {
  const requirements = passwordRequirements(value);
  const satisfied = requirements.filter((r) => r.met).length;
  return (
    <section
      className="zoj-password-requirements"
      aria-label="새 비밀번호 조건"
    >
      <div className="zoj-password-requirements-heading">
        <strong>비밀번호 조건</strong>
        <span role="status" aria-live="polite">
          {satisfied === 4 ? '모든 조건 충족' : `${satisfied}/4개 충족`}
        </span>
      </div>
      <div className="zoj-password-meter" aria-hidden="true">
        {requirements.map((r, index) => (
          <i key={r.id} data-filled={index < satisfied} />
        ))}
      </div>
      <ul>
        {requirements.map((r) => (
          <li
            key={r.id}
            data-state={r.met ? 'met' : value ? 'unmet' : 'idle'}
            aria-label={`${r.label}: ${r.met ? '충족' : value ? '미충족' : '입력 대기'}`}
          >
            <span className="zoj-password-check" aria-hidden="true">
              {r.met ? '✓' : '○'}
            </span>
            <span>
              <strong>{r.label}</strong>
              <small>{r.detail}</small>
            </span>
            <span className="zoj-password-check-state">
              {r.met ? '충족' : value ? '미충족' : '대기'}
            </span>
          </li>
        ))}
      </ul>
      <p>
        영문 대소문자를 구분합니다. 대문자와 소문자를 모두 넣을 필요는 없습니다.
      </p>
    </section>
  );
}

export function PasswordMatch({
  password,
  repeat,
}: {
  password: string;
  repeat: string;
}) {
  if (!repeat) return null;
  const matches = password === repeat;
  return (
    <p
      className="zoj-password-match"
      data-match={matches}
      role="status"
      aria-live="polite"
    >
      {matches
        ? '✓ 비밀번호가 일치합니다.'
        : '새 비밀번호와 일치하지 않습니다.'}
    </p>
  );
}
