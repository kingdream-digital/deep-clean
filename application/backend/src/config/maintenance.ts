import { Role } from "@prisma/client";
import { ApiError } from "../utils/ApiError";

// Mode maintenance (retour explicite du client) : pendant une mise à jour,
// plus personne ne peut se connecter ni utiliser l'application — chacun voit
// un écran d'excuse soigné qui se lève tout seul à la fin. Piloté depuis
// Coolify : MAINTENANCE_MODE=true puis « Restart » du backend (voir
// docs/DEPLOYMENT.md, § Mode maintenance).
//
// Lu dans process.env à chaque appel (et non figé au démarrage comme `env`) :
// une seule ligne lue, coût nul, et les tests peuvent l'activer à la volée.
//
// L'admin technique garde l'accès : c'est lui qui vérifie que la mise à jour
// fonctionne avant de rouvrir l'application à tout le monde.

export const DEFAULT_MAINTENANCE_MESSAGE =
  "Nous améliorons Deep Clean pour vous. Désolés pour la gêne occasionnée, réessayez dans quelques instants.";

export interface MaintenanceStatus {
  maintenance: boolean;
  message: string | null;
  until: string | null;
}

const truthy = (v: string | undefined) => v === "true" || v === "1";

export function maintenanceStatus(): MaintenanceStatus {
  if (!truthy(process.env.MAINTENANCE_MODE?.trim())) return { maintenance: false, message: null, until: null };
  const message = process.env.MAINTENANCE_MESSAGE?.trim().slice(0, 300) || DEFAULT_MAINTENANCE_MESSAGE;
  // Heure de retour prévue, facultative : « 14:30 » (aujourd'hui) ou date ISO complète.
  const raw = process.env.MAINTENANCE_UNTIL?.trim();
  const until = raw && (/^\d{1,2}[:h]\d{2}$/.test(raw) || !Number.isNaN(Date.parse(raw))) ? raw.replace("h", ":") : null;
  return { maintenance: true, message, until };
}

/** Lève une erreur 503 « MAINTENANCE » si l'application est fermée pour ce rôle. */
export function assertNotInMaintenance(role: Role) {
  const status = maintenanceStatus();
  if (status.maintenance && role !== Role.ADMIN) {
    throw new ApiError(503, "MAINTENANCE", status.message!, { until: status.until });
  }
}
