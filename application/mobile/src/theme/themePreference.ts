import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ThemeMode } from "./colors";

// Préférence d'apparence (clair/sombre) : un simple choix d'affichage, non
// sensible — AsyncStorage suffit, pas besoin du trousseau chiffré utilisé pour
// le refresh token (voir auth/secureStorage.ts). Par défaut l'app est en
// clair (retour explicite du client, voir ThemeProvider.tsx) ; l'absence de
// valeur stockée doit donc toujours être interprétée comme "clair", jamais
// comme "suivre le système".
const THEME_KEY = "deepclean.themePreference";

export async function readThemePreference(): Promise<ThemeMode | null> {
  try {
    const raw = await AsyncStorage.getItem(THEME_KEY);
    return raw === "dark" || raw === "light" ? raw : null;
  } catch {
    return null;
  }
}

export async function persistThemePreference(mode: ThemeMode): Promise<void> {
  try {
    await AsyncStorage.setItem(THEME_KEY, mode);
  } catch {
    // Ignoré volontairement : la préférence reste active en mémoire pour la session en cours.
  }
}
