import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { roleRank } from '../auth/roles';
import type { User, ViewAs } from '../types/accounts.types';
import * as accountsApi from '../api/accounts.api';
import { deviceKindHeaders, rememberIdleSignOut, setAccessToken } from '../api/client';

interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  hasRole: (role: User['role'] | null) => boolean;
  setLanguage: (language: 'en' | 'es') => Promise<void>;
  /** View as (owner 2026-10-21): set while the owner sees Dash as `user`. Read only; the server refuses writes. */
  viewAs: ViewAs | null;
  startViewAs: (userId: number) => Promise<void>;
  stopViewAs: () => Promise<void>;
}

/** Where Back returns to: the page the owner started View as from. */
const VIEW_AS_RETURN_KEY = 'view_as_return';

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
      // Attempt a silent refresh - the httpOnly cookie carries the refresh token
      const refreshRes = await fetch('/api/auth/refresh/', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...deviceKindHeaders() },
        body: '{}',
      });

      if (!refreshRes.ok) {
        // Idle too long (D16): the sign-in page says so.
        if (refreshRes.status === 401) rememberIdleSignOut(await refreshRes.json().catch(() => null));
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

  const setLanguage = useCallback(async (language: 'en' | 'es') => {
    setUser((current) => (current ? { ...current, language } : current));
    try {
      const { data } = await accountsApi.patchMe({ language });
      setUser(data as User);
    } catch {
      // Keep the optimistic language; the next /me/ will correct it.
    }
  }, []);

  const viewAs = user?.view_as ?? null;

  /** Start: keep the view-as token and open Dash fresh, so every screen loads as that person (their landing page). */
  const startViewAs = useCallback(async (userId: number) => {
    const { data } = await accountsApi.startViewAs(userId);
    try {
      sessionStorage.setItem(VIEW_AS_RETURN_KEY, `${window.location.pathname}${window.location.search}`);
    } catch {
      // No storage: Back goes to the owner's home page.
    }
    setAccessToken(data.access);
    window.location.assign('/');
  }, []);

  /** Back: end it on the server, then reload as the owner where View as started. */
  const stopViewAs = useCallback(async () => {
    try {
      await accountsApi.stopViewAs();
    } catch {
      // Already ended: the reload below is still right.
    }
    let back = '/';
    try {
      back = sessionStorage.getItem(VIEW_AS_RETURN_KEY) || '/';
      sessionStorage.removeItem(VIEW_AS_RETURN_KEY);
    } catch {
      // No storage.
    }
    setAccessToken(null);
    window.location.assign(back.startsWith('/') ? back : '/');
  }, []);

  // Two hours at most: reload when it runs out (the server has ended it by then).
  const viewAsEnds = viewAs?.expires_at;
  useEffect(() => {
    if (!viewAsEnds) return undefined;
    const wait = new Date(viewAsEnds).getTime() - Date.now() + 1000;
    const timer = window.setTimeout(() => window.location.reload(), Math.max(wait, 1000));
    return () => window.clearTimeout(timer);
  }, [viewAsEnds]);

  const hasRole = useCallback(
    (role: User['role'] | null): boolean => {
      if (!user?.role || role == null) return false;
      return roleRank(user.role) >= roleRank(role);
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
    setLanguage,
    viewAs,
    startViewAs,
    stopViewAs,
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
