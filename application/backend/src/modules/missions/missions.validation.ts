import { z } from "zod";
import { stringList } from "../../utils/validation";
import { MissionStatus } from "@prisma/client";

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide (format attendu : AAAA-MM-JJ).");
const timeString = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Heure invalide (format attendu : HH:mm).");

const recurrenceSchema = z.object({
  // 0 = dimanche ... 6 = samedi (JS Date#getDay).
  daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1, "Sélectionnez au moins un jour.").max(7),
  until: dateString,
});

export const createMissionSchema = {
  body: z
    .object({
      siteId: z.string().uuid(),
      title: z.string().trim().min(1).max(150),
      date: dateString,
      startTime: timeString,
      endTime: timeString,
      instructions: z.string().trim().max(4000).optional(),
      assigneeIds: z.array(z.string().uuid()).min(1, "Au moins un employé doit être affecté."),
      leadId: z.string().uuid().optional(),
      standardId: z.string().uuid().optional(),
      recurrence: recurrenceSchema.optional(),
    })
    .refine((data) => !data.leadId || data.assigneeIds.includes(data.leadId), {
      message: "Le chef d'équipe désigné doit faire partie des employés affectés.",
      path: ["leadId"],
    })
    .refine((data) => !data.recurrence || data.recurrence.until >= data.date, {
      message: "La date de fin de récurrence doit être postérieure à la date de la mission.",
      path: ["recurrence", "until"],
    }),
};

export const updateMissionSchema = {
  params: z.object({ id: z.string().uuid() }),
  body: z
    .object({
      siteId: z.string().uuid().optional(),
      title: z.string().trim().min(1).max(150).optional(),
      date: dateString.optional(),
      startTime: timeString.optional(),
      endTime: timeString.optional(),
      instructions: z.string().trim().max(4000).nullable().optional(),
    })
    .refine((data) => Object.keys(data).length > 0, { message: "Aucune donnée à mettre à jour." }),
};

export const missionIdParamSchema = {
  params: z.object({ id: z.string().uuid() }),
};

export const cancelMissionSchema = {
  params: z.object({ id: z.string().uuid() }),
  body: z.object({ scope: z.enum(["one", "series"]).optional().default("one") }),
};

export const conflictsQuerySchema = {
  query: z.object({
    assigneeIds: z
      .string()
      .min(1)
      .transform((v) => v.split(",").filter(Boolean))
      .pipe(z.array(z.string().uuid())),
    date: dateString,
    startTime: timeString,
    endTime: timeString,
    excludeMissionId: z.string().uuid().optional(),
  }),
};

export const listMissionsQuerySchema = {
  query: z.object({
    siteId: z.string().uuid().optional(),
    mine: z
      .enum(["true", "false"])
      .optional()
      .transform((v) => (v === undefined ? undefined : v === "true")),
    status: z.nativeEnum(MissionStatus).optional(),
    // Missions terminées : « true » = déjà validées, « false » = encore à valider.
    validated: z
      .enum(["true", "false"])
      .optional()
      .transform((v) => (v === undefined ? undefined : v === "true")),
    sort: z.enum(["asc", "desc"]).optional().default("asc"),
    from: dateString.optional(),
    to: dateString.optional(),
    page: z.coerce.number().int().positive().optional().default(1),
    pageSize: z.coerce.number().int().positive().max(100).optional().default(50),
  }),
};

export const updateAssignmentsSchema = {
  params: z.object({ id: z.string().uuid() }),
  body: z
    .object({
      assigneeIds: z.array(z.string().uuid()).min(1, "Au moins un employé doit être affecté."),
      leadId: z.string().uuid().optional(),
    })
    .refine((data) => !data.leadId || data.assigneeIds.includes(data.leadId), {
      message: "Le chef d'équipe désigné doit faire partie des employés affectés.",
      path: ["leadId"],
    }),
};

export const setStatusSchema = {
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    status: z.enum([MissionStatus.IN_PROGRESS, MissionStatus.COMPLETED]),
  }),
};

export const validateMissionSchema = {
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    comment: z.string().trim().max(1000).optional(),
  }),
};

export const upsertJobSheetSchema = {
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    tasks: stringList(300).default([]),
    equipment: stringList(150).default([]),
    safetyInstructions: z.string().trim().max(2000).nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
  }),
};

export const replaceAssigneeSchema = {
  params: z.object({ id: z.string().uuid() }),
  body: z.object({ fromUserId: z.string().uuid(), toUserId: z.string().uuid() }),
};
