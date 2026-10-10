import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { idSchema, INVOICE_KINDS, INVOICE_STATUSES } from "@aussitot/shared";
import { parse } from "../../lib/validate.ts";
import { requirePermission } from "../../lib/context.ts";
import * as invoices from "./invoices.service.ts";
import { renderInvoicePdfFor } from "./invoices.pdf.ts";

const idParams = z.object({ id: idSchema });
const flag = z
  .enum(["true", "false"])
  .optional()
  .transform((v) => v === "true");
const listQuery = z.object({
  status: z.enum(INVOICE_STATUSES).optional(),
  kind: z.enum(INVOICE_KINDS).optional(),
  overdue: flag,
  unpaid: flag,
  clientId: idSchema.optional(),
  q: z.string().max(100).optional(),
  cursor: idSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export async function invoiceRoutes(app: FastifyInstance): Promise<void> {
  app.get("/", async (request) => invoices.listInvoices(request.ctx, parse(listQuery, request.query)));
  app.post("/", async (request, reply) => {
    reply.code(201);
    return invoices.createInvoice(request.ctx, request.body as never);
  });
  app.post("/from-quote/:id", async (request, reply) => {
    reply.code(201);
    return invoices.createInvoiceFromQuote(request.ctx, parse(idParams, request.params).id);
  });
  app.get("/:id", async (request) => invoices.getInvoice(request.ctx, parse(idParams, request.params).id));
  app.patch("/:id", async (request) => invoices.updateInvoice(request.ctx, parse(idParams, request.params).id, request.body as never));
  app.delete("/:id", async (request, reply) => {
    await invoices.deleteInvoice(request.ctx, parse(idParams, request.params).id);
    reply.code(204);
  });
  app.post("/:id/issue", async (request) => invoices.issueInvoice(request.ctx, parse(idParams, request.params).id));
  app.post("/:id/send", async (request) =>
    invoices.sendInvoice(request.ctx, parse(idParams, request.params).id, (request.body ?? {}) as never),
  );
  app.post("/:id/remind", async (request) =>
    invoices.remindInvoice(request.ctx, parse(idParams, request.params).id, (request.body ?? {}) as never),
  );
  app.post("/:id/payments", async (request) =>
    invoices.recordPayment(request.ctx, parse(idParams, request.params).id, request.body as never),
  );
  app.post("/:id/cancel", async (request) => {
    const body = parse(z.object({ reason: z.string().trim().max(500).optional() }), request.body ?? {});
    return invoices.cancelWithCreditNote(request.ctx, parse(idParams, request.params).id, body.reason);
  });
  app.get("/:id/pdf", async (request, reply) => {
    requirePermission(request.ctx, "invoices.read");
    const pdf = await renderInvoicePdfFor(request.ctx.orgId, parse(idParams, request.params).id);
    reply
      .type("application/pdf")
      .header("content-disposition", `inline; filename="${pdf.filename}"`)
      .header("cache-control", "private, no-store");
    return pdf.buffer;
  });
}
