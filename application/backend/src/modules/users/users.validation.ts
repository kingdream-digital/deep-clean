import { z } from "zod";
import { Role } from "@prisma/client";

const roleEnum = z.nativeEnum(Role);

export const createUserSchema = {
  body: z.object({
    // Jamais utilisé pour la connexion (voir users.service.ts::generateUsername)
    // — coordonnée de contact optionnelle uniquement.
    email: z.string().trim().toLowerCase().email().optional(),
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
    phone: z.string().trim().max(30).optional(),
    role: roleEnum,
  }),
};

export const updateUserSchema = {
  params: z.object({ id: z.string().uuid() }),
  body: z
    .object({
      firstName: z.string().trim().min(1).max(100).optional(),
      lastName: z.string().trim().min(1).max(100).optional(),
      phone: z.string().trim().max(30).nullable().optional(),
      role: roleEnum.optional(),
      // Moteur de congés (retour explicite du client) — null remet le
      // salarié sur le taux/plafond par défaut de l'entreprise.
      leaveAccrualRate: z.coerce.number().positive().nullable().optional(),
      leaveAccrualCap: z.coerce.number().positive().nullable().optional(),
    })
    .refine((data) => Object.keys(data).length > 0, { message: "Aucune donnée à mettre à jour." }),
};

export const userIdParamSchema = {
  params: z.object({ id: z.string().uuid() }),
};

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide (format attendu : AAAA-MM-JJ).");

export const exportEmployeeDossierQuerySchema = {
  params: z.object({ id: z.string().uuid() }),
  query: z.object({ from: dateString, to: dateString }),
};

export const listUsersQuerySchema = {
  query: z.object({
    role: roleEnum.optional(),
    isActive: z
      .enum(["true", "false"])
      .optional()
      .transform((v) => (v === undefined ? undefined : v === "true")),
    search: z.string().trim().max(200).optional(),
    page: z.coerce.number().int().positive().optional().default(1),
    pageSize: z.coerce.number().int().positive().max(100).optional().default(20),
  }),
};
