import type { FastifyInstance } from "fastify";

/**
 * Modules métier protégés (montés sous /v1, après l'authentification).
 * Chaque module vérifie lui-même ses permissions dans ses services.
 */
export async function registerBusinessRoutes(_scope: FastifyInstance): Promise<void> {
  // Rempli au fil des modules (clients, catalogue, devis, factures, planning,
  // notifications, assistant, tableau de bord).
}
