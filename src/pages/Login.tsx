import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { ApiError } from '../lib/api';
import { authRequest } from '../lib/authRequest';
import AuthenticationError from '../components/AuthenticationError';
import { useAuth } from '../lib/authContext';
import {
  editorReturnPath,
  sharedLoginUrl,
  redirectToSharedLogin,
} from '../lib/sharedLogin';
import LocalLogin from './LocalLogin';
export default function Login() {
  const { user, loading, connectionError, retryAuthentication } = useAuth();
  const [mode, setMode] = useState<'local' | 'zoj' | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (loading || user || connectionError) return;
    let active = true;
    const abort = new AbortController();
    authRequest<{ mode: 'local' | 'zoj' }>('/auth/config', abort.signal)
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
      abort.abort();
    };
  }, [loading, user, connectionError, retry]);
  useEffect(() => {
    const redirect = () => {
      if (!loading && !connectionError) redirectToSharedLogin();
    };
    window.addEventListener('zoj-central-login-required', redirect);
    return () =>
      window.removeEventListener('zoj-central-login-required', redirect);
  }, [loading, connectionError]);
  if (user) return <Navigate to={editorReturnPath()} replace />;
  if (loading)
    return (
      <div className="loading" role="status">
        계정을 확인하고 있습니다.
      </div>
    );
  if (connectionError)
    return (
      <AuthenticationError
        message={connectionError}
        onRetry={retryAuthentication}
      />
    );
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
        {!error && (
          <a className="button primary large" href={sharedLoginUrl()}>
            ZOJ 로그인으로 계속
          </a>
        )}
      </div>
    </section>
  );
}
