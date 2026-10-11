import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AppError } from "../../lib/errors.ts";
import { parse } from "../../lib/validate.ts";
import * as organization from "./organization.service.ts";

export async function organizationRoutes(app: FastifyInstance): Promise<void> {
  app.get("/", async (request) => organization.getOrganization(request.ctx));

  app.put("/", async (request) => organization.updateOrganization(request.ctx, request.body as never));

  app.put("/logo", async (request) => {
    const file = await request.file({ limits: { fileSize: 2 * 1024 * 1024, files: 1 } });
    if (!file) throw AppError.badRequest("Aucun fichier reçu.");
    const buffer = await file.toBuffer();
    if (file.file.truncated) throw AppError.badRequest("Le logo ne doit pas dépasser 2 Mo.");
    return organization.updateLogo(request.ctx, buffer);
  });

  app.delete("/logo", async (request) => organization.removeLogo(request.ctx));

  app.get("/document-preview", async (request, reply) => {
    const { kind } = parse(z.object({ kind: z.enum(["quote", "invoice"]).default("invoice") }), request.query);
    const pdf = await organization.renderDocumentPreview(request.ctx, kind === "quote" ? "QUOTE" : "INVOICE");
    reply.header("cache-control", "no-store");
    reply.header("content-disposition", `inline; filename="${pdf.filename}"`);
    reply.type("application/pdf");
    return pdf.buffer;
  });

  app.get("/logo", async (request, reply) => {
    const png = await organization.getLogo(request.ctx);
    reply.header("cache-control", "private, max-age=300");
    reply.type("image/png");
    return png;
  });
}
