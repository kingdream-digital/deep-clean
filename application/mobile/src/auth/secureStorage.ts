import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

// Stockage chiffré (Keychain iOS / Keystore Android) — utilisé uniquement pour
// persister le refresh token quand l'utilisateur a coché "Rester connecté".
// Le token d'accès (courte durée de vie) ne quitte jamais la mémoire de l'app.
const REFRESH_TOKEN_KEY = "deepclean.refreshToken";
// Activé uniquement après un premier login réussi au mot de passe — jamais
// une alternative à celui-ci, seulement un raccourci vers la session déjà
// persistée (voir AuthContext : le déverrouillage biométrique ne fait que
// rejouer refreshAccessToken() avec le refresh token déjà en Keychain/Keystore).
const BIOMETRIC_ENABLED_KEY = "deepclean.biometricEnabled";
// Identifiant à afficher sur l'écran de déverrouillage ("Bonjour Marie") —
// non sensible (déjà visible en clair dans le champ du formulaire de
// connexion), stocké seulement pour le confort visuel.
const LAST_USERNAME_KEY = "deepclean.lastUsername";

// expo-secure-store n'a AUCUNE implémentation web (voir
// node_modules/expo-secure-store/src/ExpoSecureStore.web.ts, qui exporte un
// objet vide) : chaque appel y échouait silencieusement, donc "Rester
// connecté" ne survivait jamais à un rechargement de page en mode web. On
// retombe sur localStorage sur cette plateforme — moins bien protégé qu'un
// trousseau natif (exposé à un XSS), mais c'est déjà le compromis standard de
// toute web app avec "rester connecté", et le refresh token reste courte
// durée, révocable côté serveur et jamais le mot de passe lui-même.
const isWeb = Platform.OS === "web";

export async function persistRefreshToken(token: string): Promise<void> {
  try {
    if (isWeb) {
      localStorage.setItem(REFRESH_TOKEN_KEY, token);
      return;
    }
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  } catch {
    // Ignoré volontairement : la session reste valide en mémoire pour la session en cours.
  }
}

export async function readPersistedRefreshToken(): Promise<string | null> {
  try {
    if (isWeb) {
      return localStorage.getItem(REFRESH_TOKEN_KEY);
    }
    return await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function clearPersistedRefreshToken(): Promise<void> {
  try {
    if (isWeb) {
      localStorage.removeItem(REFRESH_TOKEN_KEY);
      return;
    }
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
  } catch {
    // Ignoré volontairement.
  }
}

// Le déverrouillage biométrique n'a de sens que tant qu'une session persistée
// existe : on efface donc systématiquement ce drapeau en même temps que le
// refresh token (déconnexion volontaire, session expirée, "Rester connecté"
// décoché) plutôt que de le laisser orphelin.
export async function setBiometricLoginEnabled(enabled: boolean): Promise<void> {
  try {
    if (isWeb) {
      if (enabled) localStorage.setItem(BIOMETRIC_ENABLED_KEY, "1");
      else localStorage.removeItem(BIOMETRIC_ENABLED_KEY);
      return;
    }
    if (enabled) await SecureStore.setItemAsync(BIOMETRIC_ENABLED_KEY, "1");
    else await SecureStore.deleteItemAsync(BIOMETRIC_ENABLED_KEY);
  } catch {
    // Ignoré volontairement.
  }
}

export async function isBiometricLoginEnabled(): Promise<boolean> {
  try {
    if (isWeb) return localStorage.getItem(BIOMETRIC_ENABLED_KEY) === "1";
    return (await SecureStore.getItemAsync(BIOMETRIC_ENABLED_KEY)) === "1";
  } catch {
    return false;
  }
}

export async function persistLastUsername(username: string): Promise<void> {
  try {
    if (isWeb) {
      localStorage.setItem(LAST_USERNAME_KEY, username);
      return;
    }
    await SecureStore.setItemAsync(LAST_USERNAME_KEY, username);
  } catch {
    // Ignoré volontairement.
  }
}

export async function readLastUsername(): Promise<string | null> {
  try {
    if (isWeb) return localStorage.getItem(LAST_USERNAME_KEY);
    return await SecureStore.getItemAsync(LAST_USERNAME_KEY);
  } catch {
    return null;
  }
}
