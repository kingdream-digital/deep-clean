import { z } from "zod";

// Réglage de l'offre de bienvenue (Direction / admin technique). Bornes
// volontairement prudentes : une remise sur une prestation physique, avec des
// conditions complètes affichées au public avant l'envoi d'une demande.
export const updateWelcomeOfferSchema = {
  body: z
    .object({
      isActive: z.boolean(),
      rate: z.number().int().min(1, "La remise doit être d'au moins 1 %.").max(50, "La remise ne peut pas dépasser 50 %."),
      title: z.string().trim().min(3).max(80),
      summary: z.string().trim().min(10).max(240),
      conditions: z.string().trim().min(40, "Détaillez les conditions de l'offre.").max(4000),
      startsAt: z.coerce.date(),
      endsAt: z.coerce.date(),
    })
    .refine((d) => d.endsAt > d.startsAt, { message: "La date de fin doit suivre la date de début.", path: ["endsAt"] }),
};

export type UpdateWelcomeOfferInput = z.infer<typeof updateWelcomeOfferSchema.body>;
