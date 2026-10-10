import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { idSchema } from "@aussitot/shared";
import { parse } from "../../lib/validate.ts";
import * as clients from "./clients.service.ts";
import * as catalog from "../catalog/catalog.service.ts";
import * as sites from "../sites/sites.service.ts";

const idParams = z.object({ id: idSchema });
const flag = z
  .enum(["true", "false"])
  .optional()
  .transform((v) => v === "true");

export async function clientRoutes(app: FastifyInstance): Promise<void> {
  app.get("/", async (request) =>
    clients.listClients(
      request.ctx,
      parse(
        z.object({
          q: z.string().max(100).optional(),
          cursor: idSchema.optional(),
          limit: z.coerce.number().int().min(1).max(100).default(50),
          includeArchived: flag,
        }),
        request.query,
      ),
    ),
  );
  app.post("/", async (request, reply) => {
    reply.code(201);
    return clients.createClient(request.ctx, request.body as never);
  });
  app.get("/:id", async (request) => clients.getClient(request.ctx, parse(idParams, request.params).id));
  app.patch("/:id", async (request) => clients.updateClient(request.ctx, parse(idParams, request.params).id, request.body as never));
  app.post("/:id/archive", async (request) => clients.archiveClient(request.ctx, parse(idParams, request.params).id));
}

export async function catalogRoutes(app: FastifyInstance): Promise<void> {
  app.get("/", async (request) =>
    catalog.listCatalog(request.ctx, parse(z.object({ q: z.string().max(100).optional(), includeInactive: flag }), request.query)),
  );
  app.post("/", async (request, reply) => {
    reply.code(201);
    return catalog.createCatalogItem(request.ctx, request.body as never);
  });
  app.patch("/:id", async (request) => catalog.updateCatalogItem(request.ctx, parse(idParams, request.params).id, request.body as never));
}

export async function siteRoutes(app: FastifyInstance): Promise<void> {
  app.get("/", async (request) =>
    sites.listSites(request.ctx, parse(z.object({ q: z.string().max(100).optional(), clientId: idSchema.optional() }), request.query)),
  );
  app.post("/", async (request, reply) => {
    reply.code(201);
    return sites.createSite(request.ctx, request.body as never);
  });
  app.get("/:id", async (request) => sites.getSite(request.ctx, parse(idParams, request.params).id));
  app.patch("/:id", async (request) => sites.updateSite(request.ctx, parse(idParams, request.params).id, request.body as never));
}
