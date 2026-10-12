import { useEffect, useRef, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { post, ApiError } from '../lib/api';
import { useAuth } from '../lib/authContext';
import type { User } from '../lib/types';
import { Icon, Notice, Modal } from '../components/ui';
import PasswordLogin from '../components/PasswordLogin';
export default function Login() {
  const [params] = useSearchParams();
  const { user, loading, setUser } = useAuth();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sentAt, setSentAt] = useState(0);
  const [clock, setClock] = useState(() => Date.now());
  const [method, setMethod] = useState<'email' | 'otp' | 'password'>('email');
  const [conflict, setConflict] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (step) ref.current?.focus();
  }, [step]);
  if (loading) return <div className="loading">계정을 확인하고 있습니다.</div>;
  if (user) return <Navigate to="/problems" replace />;
  const cooldown = Math.max(0, 30 - Math.floor((clock - sentAt) / 1000));
  const expiry = Math.max(0, 300 - Math.floor((clock - sentAt) / 1000));
  async function next() {
    setBusy(true);
    setError('');
    try {
      const options = await post<{ password_available: boolean }>(
        '/auth/login-options',
        { email },
      );
      if (options.password_available) setMethod('password');
      else await request();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function request() {
    setBusy(true);
    setError('');
    try {
      await post('/auth/code', { email });
      setMethod('otp');
      setStep(true);
      setSentAt(Date.now());
      setClock(Date.now());
      setCode('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function verify(forceNewSession = false) {
    setBusy(true);
    setError('');
    try {
      const profile = await post<User>('/auth/verify', {
        email,
        code,
        force_new_session: forceNewSession,
      });
      setConflict(false);
      setUser(profile);
    } catch (e) {
      if (
        e instanceof ApiError &&
        e.code === 'session_conflict' &&
        !forceNewSession
      )
        setConflict(true);
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login-page">
      {conflict && (
        <Modal
          title="기존 로그인 연결을 끊을까요?"
          onClose={() => {
            if (!busy) {
              setConflict(false);
              setCode('');
            }
          }}
          footer={
            <>
              <button
                type="button"
                className="button"
                disabled={busy}
                onClick={() => {
                  setConflict(false);
                  setCode('');
                }}
              >
                이전 세션 유지
              </button>
              <button
                type="button"
                className="button primary"
                disabled={busy}
                onClick={() => void verify(true)}
              >
                이 브라우저에서 사용
              </button>
            </>
          }
        >
          <p>
            다른 브라우저 또는 기기에서 로그인 중입니다. 계속하면 기존
            ZOJ·Editor 로그인은 함께 해제됩니다.
          </p>
        </Modal>
      )}
      <div className="login-panel">
        <div className="login-icon">
          <Icon name="code" size={28} />
        </div>
        <h1>ZOJ Editor 로그인</h1>
        <p>
          ZOJ Editor에 로그인하고
          <br />
          아이디어를 검증된 문제로 완성하세요.
        </p>
        {params.get('password') === 'changed' && (
          <Notice>
            ZOJ 공통 비밀번호가 변경되었습니다. 기존 로그인은 모두 해제되었으며,
            새 비밀번호로 로그인할 수 있습니다.
          </Notice>
        )}
        {method !== 'email' && (
          <div className="login-selected-account">
            <span>{email}</span>
            <button
              className="text-button"
              type="button"
              disabled={busy}
              onClick={() => {
                setMethod('email');
                setStep(false);
                setCode('');
                setError('');
              }}
            >
              다른 이메일 사용
            </button>
          </div>
        )}
        {method === 'password' ? (
          <PasswordLogin
            email={email}
            onEmailChange={setEmail}
            onEmailLogin={() => void request()}
          />
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void (method === 'email' ? next() : step ? verify() : request());
            }}
          >
            {method === 'email' && (
              <label>
                이메일
                <input
                  type="email"
                  autoComplete="email"
                  placeholder="name@example.com"
                  required
                  disabled={busy}
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setStep(false);
                    setCode('');
                    setSentAt(0);
                    setError('');
                  }}
                />
              </label>
            )}
            {step && (
              <label>
                <span className="field-row">
                  인증번호
                  <small>
                    남은 시간 {Math.floor(expiry / 60)}:
                    {String(expiry % 60).padStart(2, '0')}
                  </small>
                </span>
                <input
                  ref={ref}
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  placeholder="6자리 인증번호"
                  value={code}
                  required
                  disabled={busy}
                  onChange={(e) => setCode(e.target.value)}
                />
              </label>
            )}
            <button
              className="button primary large"
              disabled={
                busy || !email || (method === 'otp' && step && expiry <= 0)
              }
            >
              {busy
                ? '처리 중…'
                : method === 'email'
                  ? '다음'
                  : step
                    ? '로그인'
                    : '이메일 인증번호 받기'}
              <Icon name="arrow" />
            </button>
            {step && (
              <button
                className="text-button"
                type="button"
                disabled={busy || cooldown > 0}
                onClick={() => void request()}
              >
                {cooldown > 0
                  ? `${cooldown}초 후 다시 받기`
                  : '인증번호 다시 받기'}
              </button>
            )}
            {error && <Notice tone="error">{error}</Notice>}
          </form>
        )}
        <div className="login-info">
          ZOJ와 같은 계정으로 로그인합니다.
          <br />
          비밀번호와 로그인 유지·로그아웃이 두 서비스에 함께 적용됩니다.
        </div>
      </div>
      <details className="login-help">
        <summary>
          로그인 안내 · 자주 묻는 질문
          <Icon name="down" />
        </summary>
        <p>
          인증번호는 5분 동안 유효합니다. 메일이 오지 않으면 주소와 스팸함을
          확인하고 다시 요청하세요.
        </p>
        <p>
          문제 소유자가 이메일 또는 Editor 아이디로 협업 권한을 추가할 수
          있습니다.
        </p>
      </details>
    </div>
  );
}
