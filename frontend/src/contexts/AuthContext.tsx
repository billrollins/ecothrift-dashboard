import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { User } from '../types/accounts.types';
import * as accountsApi from '../api/accounts.api';
import { setAccessToken } from '../api/client';

interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  hasRole: (role: User['role'] | null) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  /**
   * On mount, try to restore the session by calling /auth/refresh/.
   * The httpOnly cookie is sent automatically. If it works we get an
   * access token, store it in memory, and load the user profile.
   */
  const loadUser = useCallback(async () => {
    try {
      // Attempt a silent refresh — the httpOnly cookie carries the refresh token
      const refreshRes = await fetch('/api/auth/refresh/', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });

      if (!refreshRes.ok) {
        setUser(null);
        setAccessToken(null);
        setIsLoading(false);
        return;
      }

      const refreshData = await refreshRes.json();
      setAccessToken(refreshData.access);

      const { data } = await accountsApi.getMe();
      setUser(data as User);
    } catch {
      setAccessToken(null);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  const login = useCallback(async (email: string, password: string) => {
    const { data } = await accountsApi.login(email, password);
    // Access token goes in memory; refresh token is set as httpOnly cookie by the server
    if (data.access) {
      setAccessToken(data.access);
    }
    if (data.user) {
      setUser(data.user as User);
    } else {
      const meRes = await accountsApi.getMe();
      setUser(meRes.data as User);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await accountsApi.logout();
    } catch {
      // Ignore errors on logout
    }
    setAccessToken(null);
    setUser(null);
  }, []);

  const hasRole = useCallback(
    (role: User['role'] | null): boolean => {
      if (!user?.role || role == null) return false;
      const ROLE_HIERARCHY: Record<string, number> = {
        Admin: 3,
        Manager: 2,
        Employee: 1,
        Consignee: 0,
      };
      const userLevel = ROLE_HIERARCHY[user.role] ?? -1;
      const requiredLevel = ROLE_HIERARCHY[String(role)] ?? -1;
      return userLevel >= requiredLevel;
    },
    [user]
  );

  const value: AuthContextValue = {
    user,
    isAuthenticated: !!user,
    isLoading,
    login,
    logout,
    hasRole,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
