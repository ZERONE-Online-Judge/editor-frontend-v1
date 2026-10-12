import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { api, post, ApiError } from './api';
import type { User } from './types';
import { AuthContext } from './authContext';
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, applyUser] = useState<User | null>(null);
  const generation = useRef(0);
  const setUser = useCallback((value: User | null) => {
    generation.current += 1;
    applyUser(value);
  }, []);
  const [loading, setLoading] = useState(true);
  const accountId = user?.account_id;
  useEffect(() => {
    let active = true;
    const version = generation.current;
    api<User>('/auth/me')
      .then((u) => {
        if (active && version === generation.current) setUser(u);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [setUser]);
  useEffect(() => {
    let active = true;
    let pending = false;
    async function refreshWhenVisible() {
      if (document.hidden || pending) return;
      const version = generation.current;
      pending = true;
      try {
        const current = await api<User>('/auth/me');
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
    <AuthContext.Provider value={{ user, loading, setUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
