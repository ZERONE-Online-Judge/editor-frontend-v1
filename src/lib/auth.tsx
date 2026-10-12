import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api, post } from './api';
import type { User } from './types';
import { AuthContext } from './authContext';
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    api<User>('/auth/me')
      .then((u) => {
        if (active) setUser(u);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  const logout = useCallback(async () => {
    await post('/auth/logout');
    setUser(null);
  }, []);
  return (
    <AuthContext.Provider value={{ user, loading, setUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
