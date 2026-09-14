import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ApiError, api, apiPost, errorMessage } from '../lib/api';
import type { ApiUser, Portal } from '../types';

interface RegisterPayload {
  portal: Portal;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
  avatar?: { data: string; name?: string; mimeType?: string };
  matricNumber?: string;
  departmentId?: string;
  level?: string;
  username?: string;
  dateOfBirth?: string;
  staffId?: string;
  isHOD?: boolean;
}

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

/**
 * How the current session was obtained:
 *  - `'fresh'`     — a sign-in or sign-up just happened in this tab.
 *  - `'restored'`  — the session was recovered from the cookie on page load.
 *  - `null`        — booting, or signed out.
 * The shell uses this to decide whether a new sign-in must be sent to the
 * role's home page, or may keep the deep link the user reloaded from.
 */
export type SessionSource = 'fresh' | 'restored';

interface AuthContextValue {
  user: ApiUser | null;
  booting: boolean;
  status: AuthStatus;
  sessionSource: SessionSource | null;
  setUser: (user: ApiUser | null) => void;
  login: (portal: Portal, email: string, password: string) => Promise<ApiUser>;
  register: (payload: RegisterPayload) => Promise<ApiUser>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<ApiUser | null>(null);
  const [booting, setBooting] = useState(true);
  const [sessionSource, setSessionSource] = useState<SessionSource | null>(null);

  /** Restores the session on load — this is what makes a refresh keep you signed in. */
  const refresh = useCallback(async () => {
    try {
      const me = await api<{ user: ApiUser }>('/api/auth/me');
      setUser(me.user);
      setSessionSource('restored');
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setUser(null);
        setSessionSource(null);
      } else throw err;
    }
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        await refresh();
      } catch {
        if (active) setUser(null);
      } finally {
        if (active) setBooting(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [refresh]);

  const login = useCallback(async (portal: Portal, email: string, password: string) => {
    const res = await apiPost<{ user: ApiUser }>('/api/auth/login', { portal, email, password });
    setUser(res.user);
    setSessionSource('fresh');
    return res.user;
  }, []);

  const register = useCallback(async (payload: RegisterPayload) => {
    const res = await apiPost<{ user: ApiUser }>('/api/auth/register', payload);
    setUser(res.user);
    setSessionSource('fresh');
    return res.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiPost('/api/auth/logout');
    } catch (err) {
      // Even if the request fails we must not leave a phantom session in the UI.
      console.warn(errorMessage(err, 'Logout request failed'));
    }
    setUser(null);
    setSessionSource(null);
  }, []);

  const status: AuthStatus = booting ? 'loading' : user ? 'authenticated' : 'unauthenticated';

  const value = useMemo(
    () => ({ user, booting, status, sessionSource, setUser, login, register, logout, refresh }),
    [user, booting, status, sessionSource, login, register, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
