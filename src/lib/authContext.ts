import { createContext, useContext } from 'react';
import type { User } from './types';
export const AuthContext = createContext<{
  user: User | null;
  loading: boolean;
  setUser: (user: User | null) => void;
  logout: () => Promise<void>;
}>({ user: null, loading: true, setUser: () => {}, logout: async () => {} });
export function useAuth() {
  return useContext(AuthContext);
}
