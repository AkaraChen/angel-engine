import type { PropsWithChildren } from "react";

import { createContext, use, useCallback, useMemo, useState } from "react";

import { resolveDaemonConfig } from "@/platform/daemon-config";
import { readStoredToken, requestPairing, writeStoredToken } from "./session";

interface AuthContextValue {
  /** Base URL used to reach the daemon (empty string = same origin). */
  baseUrl: string;
  /** The active bearer token, or null when none is available yet. */
  token: string | null;
  /** Whether the app may talk to `/api/*` (has a token or auth isn't required). */
  isAuthenticated: boolean;
  /** Whether the daemon requires pairing before `/api/*` calls. */
  requiresAuth: boolean;
  /** Pair with the daemon using the password; throws PairingError on failure. */
  signIn: (password: string) => Promise<void>;
  /** Drop the stored token (e.g. after a 401) and return to the login screen. */
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const config = useMemo(() => resolveDaemonConfig(), []);
  const [token, setToken] = useState<string | null>(
    () => config.token ?? readStoredToken(),
  );

  const signIn = useCallback(
    async (password: string) => {
      const next = await requestPairing(config.baseUrl, password);
      writeStoredToken(next);
      setToken(next);
    },
    [config.baseUrl],
  );

  const signOut = useCallback(() => {
    writeStoredToken(null);
    setToken(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      baseUrl: config.baseUrl,
      isAuthenticated: !config.requiresAuth || token !== null,
      requiresAuth: config.requiresAuth,
      signIn,
      signOut,
      token,
    }),
    [config.baseUrl, config.requiresAuth, signIn, signOut, token],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthContextValue {
  const value = use(AuthContext);
  if (value === null) {
    throw new Error("useAuth must be used within an AuthProvider.");
  }
  return value;
}
