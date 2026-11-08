import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { post, ApiError } from './api';
import { authRequest, AuthRequestTimeoutError } from './authRequest';
import type { User } from './types';
import { AuthContext } from './authContext';
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, applyUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const generation = useRef(0);
  const checkingAccount = useRef(true);
  const setUser = useCallback((value: User | null) => {
    generation.current += 1;
    checkingAccount.current = false;
    applyUser(value);
    setLoading(false);
    setConnectionError(null);
  }, []);
  const retryAuthentication = useCallback(() => {
    generation.current += 1;
    checkingAccount.current = true;
    setLoading(true);
    setConnectionError(null);
    setAttempt((previous) => previous + 1);
  }, []);
  const accountId = user?.account_id;
  useEffect(() => {
    let active = true;
    const abort = new AbortController();
    const version = generation.current;
    authRequest<User>('/auth/me', abort.signal)
      .then((u) => {
        if (active && version === generation.current) setUser(u);
      })
      .catch((error) => {
        if (!active || version !== generation.current) return;
        if (error instanceof ApiError && error.status === 401) setUser(null);
        else
          setConnectionError(
            error instanceof AuthRequestTimeoutError
              ? error.message
              : '로그인 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.',
          );
      })
      .finally(() => {
        if (active && version === generation.current) {
          checkingAccount.current = false;
          setLoading(false);
        }
      });
    return () => {
      active = false;
      abort.abort();
    };
  }, [attempt, setUser]);
  useEffect(() => {
    let active = true;
    let pending = false;
    const abort = new AbortController();
    async function refreshWhenVisible() {
      if (checkingAccount.current || document.hidden || pending) return;
      const version = generation.current;
      pending = true;
      try {
        const current = await authRequest<User>('/auth/me', abort.signal);
        if (active && version === generation.current) setUser(current);
      } catch (e) {
        if (
          active &&
          version === generation.current &&
          e instanceof ApiError &&
          e.status === 401
        )
          setUser(null);
      } finally {
        pending = false;
      }
    }
    window.addEventListener('focus', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    const stream =
      accountId && typeof EventSource !== 'undefined'
        ? new EventSource('/api/auth/session-events')
        : null;
    stream?.addEventListener('session_revoked', () => {
      if (active) {
        setUser(null);
        void refreshWhenVisible();
      }
    });
    stream?.addEventListener('error', () => {
      void refreshWhenVisible();
    });
    return () => {
      active = false;
      abort.abort();
      window.removeEventListener('focus', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
      stream?.close();
    };
  }, [accountId, setUser]);
  const logout = useCallback(async () => {
    await post('/auth/logout');
    setUser(null);
  }, [setUser]);
  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        connectionError,
        retryAuthentication,
        setUser,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
