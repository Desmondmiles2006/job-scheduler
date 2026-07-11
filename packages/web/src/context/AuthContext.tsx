import { createContext, useContext, useState, useCallback } from "react";
import type { ReactNode } from "react";
import { api } from "../api";
import { loadTokens, saveTokens, clearTokens } from "../api/client";
import type { AuthUser } from "../api/client";

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (input: { orgName: string; name: string; email: string; password: string }) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const USER_KEY = "job-scheduler:user";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  });
  const [isLoading, setIsLoading] = useState(false);

  const persist = (nextUser: AuthUser) => {
    localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
    setUser(nextUser);
  };

  const login = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const res = await api.login({ email, password });
      saveTokens({ accessToken: res.accessToken, refreshToken: res.refreshToken });
      persist(res.user);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const register = useCallback(
    async (input: { orgName: string; name: string; email: string; password: string }) => {
      setIsLoading(true);
      try {
        const res = await api.register(input);
        saveTokens({ accessToken: res.accessToken, refreshToken: res.refreshToken });
        persist(res.user);
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const logout = useCallback(() => {
    clearTokens();
    localStorage.removeItem(USER_KEY);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function isAuthenticated(): boolean {
  return loadTokens() !== null;
}
