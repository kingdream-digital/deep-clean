import Fastify, { type FastifyBaseLogger, type FastifyError, type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import multipart from "@fastify/multipart";
import { createHash } from "node:crypto";
import { env } from "./config/env.ts";
import { logger } from "./lib/logger.ts";
import { AppError } from "./lib/errors.ts";
import { pingDatabase, uuidv7 } from "./lib/db.ts";
import { createRedis, pingRedis } from "./lib/redis.ts";
import { httpDuration, registry } from "./lib/metrics.ts";
import { authenticate } from "./plugins/auth.ts";
import { authRoutes } from "./modules/auth/auth.routes.ts";
import { userRoutes } from "./modules/users/users.routes.ts";
import { organizationRoutes } from "./modules/organization/organization.routes.ts";
import { platformRoutes } from "./modules/platform/platform.routes.ts";
import { registerBusinessRoutes } from "./routes.ts";

/** Clé de limitation de débit : la session (jeton) si connecté, sinon l'adresse IP. */
function rateLimitKey(request: { headers: Record<string, unknown>; ip: string }): string {
  const auth = request.headers.authorization;
  if (typeof auth === "string" && auth.startsWith("Bearer ")) {
    return "t:" + createHash("sha256").update(auth).digest("base64url").slice(0, 22);
  }
  return "ip:" + request.ip;
}

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    loggerInstance: logger as unknown as FastifyBaseLogger,
    trustProxy: env.TRUST_PROXY,
    bodyLimit: 1024 * 1024,
    genReqId: (req) => {
      const incoming = req.headers["x-request-id"];
      return typeof incoming === "string" && /^[\w-]{8,64}$/.test(incoming) ? incoming : uuidv7();
    },
  });

  await app.register(helmet, { contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: "same-site" } });
  await app.register(cors, {
    origin: env.isProduction ? env.corsOrigins : env.corsOrigins.length ? env.corsOrigins : true,
    credentials: true,
    // Liste explicite : par défaut seuls GET, HEAD et POST seraient permis depuis le navigateur.
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"],
    exposedHeaders: ["x-request-id", "content-disposition"],
    maxAge: 600,
  });
  await app.register(cookie);
  await app.register(rateLimit, {
    global: true,
    max: env.RATE_LIMIT_PER_MINUTE,
    timeWindow: "1 minute",
    redis: createRedis("rate-limit", { connectTimeout: 500, maxRetriesPerRequest: 1 }),
    nameSpace: "rl:",
    skipOnError: true,
    keyGenerator: rateLimitKey,
    errorResponseBuilder: (_request, context) =>
      Object.assign(AppError.tooManyRequests(`Trop de requêtes. Réessayez dans ${Math.ceil(context.ttl / 1000)} secondes.`), {
        statusCode: 429,
      }),
  });
  await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 10 } });

  app.addHook("onSend", async (request, reply) => {
    reply.header("x-request-id", request.id);
  });
  app.addHook("onResponse", async (request, reply) => {
    httpDuration.observe(
      { method: request.method, route: request.routeOptions.url ?? "inconnue", status: String(reply.statusCode) },
      reply.elapsedTime / 1000,
    );
  });

  app.setErrorHandler((error: FastifyError | AppError, request, reply) => {
    if (error instanceof AppError) {
      if (error.status >= 500) request.log.warn({ code: error.code }, error.message);
      return reply.status(error.status).send({ error: { code: error.code, message: error.message, details: error.details } });
    }
    const status = error.statusCode ?? 500;
    if (status === 413) {
      return reply.status(413).send({ error: { code: "PAYLOAD_TOO_LARGE", message: "Fichier ou contenu trop volumineux." } });
    }
    if (status >= 400 && status < 500) {
      return reply.status(status).send({ error: { code: "BAD_REQUEST", message: "Requête invalide." } });
    }
    // Erreur inattendue : détail dans le journal technique, message neutre pour l'utilisateur.
    request.log.error({ err: error }, "Erreur inattendue");
    return reply.status(500).send({
      error: { code: "INTERNAL_ERROR", message: "Une erreur inattendue est survenue. Réessayez dans un instant.", requestId: request.id },
    });
  });

  app.setNotFoundHandler((_request, reply) => {
    reply.status(404).send({ error: { code: "NOT_FOUND", message: "Ressource introuvable." } });
  });

  // Sondes : vivant (sans dépendance) et prêt (base + Redis joignables).
  app.get("/health", { config: { rateLimit: false } }, async () => ({ status: "ok" }));
  app.get("/ready", { config: { rateLimit: false } }, async (_request, reply) => {
    const [db, cache] = await Promise.all([pingDatabase(), pingRedis()]);
    reply.status(db && cache ? 200 : 503);
    return { status: db && cache ? "ready" : "degraded", database: db, redis: cache };
  });
  app.get("/metrics", { config: { rateLimit: false } }, async (request, reply) => {
    const token = process.env.METRICS_TOKEN;
    if (token && request.headers.authorization !== `Bearer ${token}`) throw AppError.notFound();
    reply.type(registry.contentType);
    return registry.metrics();
  });

  await app.register(authRoutes, { prefix: "/v1/auth" });
  await app.register(platformRoutes, { prefix: "/v1/platform" });

  // Tout le reste exige une session valide.
  await app.register(
    async (scope) => {
      scope.addHook("onRequest", authenticate);
      await scope.register(userRoutes, { prefix: "/users" });
      await scope.register(organizationRoutes, { prefix: "/organization" });
      await registerBusinessRoutes(scope);
    },
    { prefix: "/v1" },
  );

  return app;
}
