import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

// Stockage chiffré (Keychain iOS / Keystore Android) — utilisé uniquement pour
// persister le refresh token quand l'utilisateur a coché "Rester connecté".
// Le token d'accès (courte durée de vie) ne quitte jamais la mémoire de l'app.
const REFRESH_TOKEN_KEY = "deepclean.refreshToken";

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
