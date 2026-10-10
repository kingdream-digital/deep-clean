import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { idSchema } from "@aussitot/shared";
import { env } from "../../config/env.ts";
import { parse } from "../../lib/validate.ts";
import { AppError } from "../../lib/errors.ts";
import { openSse } from "../../lib/sse.ts";
import { logger } from "../../lib/logger.ts";
import * as assistant from "./assistant.service.ts";
import type { Emit } from "./loop.ts";

const idParams = z.object({ id: idSchema });

/**
 * Exécute une opération de l'assistant en flux SSE. Les erreurs connues sont
 * renvoyées dans le flux (message simple), jamais de détail technique.
 */
async function streamed(request: FastifyRequest, reply: FastifyReply, run: (emit: Emit) => Promise<void>): Promise<void> {
  const channel = openSse(request, reply);
  try {
    await run((event) => channel.send(event));
  } catch (err) {
    const known = err instanceof AppError;
    if (!known) logger.error({ err, reqId: request.id }, "Erreur de l'assistant");
    channel.send({
      type: "error",
      message: known ? err.message : "L'assistant a rencontré une erreur. Réessayez dans un instant.",
      code: known ? err.code : "INTERNAL_ERROR",
    });
  } finally {
    channel.end();
  }
}

export async function assistantRoutes(app: FastifyInstance): Promise<void> {
  const limited = { config: { rateLimit: { max: env.ASSISTANT_RATE_LIMIT_PER_MINUTE, timeWindow: "1 minute" } } };

  app.get("/status", async (request) => assistant.assistantStatus(request.ctx));
  app.get("/conversations", async (request) => assistant.listConversations(request.ctx));
  app.post("/conversations", async (request, reply) => {
    reply.code(201);
    return assistant.createConversation(request.ctx);
  });
  app.get("/conversations/:id", async (request) => assistant.getConversation(request.ctx, parse(idParams, request.params).id));

  app.post("/conversations/:id/messages", limited, async (request, reply) => {
    const { id } = parse(idParams, request.params);
    await streamed(request, reply, (emit) => assistant.sendMessage(request.ctx, id, request.body as never, emit));
  });

  app.post("/actions/:id/confirm", limited, async (request, reply) => {
    const { id } = parse(idParams, request.params);
    await streamed(request, reply, (emit) => assistant.resolveAction(request.ctx, id, "confirm", emit));
  });

  app.post("/actions/:id/cancel", limited, async (request, reply) => {
    const { id } = parse(idParams, request.params);
    await streamed(request, reply, (emit) => assistant.resolveAction(request.ctx, id, "cancel", emit));
  });
}
