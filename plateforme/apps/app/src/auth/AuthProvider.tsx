import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { can, type Permission, type SessionUserDto } from "@aussitot/shared";
import { clearSession, onSessionChange, refreshSession, storeSession } from "@/api/client";
import { endpoints } from "@/api/endpoints";
import { persister, queryClient } from "@/api/queryClient";
import { unregisterPushNotifications } from "@/notifications/push";

type Status = "loading" | "signedOut" | "signedIn";

interface AuthValue {
  status: Status;
  user: SessionUserDto | null;
  lastOrganization: string | null;
  login: (input: { organization: string; identifier: string; password: string; rememberMe: boolean }) => Promise<SessionUserDto>;
  logout: () => Promise<void>;
  changePassword: (current: string, next: string) => Promise<void>;
  can: (permission: Permission) => boolean;
}

const AuthContext = createContext<AuthValue | null>(null);
const LAST_ORG_KEY = "aussitot.lastOrganization";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [user, setUser] = useState<SessionUserDto | null>(null);
  const [lastOrganization, setLastOrganization] = useState<string | null>(null);

  // Restauration de la session au démarrage (« Rester connecté »).
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(LAST_ORG_KEY)
      .then((slug) => active && setLastOrganization(slug))
      .catch(() => undefined);
    refreshSession()
      .then((session) => {
        if (!active) return;
        setUser(session?.user ?? null);
        setStatus(session ? "signedIn" : "signedOut");
      })
      .catch(() => active && setStatus("signedOut"));
    return () => {
      active = false;
    };
  }, []);

  // Session renouvelée (rôle à jour) ou perdue (révoquée, compte désactivé).
  useEffect(
    () =>
      onSessionChange((session) => {
        if (session) {
          setUser(session.user);
          setStatus("signedIn");
        } else {
          setUser(null);
          setStatus("signedOut");
          queryClient.clear();
        }
      }),
    [],
  );

  const login = useCallback<AuthValue["login"]>(async (input) => {
    const session = await endpoints.auth.login(input);
    await storeSession(session, input.rememberMe);
    await AsyncStorage.setItem(LAST_ORG_KEY, input.organization.trim().toLowerCase()).catch(() => undefined);
    setLastOrganization(input.organization.trim().toLowerCase());
    queryClient.clear();
    setUser(session.user);
    setStatus("signedIn");
    return session.user;
  }, []);

  const logout = useCallback(async () => {
    await unregisterPushNotifications().catch(() => undefined);
    await endpoints.auth.logout().catch(() => undefined);
    await clearSession();
    queryClient.clear();
    await Promise.resolve(persister.removeClient()).catch(() => undefined);
    setUser(null);
    setStatus("signedOut");
  }, []);

  const changePassword = useCallback(async (current: string, next: string) => {
    await endpoints.auth.changePassword(current, next);
    const me = await endpoints.auth.me();
    setUser(me);
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      status,
      user,
      lastOrganization,
      login,
      logout,
      changePassword,
      can: (permission) => (user ? can(user.role, permission) : false),
    }),
    [status, user, lastOrganization, login, logout, changePassword],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth doit être utilisé dans AuthProvider");
  return value;
}
