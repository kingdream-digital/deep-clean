import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import * as authApi from "../api/auth.api";
import { configureApiClient } from "../api/client";
import { clearPersistedRefreshToken, persistRefreshToken, readPersistedRefreshToken } from "./secureStorage";
import { clearCache } from "../offline/cache";
import { clearQueue } from "../offline/queue";
import { startSyncManager, stopSyncManager } from "../offline/syncManager";
import { registerForPushNotificationsAsync, unregisterCurrentPushToken } from "../notifications/push";
import { subscribeToDataChanges } from "../sync/liveSync";

type Status = "booting" | "authenticated" | "unauthenticated";

interface AuthState {
  status: Status;
  user: authApi.AuthUser | null;
  // Distingue une déconnexion volontaire d'une session expirée (refresh
  // token invalide/expiré, ou 401 renvoyé par le serveur) — pour afficher un
  // message explicite plutôt que de renvoyer silencieusement à l'écran de
  // connexion (état prévu par le cahier des charges, jusque-là jamais déclenché).
  sessionExpired: boolean;
  // Message précis affiché à l'écran de connexion (ex. compte désactivé par la RH).
  endMessage?: string;
}

interface AuthContextValue extends AuthState {
  login: (username: string, password: string, rememberMe: boolean) => Promise<void>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  // Reflète localement l'ajout/retrait de la photo de profil (Profil →
  // Apparence) une fois l'appel serveur réussi — même convention que
  // changePassword ci-dessus, pas de round-trip supplémentaire vers /auth/me.
  setHasAvatar: (value: boolean) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "booting", user: null, sessionExpired: false });

  // Les tokens vivent en mémoire (jamais dans le state React affiché/loggé) ;
  // seul le refresh token peut être persisté, et seulement si "Rester connecté" est actif.
  const accessTokenRef = useRef<string | null>(null);
  const refreshTokenRef = useRef<string | null>(null);
  const rememberMeRef = useRef(false);

  const applySession = useCallback((session: authApi.AuthResponse, rememberMe: boolean) => {
    accessTokenRef.current = session.accessToken;
    refreshTokenRef.current = session.refreshToken;
    rememberMeRef.current = rememberMe;
    setState({ status: "authenticated", user: session.user, sessionExpired: false });
  }, []);

  const clearSession = useCallback(async (reason?: "expired", endMessage?: string) => {
    accessTokenRef.current = null;
    refreshTokenRef.current = null;
    await clearPersistedRefreshToken();
    await clearCache();
    // Faille corrigée (audit sécurité mobile) : la file d'actions hors ligne
    // (offline/queue.ts — pointages, signalements) n'était jamais vidée à la
    // fin de session, seul le cache de lecture (offline/cache.ts) l'était.
    // Sur un appareil partagé, un pointage/signalement resté en file après une
    // déconnexion (réseau indisponible au moment de la synchro) aurait été
    // rejoué et attribué au COMPTE SUIVANT qui se connecte sur cet appareil
    // (processQueue() s'authentifie avec la session active au moment du
    // rejeu, pas avec celle qui a créé l'action) — usurpation d'identité pour
    // le pointage. On vide donc la file à chaque fin de session, comme le
    // cache.
    await clearQueue();
    setState({ status: "unauthenticated", user: null, sessionExpired: reason === "expired", endMessage });
  }, []);

  const refreshAccessToken = useCallback(async (): Promise<string | null> => {
    const current = refreshTokenRef.current;
    if (!current) return null;
    try {
      const session = await authApi.refreshSession(current);
      applySession(session, rememberMeRef.current);
      if (rememberMeRef.current) {
        await persistRefreshToken(session.refreshToken);
      }
      return session.accessToken;
    } catch {
      await clearSession("expired");
      return null;
    }
  }, [applySession, clearSession]);

  // Connecte le client HTTP au contexte d'authentification une seule fois.
  useEffect(() => {
    configureApiClient({
      getAccessToken: () => accessTokenRef.current,
      refreshAccessToken,
      onUnauthorized: () => {
        void clearSession("expired");
      },
    });
  }, [refreshAccessToken, clearSession]);

  // Compte modifié ailleurs (rôle, nom, désactivation par la RH) : appliqué
  // tout de suite sur cet appareil, sans attendre une reconnexion (retour
  // d'audit : les anciens menus restaient affichés).
  useEffect(() => {
    if (state.status !== "authenticated") return undefined;
    return subscribeToDataChanges(() => {
      authApi
        .fetchCurrentUser()
        .then((fresh) =>
          setState((prev) =>
            prev.status === "authenticated" && prev.user && JSON.stringify({ ...prev.user, ...fresh }) !== JSON.stringify(prev.user)
              ? { ...prev, user: { ...prev.user, ...fresh } }
              : prev
          )
        )
        .catch((err: unknown) => {
          const status = (err as { response?: { status?: number } })?.response?.status;
          const message = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
          if (status === 403 && message?.includes("désactivé")) void clearSession(undefined, message);
        });
    });
  }, [state.status, clearSession]);

  // Restauration de session au démarrage si un refresh token a été persisté
  // (c'est-à-dire si "Rester connecté" avait été activé à la dernière connexion).
  useEffect(() => {
    (async () => {
      const persisted = await readPersistedRefreshToken();
      if (!persisted) {
        setState({ status: "unauthenticated", user: null, sessionExpired: false });
        return;
      }
      refreshTokenRef.current = persisted;
      rememberMeRef.current = true;
      // En cas d'échec, `refreshAccessToken` a déjà appelé `clearSession` en
      // interne (avec la bonne raison) — pas besoin de remettre l'état ici,
      // ce qui écraserait par erreur le message "session expirée".
      await refreshAccessToken();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(
    async (username: string, password: string, rememberMe: boolean) => {
      const session = await authApi.login(username, password, rememberMe);
      applySession(session, rememberMe);
      if (rememberMe) {
        await persistRefreshToken(session.refreshToken);
      } else {
        await clearPersistedRefreshToken();
      }
    },
    [applySession]
  );

  const logout = useCallback(async () => {
    const token = refreshTokenRef.current;
    try {
      await unregisterCurrentPushToken();
      if (token) await authApi.logout(token);
    } catch {
      // La déconnexion locale doit réussir même si l'appel réseau échoue.
    } finally {
      await clearSession();
    }
  }, [clearSession]);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    await authApi.changePassword(currentPassword, newPassword);
    setState((prev) => (prev.user ? { ...prev, user: { ...prev.user, mustChangePassword: false } } : prev));
  }, []);

  const setHasAvatar = useCallback((value: boolean) => {
    setState((prev) => (prev.user ? { ...prev, user: { ...prev.user, hasAvatar: value } } : prev));
  }, []);

  // Enregistre le token push une fois connecté — best-effort, ne bloque jamais l'UI.
  useEffect(() => {
    if (state.status === "authenticated") {
      void registerForPushNotificationsAsync();
    }
  }, [state.status]);

  // Rejoue les actions mises en attente hors ligne (pointage, signalements)
  // dès la connexion établie, puis à chaque retour de réseau — jamais après
  // la déconnexion, pour ne pas synchroniser les actions d'un compte au nom
  // d'un autre sur un appareil partagé.
  useEffect(() => {
    if (state.status === "authenticated") {
      startSyncManager();
      return () => stopSyncManager();
    }
    return undefined;
  }, [state.status]);

  return (
    <AuthContext.Provider value={{ ...state, login, logout, changePassword, setHasAvatar }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth doit être utilisé à l'intérieur de <AuthProvider>.");
  }
  return ctx;
}
