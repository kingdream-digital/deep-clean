import { z } from "zod";

export const loginSchema = {
  body: z.object({
    // Identifiant de connexion généré par le serveur (première lettre du
    // prénom + nom, ex. "jdupont") — jamais un email (voir
    // users.service.ts::generateUsername). Normalisé en minuscules pour que
    // la casse saisie par l'utilisateur n'ait pas d'importance.
    username: z.string().trim().toLowerCase().min(1, "Identifiant requis."),
    password: z.string().min(1, "Mot de passe requis."),
    rememberMe: z.boolean().optional().default(false),
  }),
};

export const refreshSchema = {
  body: z.object({
    refreshToken: z.string().min(1, "Refresh token requis."),
  }),
};

export const logoutSchema = {
  body: z.object({
    refreshToken: z.string().min(1, "Refresh token requis."),
  }),
};

export const changePasswordSchema = {
  body: z
    .object({
      currentPassword: z.string().min(1, "Mot de passe actuel requis."),
      newPassword: z.string().min(10, "Le nouveau mot de passe doit contenir au moins 10 caractères."),
    })
    .refine((data) => data.currentPassword !== data.newPassword, {
      message: "Le nouveau mot de passe doit être différent de l'ancien.",
      path: ["newPassword"],
    }),
};
