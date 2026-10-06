import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import * as authApi from "../api/auth.api";
import { configureApiClient } from "../api/client";
import {
  clearPersistedRefreshToken,
  isBiometricLoginEnabled,
  persistLastUsername,
  persistRefreshToken,
  readLastUsername,
  readPersistedRefreshToken,
  setBiometricLoginEnabled,
} from "./secureStorage";
import { authenticateWithBiometrics, getAvailableBiometricKind, type BiometricKind } from "./biometrics";
import { clearCache } from "../offline/cache";
import { clearQueue } from "../offline/queue";
import { startSyncManager, stopSyncManager } from "../offline/syncManager";
import { registerForPushNotificationsAsync, unregisterCurrentPushToken } from "../notifications/push";

// "locked" : une session persistée (Rester connecté) existe sur l'appareil ET
// le déverrouillage biométrique est activé, mais pas encore réussi pour ce
// lancement de l'app — l'écran de connexion propose alors Face ID/Touch ID
// au lieu du formulaire mot de passe (voir unlockWithBiometrics ci-dessous).
type Status = "booting" | "authenticated" | "unauthenticated" | "locked";

interface AuthState {
  status: Status;
  user: authApi.AuthUser | null;
  // Distingue une déconnexion volontaire d'une session expirée (refresh
  // token invalide/expiré, ou 401 renvoyé par le serveur) — pour afficher un
  // message explicite plutôt que de renvoyer silencieusement à l'écran de
  // connexion (état prévu par le cahier des charges, jusque-là jamais déclenché).
  sessionExpired: boolean;
  // Session persistée sur cet appareil ("Rester connecté" actif) — condition
  // nécessaire pour pouvoir activer le déverrouillage biométrique, puisque
  // celui-ci ne fait que rejouer le refresh token déjà en Keychain/Keystore.
  rememberMe: boolean;
  biometricEnabled: boolean;
  // Type détecté sur l'appareil (Face ID, empreinte...), pour le libellé à
  // l'écran — jamais un identifiant, juste de l'UI.
  biometricKind: BiometricKind | null;
  // Identifiant à afficher sur l'écran de déverrouillage quand status === "locked".
  lockedUsername: string | null;
}

interface AuthContextValue extends AuthState {
  login: (username: string, password: string, rememberMe: boolean) => Promise<void>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  // Reflète localement l'ajout/retrait de la photo de profil (Profil →
  // Apparence) une fois l'appel serveur réussi — même convention que
  // changePassword ci-dessus, pas de round-trip supplémentaire vers /auth/me.
  setHasAvatar: (value: boolean) => void;
  // Rejoue le refresh token déjà persisté après confirmation biométrique —
  // ne remplace jamais le mot de passe, seulement un raccourci vers la
  // session déjà ouverte au dernier "Rester connecté".
  unlockWithBiometrics: () => Promise<boolean>;
  // Abandonne le déverrouillage biométrique pour ce lancement de l'app et
  // revient au formulaire mot de passe classique, sans rien désactiver.
  useFallbackPassword: () => void;
  enableBiometricLogin: () => Promise<boolean>;
  disableBiometricLogin: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const initialState: AuthState = {
  status: "booting",
  user: null,
  sessionExpired: false,
  rememberMe: false,
  biometricEnabled: false,
  biometricKind: null,
  lockedUsername: null,
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>(initialState);

  // Les tokens vivent en mémoire (jamais dans le state React affiché/loggé) ;
  // seul le refresh token peut être persisté, et seulement si "Rester connecté" est actif.
  const accessTokenRef = useRef<string | null>(null);
  const refreshTokenRef = useRef<string | null>(null);
  const rememberMeRef = useRef(false);
  const biometricEnabledRef = useRef(false);

  const applySession = useCallback((session: authApi.AuthResponse, rememberMe: boolean, biometricEnabled: boolean) => {
    accessTokenRef.current = session.accessToken;
    refreshTokenRef.current = session.refreshToken;
    rememberMeRef.current = rememberMe;
    biometricEnabledRef.current = biometricEnabled;
    setState((prev) => ({
      ...prev,
      status: "authenticated",
      user: session.user,
      sessionExpired: false,
      rememberMe,
      biometricEnabled,
      lockedUsername: null,
    }));
  }, []);

  const clearSession = useCallback(async (reason?: "expired") => {
    accessTokenRef.current = null;
    refreshTokenRef.current = null;
    rememberMeRef.current = false;
    biometricEnabledRef.current = false;
    await clearPersistedRefreshToken();
    // Le déverrouillage biométrique n'a de sens que tant qu'une session
    // persistée existe : on l'éteint avec elle (déconnexion, session expirée).
    await setBiometricLoginEnabled(false);
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
    setState({
      status: "unauthenticated",
      user: null,
      sessionExpired: reason === "expired",
      rememberMe: false,
      biometricEnabled: false,
      biometricKind: null,
      lockedUsername: null,
    });
  }, []);

  const refreshAccessToken = useCallback(async (): Promise<string | null> => {
    const current = refreshTokenRef.current;
    if (!current) return null;
    try {
      const session = await authApi.refreshSession(current);
      applySession(session, rememberMeRef.current, biometricEnabledRef.current);
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

  // Restauration de session au démarrage si un refresh token a été persisté
  // (c'est-à-dire si "Rester connecté" avait été activé à la dernière connexion).
  // Si en plus le déverrouillage biométrique est activé, on s'arrête à
  // "locked" : l'écran de connexion propose Face ID/Touch ID au lieu de
  // rejouer le refresh token tout de suite, pour qu'un appareil perdu ou
  // volé déverrouillé (mais pas authentifié) ne rouvre pas la session seul.
  useEffect(() => {
    (async () => {
      const persisted = await readPersistedRefreshToken();
      if (!persisted) {
        setState((prev) => ({ ...prev, status: "unauthenticated", user: null, sessionExpired: false }));
        return;
      }
      refreshTokenRef.current = persisted;
      rememberMeRef.current = true;
      const biometricOn = await isBiometricLoginEnabled();
      if (biometricOn) {
        const kind = await getAvailableBiometricKind();
        if (kind) {
          biometricEnabledRef.current = true;
          const lastUsername = await readLastUsername();
          setState((prev) => ({
            ...prev,
            status: "locked",
            user: null,
            sessionExpired: false,
            rememberMe: true,
            biometricEnabled: true,
            biometricKind: kind,
            lockedUsername: lastUsername,
          }));
          return;
        }
        // Le réglage biométrique était activé, mais l'appareil ne propose
        // plus de Face ID/Touch ID enrôlé (désenrôlement, changement
        // d'appareil restauré depuis une sauvegarde...) — on retombe
        // silencieusement sur la restauration normale plutôt que de bloquer
        // l'utilisateur sur un écran de déverrouillage impossible à résoudre.
        await setBiometricLoginEnabled(false);
      }
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
      // Un nouveau mot de passe pour le MÊME compte (ex. depuis l'écran de
      // déverrouillage, "Se connecter avec mon mot de passe" après un refus
      // de Face ID) laisse le déverrouillage biométrique tel quel. Un compte
      // DIFFÉRENT — appareil partagé — ou "Rester connecté" décoché cette
      // fois (rien à déverrouiller au prochain lancement) repart toujours
      // désactivé : jamais hérité du compte ou de la session précédente.
      const previousUsername = await readLastUsername();
      const sameAccount = previousUsername === session.user.username;
      const keepBiometric = rememberMe && sameAccount && (await isBiometricLoginEnabled());
      if (!keepBiometric) {
        await setBiometricLoginEnabled(false);
      }
      applySession(session, rememberMe, keepBiometric);
      if (rememberMe) {
        await persistRefreshToken(session.refreshToken);
        await persistLastUsername(session.user.username);
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

  // Rejoue le refresh token déjà persisté, après confirmation Face ID/Touch
  // ID — jamais une alternative au mot de passe, seulement un raccourci vers
  // la session déjà ouverte (status === "locked" uniquement).
  const unlockWithBiometrics = useCallback(async (): Promise<boolean> => {
    const kind = await getAvailableBiometricKind();
    const ok = await authenticateWithBiometrics("Déverrouillez Deep Clean");
    if (!ok) return false;
    biometricEnabledRef.current = true;
    setState((prev) => ({ ...prev, biometricKind: kind }));
    const accessToken = await refreshAccessToken();
    return !!accessToken;
  }, [refreshAccessToken]);

  // Abandonne le déverrouillage biométrique pour ce lancement-ci et revient
  // au formulaire mot de passe classique, sans rien désactiver côté réglages
  // (prochain lancement : l'écran de déverrouillage reviendra).
  const useFallbackPassword = useCallback(() => {
    setState((prev) => ({ ...prev, status: "unauthenticated", lockedUsername: null }));
  }, []);

  // Activable uniquement après un login au mot de passe réussi avec "Rester
  // connecté" (sinon aucune session persistée à déverrouiller plus tard) —
  // exige une confirmation biométrique immédiate, pour ne jamais activer un
  // raccourci que l'utilisateur n'a pas lui-même validé avec son visage/son
  // empreinte.
  const enableBiometricLogin = useCallback(async (): Promise<boolean> => {
    if (!rememberMeRef.current) return false;
    const kind = await getAvailableBiometricKind();
    if (!kind) return false;
    const ok = await authenticateWithBiometrics("Confirmez pour activer le déverrouillage rapide");
    if (!ok) return false;
    await setBiometricLoginEnabled(true);
    biometricEnabledRef.current = true;
    setState((prev) => ({ ...prev, biometricEnabled: true, biometricKind: kind }));
    return true;
  }, []);

  const disableBiometricLogin = useCallback(async () => {
    await setBiometricLoginEnabled(false);
    biometricEnabledRef.current = false;
    setState((prev) => ({ ...prev, biometricEnabled: false }));
  }, []);

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
    <AuthContext.Provider
      value={{
        ...state,
        login,
        logout,
        changePassword,
        setHasAvatar,
        unlockWithBiometrics,
        useFallbackPassword,
        enableBiometricLogin,
        disableBiometricLogin,
      }}
    >
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
