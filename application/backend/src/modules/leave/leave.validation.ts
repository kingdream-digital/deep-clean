import { z } from "zod";

export const leaveBalanceQuerySchema = {
  params: z.object({ userId: z.string().uuid() }),
  query: z.object({
    year: z.coerce.number().int().min(2000).max(2100).optional(),
  }),
};

export const leaveTransactionsQuerySchema = {
  params: z.object({ userId: z.string().uuid() }),
  query: z.object({
    year: z.coerce.number().int().min(2000).max(2100).optional(),
  }),
};

export const createLeaveAdjustmentSchema = {
  params: z.object({ userId: z.string().uuid() }),
  body: z.object({
    days: z.coerce.number().refine((v) => v !== 0, "Le nombre de jours ne peut pas être nul."),
    note: z.string().trim().max(500).optional(),
  }),
};

const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Mois invalide (format attendu : AAAA-MM).");

export const listAccrualsQuerySchema = {
  query: z.object({
    month: month.optional(),
    status: z.enum(["PROPOSED", "VALIDATED"]).optional(),
  }),
};

export const validateAccrualSchema = {
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    days: z.coerce.number().min(0).max(31).optional(),
    note: z.string().trim().max(500).optional(),
  }),
};

export const validateMonthSchema = {
  body: z.object({ month }),
};
