import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { env } from "../../config/env.ts";
import { AppError } from "../../lib/errors.ts";
import { createOrganization } from "./platform.service.ts";

/** Accès opérateur : jeton dédié (jamais celui d'un utilisateur), comparé en temps constant. */
function assertPlatformToken(request: FastifyRequest): void {
  const expected = env.PLATFORM_ADMIN_TOKEN;
  const given = request.headers["x-platform-token"];
  if (!expected || typeof given !== "string") throw AppError.notFound();
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw AppError.notFound();
}

export async function platformRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", async (request) => assertPlatformToken(request));

  app.post("/organizations", { config: { rateLimit: { max: 30, timeWindow: "1 hour" } } }, async (request, reply) => {
    reply.code(201);
    return createOrganization(request.body as never);
  });
}
