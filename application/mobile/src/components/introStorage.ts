import AsyncStorage from "@react-native-async-storage/async-storage";

// L'animation d'ouverture se joue une fois par jour et par appareil (retour
// explicite du client : « la première fois de la journée qu'on ouvre
// l'app », connecté ou non).
const KEY = "deepclean.introDay";

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Vrai si l'animation doit être jouée maintenant ; la marque comme vue pour aujourd'hui. */
export async function claimDailyIntro(): Promise<boolean> {
  try {
    const today = todayKey();
    if ((await AsyncStorage.getItem(KEY)) === today) return false;
    await AsyncStorage.setItem(KEY, today);
    return true;
  } catch {
    // Stockage indisponible : on ne rejoue pas l'animation à chaque écran.
    return false;
  }
}
