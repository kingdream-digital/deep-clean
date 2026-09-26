import { z } from "zod";
import { AbsenceStatus, AbsenceType } from "@prisma/client";

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date attendue au format AAAA-MM-JJ.");

export const createAbsenceSchema = {
  body: z
    .object({
      userId: z.string().uuid().optional(), // absent = pour soi-même ; réservé RH pour un autre compte (voir service)
      type: z.nativeEnum(AbsenceType).optional().default(AbsenceType.PAID_LEAVE),
      startDate: dateOnly,
      endDate: dateOnly,
      reason: z.string().trim().max(500).optional(),
    })
    .refine((v) => v.endDate >= v.startDate, {
      message: "La date de fin doit être postérieure ou égale à la date de début.",
      path: ["endDate"],
    }),
};

export const absenceIdParamSchema = {
  params: z.object({ id: z.string().uuid() }),
};

export const listAbsencesQuerySchema = {
  query: z.object({
    userId: z.string().uuid().optional(),
    status: z.nativeEnum(AbsenceStatus).optional(),
    from: dateOnly.optional(),
    to: dateOnly.optional(),
    page: z.coerce.number().int().positive().optional().default(1),
    pageSize: z.coerce.number().int().positive().max(100).optional().default(20),
  }),
};

export const decideAbsenceSchema = {
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    status: z.enum([AbsenceStatus.APPROVED, AbsenceStatus.REJECTED]),
    decisionNote: z.string().trim().max(500).optional(),
  }),
};
