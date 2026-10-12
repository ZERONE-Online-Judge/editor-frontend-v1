import { useState } from 'react';
import { post, ApiError } from '../lib/api';
import type { User } from '../lib/types';
import { useAuth } from '../lib/authContext';
import { Notice, Modal } from './ui';
import PasswordForm from './PasswordForm';
import { PasswordInput } from './PasswordInput';

export default function PasswordLogin({
  email,
  onEmailChange,
  onEmailLogin,
}: {
  email: string;
  onEmailChange: (email: string) => void;
  onEmailLogin: () => void;
}) {
  const { setUser } = useAuth();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reset, setReset] = useState(false);
  const [message, setMessage] = useState('');
  const [conflict, setConflict] = useState(false);
  async function login(forceNewSession = false) {
    setBusy(true);
    setError('');
    try {
      const user = await post<User>('/auth/password/login', {
        email,
        password,
        force_new_session: forceNewSession,
      });
      setConflict(false);
      setPassword('');
      setUser(user);
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
  if (reset)
    return (
      <>
        <h2>비밀번호 찾기</h2>
        <PasswordForm
          mode="reset"
          email={email}
          onDone={(address) => {
            onEmailChange(address);
            setPassword('');
            setReset(false);
            setMessage(
              '비밀번호가 변경되었습니다. 새 비밀번호로 로그인하세요.',
            );
          }}
        />
        <button
          type="button"
          className="text-button"
          onClick={() => setReset(false)}
        >
          로그인으로 돌아가기
        </button>
      </>
    );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void login();
      }}
    >
      {conflict && (
        <Modal
          title="기존 로그인 연결을 끊을까요?"
          onClose={() => {
            if (!busy) {
              setConflict(false);
              setPassword('');
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
                  setPassword('');
                }}
              >
                이전 세션 유지
              </button>
              <button
                type="button"
                className="button primary"
                disabled={busy}
                onClick={() => void login(true)}
              >
                이 브라우저에서 사용
              </button>
            </>
          }
        >
          <p>
            계속하면 다른 브라우저·기기의 ZOJ와 Editor 로그인은 함께 해제됩니다.
          </p>
        </Modal>
      )}
      <PasswordInput
        label="비밀번호"
        autoComplete="current-password"
        maxLength={128}
        required
        value={password}
        disabled={busy}
        onChange={(e) => setPassword(e.target.value)}
      />
      <button className="button primary large" disabled={busy}>
        {busy ? '로그인 중…' : '비밀번호로 로그인'}
      </button>
      <button
        type="button"
        className="text-button"
        disabled={busy}
        onClick={() => {
          setPassword('');
          onEmailLogin();
        }}
      >
        이메일로 대신 로그인
      </button>
      <button
        type="button"
        className="text-button"
        disabled={busy}
        onClick={() => {
          setPassword('');
          setReset(true);
          setError('');
        }}
      >
        비밀번호 찾기
      </button>
      {message && <Notice>{message}</Notice>}
      {error && <Notice tone="error">{error}</Notice>}
      <p className="muted">
        처음 이용하거나 비밀번호를 등록하지 않았다면 이메일 인증번호로
        로그인하세요.
      </p>
    </form>
  );
}
