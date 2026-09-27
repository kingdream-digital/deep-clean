import { logger } from "../config/logger";

// Géocodage inverse (coordonnées -> adresse lisible) pour le justificatif de
// pointage (retour explicite du client : il veut l'adresse affichée
// directement à côté de la photo, sans avoir à cliquer sur un lien vers une
// carte). Nominatim (OpenStreetMap) est utilisé parce qu'il est gratuit et ne
// nécessite aucune clé API — suffisant pour le volume d'une petite entreprise
// (quelques dizaines de pointages par jour), dans le respect de sa politique
// d'usage (un User-Agent identifiable, jamais d'usage massif).
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/reverse";
const REQUEST_TIMEOUT_MS = 4000;

// Best-effort, jamais bloquant : un pointage doit toujours réussir même si ce
// service tiers est lent, en panne, ou inaccessible depuis le serveur — cette
// fonction ne lève donc jamais, elle retourne `null` dans tous les cas
// d'échec (réseau, timeout, réponse invalide).
export async function reverseGeocode(latitude: number, longitude: number): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const url = `${NOMINATIM_URL}?format=jsonv2&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=0`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        // Exigé par la politique d'utilisation de Nominatim : identifie
        // l'application appelante (jamais un simple User-Agent HTTP par défaut).
        "User-Agent": "DeepCleanApp/1.0 (pointage justificatif interne)",
        "Accept-Language": "fr",
      },
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, "Géocodage inverse : réponse non-OK de Nominatim");
      return null;
    }

    const data = (await res.json()) as { display_name?: string };
    return data.display_name ?? null;
  } catch (err) {
    logger.warn({ err }, "Géocodage inverse indisponible (le pointage reste enregistré sans adresse)");
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
