import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { idSchema } from "@aussitot/shared";
import { parse } from "../../lib/validate.ts";
import * as users from "./users.service.ts";

const listQuery = z.object({
  q: z.string().max(100).optional(),
  includeInactive: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
});

export async function userRoutes(app: FastifyInstance): Promise<void> {
  app.get("/", async (request) => users.listUsers(request.ctx, parse(listQuery, request.query)));

  app.get("/staff", async (request) => users.listAssignableStaff(request.ctx));

  app.get("/:id", async (request) => {
    const { id } = parse(z.object({ id: idSchema }), request.params);
    return users.getUser(request.ctx, id);
  });

  app.post("/", async (request, reply) => {
    reply.code(201);
    return users.createUser(request.ctx, request.body as never);
  });

  app.patch("/:id", async (request) => {
    const { id } = parse(z.object({ id: idSchema }), request.params);
    return users.updateUser(request.ctx, id, request.body as never);
  });

  app.post("/:id/deactivate", async (request) => {
    const { id } = parse(z.object({ id: idSchema }), request.params);
    return users.setUserActive(request.ctx, id, false);
  });

  app.post("/:id/reactivate", async (request) => {
    const { id } = parse(z.object({ id: idSchema }), request.params);
    return users.setUserActive(request.ctx, id, true);
  });

  app.post("/:id/reset-access", async (request) => {
    const { id } = parse(z.object({ id: idSchema }), request.params);
    return users.resetUserAccess(request.ctx, id);
  });
}
