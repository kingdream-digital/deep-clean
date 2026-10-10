import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { idSchema } from "@aussitot/shared";
import { env } from "../../config/env.ts";
import { parse } from "../../lib/validate.ts";
import { realtimeHub } from "../../lib/realtime.ts";
import * as notifications from "./notifications.service.ts";

const STREAM_MAX_MS = Math.max(60_000, (env.ACCESS_TOKEN_TTL_SECONDS - 30) * 1000);

export async function notificationRoutes(app: FastifyInstance): Promise<void> {
  app.get("/", async (request) =>
    notifications.listNotifications(
      request.ctx,
      parse(
        z.object({
          cursor: idSchema.optional(),
          limit: z.coerce.number().int().min(1).max(100).default(30),
          unreadOnly: z
            .enum(["true", "false"])
            .optional()
            .transform((v) => v === "true"),
        }),
        request.query,
      ),
    ),
  );
  app.get("/unread-count", async (request) => ({ count: await notifications.unreadCount(request.ctx) }));
  app.post("/read", async (request) => {
    const body = parse(z.object({ ids: z.array(idSchema).max(200).optional(), all: z.boolean().optional() }), request.body);
    return notifications.markRead(request.ctx, body.all ? "all" : (body.ids ?? []));
  });
  app.post("/push-token", async (request) => {
    await notifications.registerPushToken(request.ctx, request.body);
    return { ok: true };
  });
  app.delete("/push-token", async (request) => {
    const body = parse(z.object({ token: z.string().max(200) }), request.body);
    await notifications.unregisterPushToken(request.ctx, body.token);
    return { ok: true };
  });
}

/**
 * Flux temps réel (Server-Sent Events). Fermé automatiquement avant
 * l'expiration du jeton d'accès : l'app se reconnecte avec un jeton frais, si
 * bien qu'une session révoquée ne garde jamais un flux ouvert.
 */
export async function eventStreamRoutes(app: FastifyInstance): Promise<void> {
  app.get("/", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (request, reply) => {
    const origin = request.headers.origin;
    const allowed = origin && (env.corsOrigins.length === 0 ? !env.isProduction : env.corsOrigins.includes(origin));
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
      ...(allowed ? { "access-control-allow-origin": origin, "access-control-allow-credentials": "true", vary: "Origin" } : {}),
    });
    res.write("retry: 4000\n\n");
    res.write(`event: ready\ndata: {}\n\n`);
    realtimeHub.track(res);

    const unsubscribe = await realtimeHub.subscribe(request.ctx.userId, (event) => {
      res.write(`event: ${event.type}\ndata: ${JSON.stringify(event.payload)}\n\n`);
    });
    const heartbeat = setInterval(() => res.write(": ping\n\n"), 25_000);
    const lifetime = setTimeout(() => res.end(), STREAM_MAX_MS);
    const cleanup = () => {
      clearInterval(heartbeat);
      clearTimeout(lifetime);
      void unsubscribe();
    };
    res.on("close", cleanup);
    request.raw.on("close", cleanup);
  });
}
