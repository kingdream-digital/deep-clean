import AsyncStorage from "@react-native-async-storage/async-storage";

// Cache local générique (fondation du mode hors connexion) : chaque écran de
// consultation (planning, missions, notifications...) peut y stocker la
// dernière réponse serveur connue et la resservir si le réseau est indisponible.
// Ne couvre que la LECTURE — les actions qui écrivent (créer/modifier/annuler
// une mission, signaler un problème...) nécessitent toujours une connexion et
// échouent proprement (voir StateView kind="offline") plutôt que d'être mises
// en file pour une synchronisation différée, qui reste hors périmètre de cette
// fondation (cf. docs/ARCHITECTURE.md, section "hors périmètre").
const PREFIX = "deepclean.cache.";

interface CacheEnvelope<T> {
  data: T;
  cachedAt: string;
}

export async function readCache<T>(key: string): Promise<{ data: T; cachedAt: string } | null> {
  try {
    const raw = await AsyncStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEnvelope<T>;
    return parsed;
  } catch {
    return null;
  }
}

export async function writeCache<T>(key: string, data: T): Promise<void> {
  try {
    const envelope: CacheEnvelope<T> = { data, cachedAt: new Date().toISOString() };
    await AsyncStorage.setItem(PREFIX + key, JSON.stringify(envelope));
  } catch {
    // Le cache est un confort, jamais une exigence — une écriture échouée (stockage
    // plein, etc.) ne doit pas interrompre l'utilisateur.
  }
}

// À appeler à chaque fin de session (déconnexion volontaire OU expiration) —
// faille de confidentialité corrigée : les clés de ce cache n'étaient PAS
// scopées par utilisateur et rien ne les purgeait jamais. Sur un appareil
// partagé entre plusieurs employés, une deuxième personne qui se connectait
// pouvait voir le planning/les missions/les notifications de la précédente
// tant qu'un premier appel réseau n'avait pas encore rafraîchi l'écran.
export async function clearCache(): Promise<void> {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const cacheKeys = allKeys.filter((k) => k.startsWith(PREFIX));
    if (cacheKeys.length > 0) {
      await AsyncStorage.multiRemove(cacheKeys);
    }
  } catch {
    // Best-effort : ne doit jamais bloquer la déconnexion.
  }
}
