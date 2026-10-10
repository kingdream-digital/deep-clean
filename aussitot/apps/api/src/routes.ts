import type { FastifyInstance } from "fastify";
import { catalogRoutes, clientRoutes, siteRoutes } from "./modules/clients/clients.routes.ts";
import { quoteRoutes } from "./modules/quotes/quotes.routes.ts";
import { invoiceRoutes } from "./modules/invoices/invoices.routes.ts";
import { missionRoutes } from "./modules/missions/missions.routes.ts";
import { eventStreamRoutes, notificationRoutes } from "./modules/notifications/notifications.routes.ts";
import { dashboardRoutes } from "./modules/dashboard/dashboard.routes.ts";
import { assistantRoutes } from "./modules/assistant/assistant.routes.ts";

/**
 * Modules métier protégés (montés sous /v1, après l'authentification).
 * Chaque service vérifie lui-même ses permissions : une route ne fait
 * qu'aiguiller vers le service, jamais plus.
 */
export async function registerBusinessRoutes(scope: FastifyInstance): Promise<void> {
  await scope.register(clientRoutes, { prefix: "/clients" });
  await scope.register(catalogRoutes, { prefix: "/catalog" });
  await scope.register(siteRoutes, { prefix: "/sites" });
  await scope.register(quoteRoutes, { prefix: "/quotes" });
  await scope.register(invoiceRoutes, { prefix: "/invoices" });
  await scope.register(missionRoutes, { prefix: "/missions" });
  await scope.register(notificationRoutes, { prefix: "/notifications" });
  await scope.register(eventStreamRoutes, { prefix: "/events" });
  await scope.register(dashboardRoutes);
  await scope.register(assistantRoutes, { prefix: "/assistant" });
}
