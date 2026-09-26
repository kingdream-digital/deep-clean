import AsyncStorage from "@react-native-async-storage/async-storage";

// Un simple indicateur d'affichage, non sensible — même principe que
// theme/themePreference.ts. Clé PAR UTILISATEUR (pas juste par appareil) :
// plusieurs comptes peuvent se connecter successivement sur le même
// téléphone/poste, chacun doit voir son propre tutoriel au moins une fois.
function storageKey(userId: string): string {
  return `deepclean.onboardingSeen.${userId}`;
}

export async function readOnboardingSeen(userId: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(storageKey(userId))) === "1";
  } catch {
    // Erreur de lecture (stockage indisponible) : impossible de savoir si le
    // tutoriel a déjà été vu, on préfère ne pas gêner l'utilisateur avec un
    // tutoriel qui réapparaîtrait à chaque lancement plutôt que le bloquer.
    return true;
  }
}

export async function markOnboardingSeen(userId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(storageKey(userId), "1");
  } catch {
    // Ignoré volontairement : le tutoriel reste fermé pour la session en cours.
  }
}
