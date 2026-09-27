import { logger } from "../config/logger";

// Géocodage DIRECT (adresse texte -> coordonnées) pour la position GPS de
// référence d'un chantier — retour explicite du client : il veut taper
// l'adresse à la main (comme avant), sans avoir à se déplacer physiquement
// sur place pour capturer une position GPS. Utilisé UNE SEULE FOIS, à la
// création ou à la modification de l'adresse d'un chantier (jamais à chaque
// pointage, qui reste 100% local — voir timesheets.service.ts, calcul de
// distance par formule de Haversine). L'API Adresse du gouvernement français
// (data.gouv.fr) est gratuite, sans clé, et n'est pas un service tiers
// commercial.
const API_ADRESSE_URL = "https://api-adresse.data.gouv.fr/search/";
const REQUEST_TIMEOUT_MS = 5000;

interface GeocodeResult {
  latitude: number;
  longitude: number;
}

// Best-effort, jamais bloquant : la création/modification d'un chantier doit
// toujours réussir même si ce service est lent, en panne ou ne trouve pas
// l'adresse — cette fonction ne lève donc jamais, elle retourne `null` dans
// tous les cas d'échec.
export async function geocodeAddress(address: string): Promise<GeocodeResult | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const url = `${API_ADRESSE_URL}?q=${encodeURIComponent(address)}&limit=1`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      logger.warn({ status: res.status }, "Géocodage d'adresse : réponse non-OK de l'API Adresse");
      return null;
    }

    const data = (await res.json()) as { features?: Array<{ geometry?: { coordinates?: [number, number] } }> };
    const coordinates = data.features?.[0]?.geometry?.coordinates;
    if (!coordinates) return null;

    const [longitude, latitude] = coordinates;
    return { latitude, longitude };
  } catch (err) {
    logger.warn({ err }, "Géocodage d'adresse indisponible (le chantier reste enregistré sans position GPS)");
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
