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
    // Date d'entrée dans l'entreprise (AAAA-MM-JJ) : base du calcul des
    // congés acquis. Sans elle, un salarié présent depuis des années
    // démarrait à 0 jour le jour de la mise en service de l'application.
    hireDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide (format attendu : AAAA-MM-JJ).").optional(),
    // Heures par semaine au contrat (ex. 35).
    weeklyHours: z.coerce.number().positive("Indiquez un nombre d'heures positif.").max(60, "60 heures par semaine au maximum.").optional(),
    // Paramètres de congés du contrat (par défaut : 2,5 jours ouvrables par
    // mois, plafond 30 par période de référence).
    leaveAccrualRate: z.coerce.number().positive().max(5).optional(),
    leaveAccrualCap: z.coerce.number().positive().max(60).optional(),
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
      hireDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide (format attendu : AAAA-MM-JJ).").optional(),
      weeklyHours: z.coerce.number().positive("Indiquez un nombre d'heures positif.").max(60, "60 heures par semaine au maximum.").nullable().optional(),
      nightWorkerStatus: z.enum(["AUTO", "YES", "NO"]).optional(),
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
