import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { idSchema, QUOTE_STATUSES } from "@aussitot/shared";
import { parse } from "../../lib/validate.ts";
import { requirePermission } from "../../lib/context.ts";
import * as quotes from "./quotes.service.ts";
import { renderQuotePdfFor } from "./quotes.pdf.ts";

const idParams = z.object({ id: idSchema });
const listQuery = z.object({
  status: z.enum(QUOTE_STATUSES).optional(),
  clientId: idSchema.optional(),
  q: z.string().max(100).optional(),
  cursor: idSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export async function quoteRoutes(app: FastifyInstance): Promise<void> {
  app.get("/", async (request) => quotes.listQuotes(request.ctx, parse(listQuery, request.query)));
  app.post("/", async (request, reply) => {
    reply.code(201);
    return quotes.createQuote(request.ctx, request.body as never);
  });
  app.get("/:id", async (request) => quotes.getQuote(request.ctx, parse(idParams, request.params).id));
  app.patch("/:id", async (request) => quotes.updateQuote(request.ctx, parse(idParams, request.params).id, request.body as never));
  app.delete("/:id", async (request, reply) => {
    await quotes.deleteQuote(request.ctx, parse(idParams, request.params).id);
    reply.code(204);
  });
  app.post("/:id/send", async (request) =>
    quotes.sendQuote(request.ctx, parse(idParams, request.params).id, (request.body ?? {}) as never),
  );
  app.post("/:id/accept", async (request) => quotes.acceptQuote(request.ctx, parse(idParams, request.params).id));
  app.post("/:id/decline", async (request) => quotes.declineQuote(request.ctx, parse(idParams, request.params).id));
  app.post("/:id/cancel", async (request) => quotes.cancelQuote(request.ctx, parse(idParams, request.params).id));
  app.post("/:id/duplicate", async (request, reply) => {
    reply.code(201);
    return quotes.duplicateQuote(request.ctx, parse(idParams, request.params).id);
  });
  app.get("/:id/pdf", async (request, reply) => {
    requirePermission(request.ctx, "quotes.read");
    const pdf = await renderQuotePdfFor(request.ctx.orgId, parse(idParams, request.params).id);
    reply
      .type("application/pdf")
      .header("content-disposition", `inline; filename="${pdf.filename}"`)
      .header("cache-control", "private, no-store");
    return pdf.buffer;
  });
}
