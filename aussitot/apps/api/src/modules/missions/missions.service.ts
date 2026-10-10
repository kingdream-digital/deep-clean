import {
  createMissionSchema,
  formatDayLong,
  formatTimeSpoken,
  missionInstructionsSchema,
  planningQuerySchema,
  updateMissionSchema,
  type CreateMissionInput,
  type MissionDto,
  type UpdateMissionInput,
} from "@aussitot/shared";
import type { z } from "zod";
import { fromDbDate, inTenant, iso, toDbDate, withTenant, type Db } from "../../lib/db.ts";
import { withTenantEffects } from "../../lib/afterCommit.ts";
import { AppError, assertFound } from "../../lib/errors.ts";
import { hasPermission, requirePermission, type Ctx } from "../../lib/context.ts";
import { logActivity } from "../../lib/audit.ts";
import { parse } from "../../lib/validate.ts";
import { dayRange, daysBetween, timeKey, zonedDateTime } from "../../lib/time.ts";
import { notifyUsers } from "../notifications/notifications.service.ts";
import { siteAddress } from "../sites/sites.service.ts";
import type { Prisma } from "../../generated/prisma/client.ts";

const missionInclude = {
  site: { select: { id: true, name: true, addressLine1: true, postalCode: true, city: true, accessNotes: true } },
  client: { select: { id: true, name: true } },
  teamLead: { select: { id: true, firstName: true, lastName: true } },
  assignments: { include: { user: { select: { id: true, firstName: true, lastName: true } } } },
} satisfies Prisma.MissionInclude;

type MissionWithRelations = Prisma.MissionGetPayload<{ include: typeof missionInclude }>;

export function toMissionDto(mission: MissionWithRelations, timezone: string): MissionDto {
  return {
    id: mission.id,
    title: mission.title,
    status: mission.status,
    date: fromDbDate(mission.date),
    startTime: timeKey(mission.startsAt, timezone),
    endTime: timeKey(mission.endsAt, timezone),
    startsAt: mission.startsAt.toISOString(),
    endsAt: mission.endsAt.toISOString(),
    site: mission.site
      ? { id: mission.site.id, name: mission.site.name, address: siteAddress(mission.site), accessNotes: mission.site.accessNotes }
      : null,
    client: mission.client,
    assignees: mission.assignments.map((a) => a.user).sort((a, b) => a.lastName.localeCompare(b.lastName, "fr")),
    teamLead: mission.teamLead,
    instructions: mission.instructions,
    startedAt: iso(mission.startedAt),
    finishedAt: iso(mission.finishedAt),
    validatedAt: iso(mission.validatedAt),
  };
}

/** Personnes concernées par une mission : les affectés et le chef d'équipe désigné. */
function concernedUserIds(mission: { teamLeadId: string | null; assignments: { userId: string }[] }): string[] {
  return [...new Set([...mission.assignments.map((a) => a.userId), ...(mission.teamLeadId ? [mission.teamLeadId] : [])])];
}

function isInvolved(ctx: Ctx, mission: { teamLeadId: string | null; assignments: { userId: string }[] }): boolean {
  return concernedUserIds(mission).includes(ctx.userId);
}

async function loadMission(tx: Db, ctx: Ctx, id: string): Promise<MissionWithRelations> {
  const mission = await tx.mission.findUnique({ where: { id }, include: missionInclude });
  // Une mission qu'on ne peut pas voir est « introuvable » : on ne révèle pas son existence.
  if (!mission || (!hasPermission(ctx, "planning.readAll") && !isInvolved(ctx, mission))) throw AppError.notFound("Mission introuvable.");
  return mission;
}

function describeSlot(date: string, startTime: string, endTime: string): string {
  return `${formatDayLong(date, { year: false })}, de ${formatTimeSpoken(startTime)} à ${formatTimeSpoken(endTime)}`;
}

async function assertRefs(
  tx: Db,
  input: { siteId?: string | null; clientId?: string | null; assigneeIds?: string[]; teamLeadId?: string | null },
): Promise<void> {
  if (input.siteId && !(await tx.site.findUnique({ where: { id: input.siteId }, select: { id: true } }))) {
    throw AppError.validation({ siteId: ["Lieu d'intervention introuvable."] });
  }
  if (input.clientId && !(await tx.client.findUnique({ where: { id: input.clientId }, select: { id: true } }))) {
    throw AppError.validation({ clientId: ["Client introuvable."] });
  }
  const people = [...new Set([...(input.assigneeIds ?? []), ...(input.teamLeadId ? [input.teamLeadId] : [])])];
  if (people.length) {
    const found = await tx.user.count({ where: { id: { in: people }, isActive: true } });
    if (found !== people.length) throw AppError.validation({ assigneeIds: ["Une des personnes affectées est introuvable ou désactivée."] });
  }
}

export async function listPlanning(ctx: Ctx, raw: z.input<typeof planningQuerySchema>): Promise<MissionDto[]> {
  const query = parse(planningQuerySchema, raw);
  if (query.to < query.from) throw AppError.validation({ to: ["La fin de période doit suivre le début."] });
  if (daysBetween(query.from, query.to) > 62) throw AppError.validation({ to: ["Période limitée à deux mois."] });
  // Sans droit de lecture du planning complet, on ne voit que ses propres missions.
  const userId = hasPermission(ctx, "planning.readAll") ? query.userId : ctx.userId;
  return withTenant(ctx.orgId, async (tx) => {
    const missions = await tx.mission.findMany({
      where: {
        date: { gte: toDbDate(query.from), lte: toDbDate(query.to) },
        siteId: query.siteId,
        OR: userId ? [{ assignments: { some: { userId } } }, { teamLeadId: userId }] : undefined,
      },
      include: missionInclude,
      orderBy: [{ startsAt: "asc" }, { id: "asc" }],
      take: 2000,
    });
    return missions.map((m) => toMissionDto(m, ctx.timezone));
  });
}

export async function getMission(ctx: Ctx, id: string): Promise<MissionDto> {
  return withTenant(ctx.orgId, async (tx) => toMissionDto(await loadMission(tx, ctx, id), ctx.timezone));
}

export async function createMission(ctx: Ctx, raw: CreateMissionInput): Promise<MissionDto> {
  requirePermission(ctx, "planning.manage");
  const input = parse(createMissionSchema, raw);
  if (input.assigneeIds.length === 0) throw AppError.validation({ assigneeIds: ["Affectez au moins une personne à la mission."] });
  return withTenantEffects(ctx.orgId, async (tx, after) => {
    await assertRefs(tx, input);
    let clientId = input.clientId ?? null;
    if (!clientId && input.siteId)
      clientId = (await tx.site.findUnique({ where: { id: input.siteId }, select: { clientId: true } }))?.clientId ?? null;
    const mission = await tx.mission.create({
      data: {
        title: input.title,
        siteId: input.siteId ?? null,
        clientId,
        date: toDbDate(input.date),
        startsAt: zonedDateTime(input.date, input.startTime, ctx.timezone),
        endsAt: zonedDateTime(input.date, input.endTime, ctx.timezone),
        teamLeadId: input.teamLeadId ?? null,
        instructions: input.instructions ?? null,
        createdById: ctx.userId,
        assignments: { create: input.assigneeIds.map((userId) => ({ userId })) },
      },
      include: missionInclude,
    });
    await logActivity(
      tx,
      ctx,
      "MISSION_CREATED",
      { type: "mission", id: mission.id },
      { date: input.date, assignees: input.assigneeIds.length },
    );
    await notifyUsers(tx, after, ctx.orgId, concernedUserIds(mission), {
      type: "MISSION_ASSIGNED",
      title: "Une nouvelle mission vous a été attribuée.",
      body: `${mission.title} — ${describeSlot(input.date, input.startTime, input.endTime)}${mission.site ? ` · ${mission.site.name}` : ""}`,
      link: `/planning/${mission.id}`,
    });
    return toMissionDto(mission, ctx.timezone);
  });
}

export async function updateMission(ctx: Ctx, id: string, raw: UpdateMissionInput): Promise<MissionDto> {
  requirePermission(ctx, "planning.manage");
  const input = parse(updateMissionSchema, raw);
  return withTenantEffects(ctx.orgId, async (tx, after) => {
    const before = await loadMission(tx, ctx, id);
    if (before.status === "CANCELLED" || before.status === "VALIDATED")
      throw AppError.conflict("Cette mission est close : elle ne peut plus être modifiée.");
    await assertRefs(tx, input);

    const date = input.date ?? fromDbDate(before.date);
    const startTime = input.startTime ?? timeKey(before.startsAt, ctx.timezone);
    const endTime = input.endTime ?? timeKey(before.endsAt, ctx.timezone);
    if (endTime <= startTime) throw AppError.validation({ endTime: ["L'heure de fin doit être après l'heure de début."] });

    const scheduleChanged =
      date !== fromDbDate(before.date) ||
      startTime !== timeKey(before.startsAt, ctx.timezone) ||
      endTime !== timeKey(before.endsAt, ctx.timezone);
    const siteChanged = input.siteId !== undefined && (input.siteId ?? null) !== before.siteId;
    const instructionsChanged = input.instructions !== undefined && (input.instructions ?? null) !== before.instructions;

    const previous = new Set(concernedUserIds(before));
    if (input.assigneeIds) {
      if (input.assigneeIds.length === 0) throw AppError.validation({ assigneeIds: ["Affectez au moins une personne à la mission."] });
      await tx.missionAssignment.deleteMany({ where: { missionId: id, userId: { notIn: input.assigneeIds } } });
      await tx.missionAssignment.createMany({ data: input.assigneeIds.map((userId) => ({ missionId: id, userId })), skipDuplicates: true });
    }
    const mission = await tx.mission.update({
      where: { id },
      data: {
        title: input.title,
        site: input.siteId === null ? { disconnect: true } : input.siteId ? { connect: { id: input.siteId } } : undefined,
        client: input.clientId === null ? { disconnect: true } : input.clientId ? { connect: { id: input.clientId } } : undefined,
        teamLead: input.teamLeadId === null ? { disconnect: true } : input.teamLeadId ? { connect: { id: input.teamLeadId } } : undefined,
        instructions: input.instructions,
        date: toDbDate(date),
        startsAt: zonedDateTime(date, startTime, ctx.timezone),
        endsAt: zonedDateTime(date, endTime, ctx.timezone),
      },
      include: missionInclude,
    });
    await logActivity(tx, ctx, "MISSION_UPDATED", { type: "mission", id }, { fields: Object.keys(input) });

    // Chaque personne reçoit le message qui la concerne, et seulement celui-là.
    const current = new Set(concernedUserIds(mission));
    const added = [...current].filter((u) => !previous.has(u));
    const removed = [...previous].filter((u) => !current.has(u));
    const kept = [...current].filter((u) => previous.has(u));
    const slot = describeSlot(date, startTime, endTime);
    const link = `/planning/${id}`;
    await notifyUsers(tx, after, ctx.orgId, added, {
      type: "MISSION_ASSIGNED",
      title: "Une nouvelle mission vous a été attribuée.",
      body: `${mission.title} — ${slot}`,
      link,
    });
    await notifyUsers(tx, after, ctx.orgId, removed, {
      type: "MISSION_UNASSIGNED",
      title: "Vous n'êtes plus affecté(e) à une mission.",
      body: `${before.title} — ${describeSlot(fromDbDate(before.date), timeKey(before.startsAt, ctx.timezone), timeKey(before.endsAt, ctx.timezone))}`,
      link: null,
    });
    if (scheduleChanged)
      await notifyUsers(tx, after, ctx.orgId, kept, {
        type: "MISSION_RESCHEDULED",
        title: "L'horaire de votre mission a été modifié.",
        body: `${mission.title} — désormais ${slot}`,
        link,
      });
    if (siteChanged)
      await notifyUsers(tx, after, ctx.orgId, kept, {
        type: "MISSION_MOVED",
        title: "Le lieu de votre mission a été modifié.",
        body: `${mission.title} — ${mission.site ? mission.site.name : "lieu à préciser"}`,
        link,
      });
    if (instructionsChanged && mission.instructions)
      await notifyUsers(tx, after, ctx.orgId, kept, {
        type: "MISSION_INSTRUCTIONS",
        title: "Une nouvelle consigne a été ajoutée à votre mission.",
        body: `${mission.title} : ${mission.instructions.slice(0, 140)}`,
        link,
      });
    return toMissionDto(mission, ctx.timezone);
  });
}

export async function cancelMission(ctx: Ctx, id: string, reason?: string | null): Promise<MissionDto> {
  requirePermission(ctx, "planning.manage");
  return withTenantEffects(ctx.orgId, async (tx, after) => {
    const before = await loadMission(tx, ctx, id);
    if (before.status === "CANCELLED") throw AppError.conflict("Cette mission est déjà annulée.");
    if (before.status === "DONE" || before.status === "VALIDATED")
      throw AppError.conflict("Cette mission est terminée : elle ne peut plus être annulée.");
    const mission = await tx.mission.update({
      where: { id },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason ?? null },
      include: missionInclude,
    });
    await logActivity(tx, ctx, "MISSION_CANCELLED", { type: "mission", id }, { reason: reason ?? null });
    await notifyUsers(tx, after, ctx.orgId, concernedUserIds(mission), {
      type: "MISSION_CANCELLED",
      title: "Votre mission a été annulée.",
      body: `${mission.title} — ${describeSlot(fromDbDate(mission.date), timeKey(mission.startsAt, ctx.timezone), timeKey(mission.endsAt, ctx.timezone))}${reason ? ` · ${reason}` : ""}`,
      link: `/planning/${id}`,
    });
    return toMissionDto(mission, ctx.timezone);
  });
}

/** Suivi terrain : tout le monde sauf l'employé (règle Deep Clean), sur une mission qu'il gère ou encadre. */
async function fieldTransition(ctx: Ctx, id: string, action: "start" | "finish"): Promise<MissionDto> {
  requirePermission(ctx, "missions.field");
  return withTenant(ctx.orgId, async (tx) => {
    const mission = await loadMission(tx, ctx, id);
    if (!hasPermission(ctx, "planning.manage") && !isInvolved(ctx, mission)) throw AppError.forbidden();
    if (action === "start" && mission.status !== "PLANNED") throw AppError.conflict("Seule une mission planifiée peut démarrer.");
    if (action === "finish" && mission.status !== "IN_PROGRESS") throw AppError.conflict("Seule une mission en cours peut être terminée.");
    const updated = await tx.mission.update({
      where: { id },
      data: action === "start" ? { status: "IN_PROGRESS", startedAt: new Date() } : { status: "DONE", finishedAt: new Date() },
      include: missionInclude,
    });
    await logActivity(tx, ctx, action === "start" ? "MISSION_STARTED" : "MISSION_FINISHED", { type: "mission", id });
    return toMissionDto(updated, ctx.timezone);
  });
}

export const startMission = (ctx: Ctx, id: string) => fieldTransition(ctx, id, "start");
export const finishMission = (ctx: Ctx, id: string) => fieldTransition(ctx, id, "finish");

export async function validateMission(ctx: Ctx, id: string): Promise<MissionDto> {
  return withTenant(ctx.orgId, async (tx) => {
    const mission = await loadMission(tx, ctx, id);
    const canValidate = hasPermission(ctx, "planning.manage") || (ctx.role === "TEAM_LEAD" && mission.teamLeadId === ctx.userId);
    if (!canValidate) throw AppError.forbidden();
    if (mission.status !== "DONE") throw AppError.conflict("Seule une mission terminée peut être validée.");
    const updated = await tx.mission.update({
      where: { id },
      data: { status: "VALIDATED", validatedAt: new Date(), validatedById: ctx.userId },
      include: missionInclude,
    });
    await logActivity(tx, ctx, "MISSION_VALIDATED", { type: "mission", id });
    return toMissionDto(updated, ctx.timezone);
  });
}

/** Consigne d'une mission : planificateurs, ou chef d'équipe de cette mission. */
export async function setMissionInstructions(ctx: Ctx, id: string, raw: unknown): Promise<MissionDto> {
  const input = parse(missionInstructionsSchema, raw);
  return withTenantEffects(ctx.orgId, async (tx, after) => {
    const before = await loadMission(tx, ctx, id);
    const allowed = hasPermission(ctx, "planning.manage") || (ctx.role === "TEAM_LEAD" && before.teamLeadId === ctx.userId);
    if (!allowed) throw AppError.forbidden();
    const mission = await tx.mission.update({ where: { id }, data: { instructions: input.instructions ?? null }, include: missionInclude });
    await logActivity(tx, ctx, "MISSION_INSTRUCTIONS_UPDATED", { type: "mission", id });
    if (mission.instructions) {
      await notifyUsers(tx, after, ctx.orgId, concernedUserIds(mission), {
        type: "MISSION_INSTRUCTIONS",
        title: "Une nouvelle consigne a été ajoutée à votre mission.",
        body: `${mission.title} : ${mission.instructions.slice(0, 140)}`,
        link: `/planning/${id}`,
      });
    }
    return toMissionDto(mission, ctx.timezone);
  });
}

/** Missions d'une journée (tableau de bord, assistant). */
export async function missionsOfDay(ctx: Ctx, day: string, onlyMine: boolean, db?: Db): Promise<MissionDto[]> {
  const { start, end } = dayRange(day, day, ctx.timezone);
  const mine = onlyMine || !hasPermission(ctx, "planning.readAll");
  return inTenant(ctx.orgId, db, async (tx) => {
    const missions = await tx.mission.findMany({
      where: {
        startsAt: { gte: start, lt: end },
        status: { not: "CANCELLED" },
        OR: mine ? [{ assignments: { some: { userId: ctx.userId } } }, { teamLeadId: ctx.userId }] : undefined,
      },
      include: missionInclude,
      orderBy: { startsAt: "asc" },
      take: 500,
    });
    return missions.map((m) => toMissionDto(m, ctx.timezone));
  });
}

export async function nextMissionFor(ctx: Ctx, db?: Db): Promise<MissionDto | null> {
  return inTenant(ctx.orgId, db, async (tx) => {
    const mission = await tx.mission.findFirst({
      where: {
        endsAt: { gt: new Date() },
        status: { in: ["PLANNED", "IN_PROGRESS"] },
        OR: [{ assignments: { some: { userId: ctx.userId } } }, { teamLeadId: ctx.userId }],
      },
      include: missionInclude,
      orderBy: { startsAt: "asc" },
    });
    return mission ? toMissionDto(mission, ctx.timezone) : null;
  });
}
