import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/authContext';
import {
  editorReturnPath,
  sharedLoginUrl,
  redirectToSharedLogin,
} from '../lib/sharedLogin';
import LocalLogin from './LocalLogin';
export default function Login() {
  const { user, loading } = useAuth();
  const [mode, setMode] = useState<'local' | 'zoj' | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (loading || user) return;
    let active = true;
    api<{ mode: 'local' | 'zoj' }>('/auth/config')
      .then((config) => {
        if (!active) return;
        if (config.mode === 'zoj') redirectToSharedLogin();
        setMode(config.mode);
      })
      .catch((error) => {
        if (!active) return;
        // Compatibility with an older API during a staged deployment.
        if (error instanceof ApiError && error.status === 404) setMode('local');
        else setError(true);
      });
    return () => {
      active = false;
    };
  }, [loading, user, retry]);
  useEffect(() => {
    const redirect = () => redirectToSharedLogin();
    window.addEventListener('zoj-central-login-required', redirect);
    return () =>
      window.removeEventListener('zoj-central-login-required', redirect);
  }, []);
  if (user) return <Navigate to={editorReturnPath()} replace />;
  if (mode === 'local') return <LocalLogin />;
  return (
    <section className="login-page">
      <div className="login-panel">
        <h1>ZOJ 로그인</h1>
        <p>패스키·이메일·비밀번호로 인증한 뒤 에디터로 돌아옵니다.</p>
        {error ? (
          <>
            <p role="alert">로그인 연결을 확인하지 못했습니다.</p>
            <button
              className="button"
              onClick={() => {
                setError(false);
                setRetry((value) => value + 1);
              }}
            >
              다시 시도
            </button>
          </>
        ) : (
          <p role="status">ZOJ 공통 로그인으로 이동하고 있습니다.</p>
        )}
        <a className="button primary large" href={sharedLoginUrl()}>
          ZOJ 로그인으로 계속
        </a>
      </div>
    </section>
  );
}
