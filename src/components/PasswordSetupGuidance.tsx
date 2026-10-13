import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Icon } from './ui';
import './PasswordSetupGuidance.css';

export default function PasswordSetupGuidance({
  onSetup,
}: {
  onSetup: () => void;
}) {
  const [missingPassword, setMissingPassword] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    let active = true;
    void api<{ has_password: boolean }>('/auth/password')
      .then((result) => {
        if (active) setMissingPassword(result.has_password === false);
      })
      .catch(() => {
        // A failed status check must not imply that a password is missing.
      });
    return () => {
      active = false;
    };
  }, []);
  if (!missingPassword || dismissed) return null;
  return (
    <section
      className="password-setup-guidance"
      role="status"
      aria-label="비밀번호 로그인 안내"
    >
      <span className="password-setup-guidance-icon" aria-hidden="true">
        <Icon name="shield" />
      </span>
      <div className="password-setup-guidance-copy">
        <strong>비밀번호로도 로그인할 수 있어요</strong>
        <p>
          비밀번호를 등록하면 이메일 인증번호 없이 ZOJ에 로그인할 수 있어요.
        </p>
      </div>
      <button
        className="password-setup-guidance-action"
        type="button"
        onClick={() => {
          setDismissed(true);
          onSetup();
        }}
      >
        비밀번호 설정
      </button>
      <button
        className="password-setup-guidance-close"
        type="button"
        aria-label="비밀번호 설정 안내 닫기"
        onClick={() => setDismissed(true)}
      >
        <Icon name="close" size={18} />
      </button>
    </section>
  );
}
