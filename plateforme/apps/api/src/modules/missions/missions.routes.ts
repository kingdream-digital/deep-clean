import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { idSchema } from "@aussitot/shared";
import { parse } from "../../lib/validate.ts";
import * as missions from "./missions.service.ts";

const idParams = z.object({ id: idSchema });

export async function missionRoutes(app: FastifyInstance): Promise<void> {
  app.get("/", async (request) => missions.listPlanning(request.ctx, request.query as never));
  app.post("/", async (request, reply) => {
    reply.code(201);
    return missions.createMission(request.ctx, request.body as never);
  });
  app.get("/:id", async (request) => missions.getMission(request.ctx, parse(idParams, request.params).id));
  app.patch("/:id", async (request) => missions.updateMission(request.ctx, parse(idParams, request.params).id, request.body as never));
  app.post("/:id/cancel", async (request) => {
    const body = parse(z.object({ reason: z.string().trim().max(300).optional() }), request.body ?? {});
    return missions.cancelMission(request.ctx, parse(idParams, request.params).id, body.reason);
  });
  app.post("/:id/start", async (request) => missions.startMission(request.ctx, parse(idParams, request.params).id));
  app.post("/:id/finish", async (request) => missions.finishMission(request.ctx, parse(idParams, request.params).id));
  app.post("/:id/validate", async (request) => missions.validateMission(request.ctx, parse(idParams, request.params).id));
  app.put("/:id/instructions", async (request) =>
    missions.setMissionInstructions(request.ctx, parse(idParams, request.params).id, request.body),
  );
}
