import axios from "axios";

// Mode maintenance (retour explicite du client) : pendant une mise à jour,
// le serveur répond « 503 MAINTENANCE » à tout le monde sauf l'admin
// technique. Dès qu'une réponse de ce type arrive (ou que /status l'annonce
// au démarrage), l'écran de maintenance recouvre l'application ; il se lève
// tout seul quand le serveur rouvre. Voir components/MaintenanceGate.tsx.

export interface MaintenanceInfo {
  message: string | null;
  until: string | null;
}

type Listener = (info: MaintenanceInfo | null) => void;
const listeners = new Set<Listener>();
let current: MaintenanceInfo | null = null;

export function getMaintenance(): MaintenanceInfo | null {
  return current;
}

export function subscribeToMaintenance(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function set(next: MaintenanceInfo | null, force = false) {
  if (!force && JSON.stringify(next) === JSON.stringify(current)) return;
  current = next;
  for (const l of [...listeners]) {
    try {
      l(next);
    } catch {
      // Un abonné en erreur n'empêche jamais les autres d'être prévenus.
    }
  }
}

/** Réponse « 503 MAINTENANCE » reçue : toujours signalée (réaffiche l'écran). */
export function reportMaintenance(info: MaintenanceInfo): void {
  set(info, true);
}

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

/**
 * Interroge l'état public du serveur. Client HTTP nu (pas `apiClient`) :
 * aucun jeton envoyé, aucun intercepteur de session. Serveur injoignable :
 * état inchangé (l'absence de réseau a déjà son propre bandeau).
 */
export async function checkMaintenance(): Promise<MaintenanceInfo | null> {
  try {
    const { data } = await axios.get<{ maintenance: boolean; message: string | null; until: string | null }>(`${API_URL}/status`, { timeout: 8000 });
    set(data.maintenance ? { message: data.message, until: data.until } : null);
  } catch {
    // On garde l'état connu.
  }
  return current;
}
