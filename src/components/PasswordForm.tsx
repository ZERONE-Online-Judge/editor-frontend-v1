import { useEffect, useState } from 'react';
import { api, post } from '../lib/api';
import { Notice } from './ui';

export default function PasswordForm({
  mode,
  email: initialEmail,
  onDone,
  onBusyChange,
}: {
  mode: 'set' | 'reset';
  email: string;
  onDone: (email: string) => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [email, setEmail] = useState(initialEmail);
  const [hasPassword, setHasPassword] = useState(false);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sentAt, setSentAt] = useState(0);
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);
  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (mode !== 'set') return;
    let active = true;
    void api<{ has_password: boolean }>('/auth/password')
      .then((r) => {
        if (active) setHasPassword(r.has_password);
      })
      .catch((e: Error) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [mode]);
  const cooldown = Math.max(0, 30 - Math.floor((clock - sentAt) / 1000));
  const expires = Math.max(0, 300 - Math.floor((clock - sentAt) / 1000));
  async function request() {
    setBusy(true);
    setError('');
    try {
      await post(
        mode === 'set'
          ? '/auth/password/request'
          : '/auth/password/reset/request',
        mode === 'set' ? {} : { email },
      );
      setSent(true);
      setCode('');
      setSentAt(Date.now());
      setClock(Date.now());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (password !== confirm) {
      setError('새 비밀번호가 서로 일치하지 않습니다.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await post(
        mode === 'set'
          ? '/auth/password/confirm'
          : '/auth/password/reset/confirm',
        {
          code,
          new_password: password,
          ...(mode === 'reset' ? { email } : {}),
        },
      );
      setPassword('');
      setConfirm('');
      setCode('');
      onDone(email);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className="password-form"
      onSubmit={(e) => {
        e.preventDefault();
        void (sent ? save() : request());
      }}
    >
      <p className="muted">ZOJ와 Editor가 함께 사용하는 비밀번호입니다.</p>
      <p className="muted">
        {mode === 'set'
          ? hasPassword
            ? '비밀번호 로그인을 사용 중입니다. 이메일 인증 후 변경할 수 있습니다.'
            : '비밀번호를 등록하면 이메일 인증번호 없이도 로그인할 수 있습니다.'
          : '비밀번호를 등록한 계정이라면 인증번호를 보내드립니다.'}
      </p>
      <label>
        이메일
        <input
          type="email"
          autoComplete="email"
          required
          value={email}
          disabled={busy || mode === 'set'}
          onChange={(e) => {
            setEmail(e.target.value);
            setSent(false);
            setCode('');
            setPassword('');
            setConfirm('');
            setSentAt(0);
          }}
        />
      </label>
      {!sent ? (
        <button className="button primary" disabled={busy || !email}>
          {busy ? '요청 중…' : '이메일 인증번호 받기'}
        </button>
      ) : (
        <>
          <Notice>
            등록된 이메일에 인증번호를 발송 요청했습니다.{' '}
            {expires > 0
              ? `남은 시간 ${Math.floor(expires / 60)}:${String(expires % 60).padStart(2, '0')}`
              : '인증번호가 만료되었습니다.'}
          </Notice>
          <label>
            인증번호
            <input
              autoComplete="one-time-code"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              value={code}
              disabled={busy}
              onChange={(e) => setCode(e.target.value)}
            />
          </label>
          <label>
            새 비밀번호
            <input
              type="password"
              autoComplete="new-password"
              minLength={15}
              maxLength={128}
              required
              value={password}
              disabled={busy}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <label>
            새 비밀번호 확인
            <input
              type="password"
              autoComplete="new-password"
              minLength={15}
              maxLength={128}
              required
              value={confirm}
              disabled={busy}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </label>
          <p className="muted">
            15~128자이며 공백·한글을 사용할 수 있습니다. 변경하면 ZOJ·Editor의
            기존 로그인은 모두 해제됩니다. 이메일 인증번호 로그인도 계속 사용할
            수 있습니다.
          </p>
          <button className="button primary" disabled={busy || expires <= 0}>
            {busy
              ? '저장 중…'
              : mode === 'reset'
                ? '비밀번호 재설정'
                : hasPassword
                  ? '비밀번호 변경'
                  : '비밀번호 등록'}
          </button>
          <button
            className="text-button"
            type="button"
            disabled={busy || cooldown > 0}
            onClick={() => void request()}
          >
            {cooldown > 0 ? `${cooldown}초 후 다시 받기` : '인증번호 다시 받기'}
          </button>
        </>
      )}
      {error && <Notice tone="error">{error}</Notice>}
    </form>
  );
}
