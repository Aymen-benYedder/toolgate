import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { getToken, setToken } from "../lib/api";

interface AuthState {
  token: string | null;
  email: string | null;
  login: (token: string, email: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

/** Auth provider — JWT lives in localStorage (12h expiry, spec §8). */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(() => getToken());
  const [email, setEmail] = useState<string | null>(() => localStorage.getItem("toolgate_email"));

  const login = useCallback((t: string, e: string) => {
    setToken(t);
    localStorage.setItem("toolgate_email", e);
    setTokenState(t);
    setEmail(e);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    localStorage.removeItem("toolgate_email");
    setTokenState(null);
    setEmail(null);
  }, []);

  const value = useMemo(() => ({ token, email, login, logout }), [token, email, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}