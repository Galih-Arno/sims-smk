import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { AuthUserDto } from "@sims/shared";
import { loginRequest, logoutRequest, onSessionExpired, restoreSession } from "./api.ts";

type AuthContextValue = {
  user: AuthUserDto | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  replaceUser: (user: AuthUserDto) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUserDto | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    restoreSession()
      .then((nextUser) => {
        if (active) {
          setUser(nextUser);
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => onSessionExpired(() => setUser(null)), []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      async login(email: string, password: string) {
        const nextUser = await loginRequest(email, password);
        setUser(nextUser);
      },
      async logout() {
        await logoutRequest();
        setUser(null);
      },
      replaceUser(nextUser: AuthUserDto) {
        setUser(nextUser);
      },
    }),
    [user, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth dipakai di luar AuthProvider.");
  }
  return value;
}
