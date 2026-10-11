import { isRunningInExpoGo } from "expo";

/**
 * L'app tourne-t-elle dans Expo Go (application de test d'Expo, sans
 * installation) plutôt que dans la version installée ? Certains modules
 * natifs n'y existent pas (dictée vocale, notifications push).
 */
export function inExpoGo(): boolean {
  try {
    return isRunningInExpoGo();
  } catch {
    return false;
  }
}
