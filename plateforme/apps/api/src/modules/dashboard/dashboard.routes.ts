import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { idSchema } from "@aussitot/shared";
import { parse } from "../../lib/validate.ts";
import { getDashboard, listActivity } from "./dashboard.service.ts";

export async function dashboardRoutes(app: FastifyInstance): Promise<void> {
  app.get("/dashboard", async (request) => getDashboard(request.ctx));
  app.get("/activity", async (request) =>
    listActivity(
      request.ctx,
      parse(
        z.object({
          cursor: idSchema.optional(),
          limit: z.coerce.number().int().min(1).max(100).default(50),
          entityType: z.string().max(40).optional(),
          entityId: idSchema.optional(),
        }),
        request.query,
      ),
    ),
  );
}
