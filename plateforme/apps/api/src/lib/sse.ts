import type { FastifyReply, FastifyRequest } from "fastify";
import { env } from "../config/env.ts";

/**
 * Réponse en flux (Server-Sent Events) pour une requête POST : l'app lit les
 * événements au fil de l'eau (texte de l'assistant, cartes, confirmations).
 */
export interface SseChannel {
  send: (data: unknown) => void;
  end: () => void;
  closed: () => boolean;
}

export function openSse(request: FastifyRequest, reply: FastifyReply): SseChannel {
  const origin = request.headers.origin;
  const allowed = origin && (env.corsOrigins.length === 0 ? !env.isProduction : env.corsOrigins.includes(origin));
  reply.hijack();
  const res = reply.raw;
  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "x-accel-buffering": "no",
    "x-request-id": request.id,
    ...(allowed ? { "access-control-allow-origin": origin, "access-control-allow-credentials": "true", vary: "Origin" } : {}),
  });
  let isClosed = false;
  res.on("close", () => {
    isClosed = true;
  });
  // Commentaire initial : certains proxys n'ouvrent le flux qu'au premier octet.
  res.write(": ok\n\n");
  return {
    send: (data) => {
      if (!isClosed) res.write(`data: ${JSON.stringify(data)}\n\n`);
    },
    end: () => {
      if (!isClosed) res.end();
      isClosed = true;
    },
    closed: () => isClosed,
  };
}
