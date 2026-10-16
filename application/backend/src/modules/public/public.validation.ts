import { z } from "zod";

// Prestations proposées par DEEP CLEAN (mêmes intitulés que le site
// deep-clean.fr et l'espace « Découvrir » de l'application).
export const PUBLIC_SERVICES = [
  "Nettoyage approfondi",
  "Nettoyage standard",
  "Bureaux & espaces professionnels",
  "Nettoyage d'ameublement",
  "Nettoyage de matelas",
  "Textiles, sols & vitres",
  "Conciergerie",
  "Autre demande",
] as const;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

// Demande de devis envoyée depuis l'espace public (sans compte). Validation
// stricte : longueurs bornées, coordonnées vérifiées, consentement explicite.
export const quoteRequestSchema = {
  body: z
    .object({
      customerType: z.enum(["INDIVIDUAL", "BUSINESS"]),
      companyName: optionalText(120),
      firstName: z.string().trim().min(1, "Indiquez votre prénom.").max(60),
      lastName: z.string().trim().min(1, "Indiquez votre nom.").max(60),
      email: z
        .string()
        .trim()
        .max(160)
        .optional()
        .transform((v) => (v ? v : undefined))
        .pipe(z.string().email("Adresse email invalide.").optional()),
      phone: z
        .string()
        .trim()
        .max(25)
        .optional()
        .transform((v) => (v ? v : undefined))
        .pipe(z.string().regex(/^[0-9+().\s-]{6,25}$/, "Numéro de téléphone invalide.").optional()),
      postalCode: z
        .string()
        .trim()
        .optional()
        .transform((v) => (v ? v : undefined))
        .pipe(z.string().regex(/^\d{5}$/, "Code postal invalide.").optional()),
      city: optionalText(80),
      service: z.enum(PUBLIC_SERVICES),
      message: z.string().trim().min(10, "Décrivez votre besoin en quelques mots (10 caractères au moins).").max(2000),
      consent: z.literal(true, { errorMap: () => ({ message: "Votre accord est nécessaire pour que nous puissions vous recontacter." }) }),
      // Champ piège invisible pour les personnes : seul un robot le remplit.
      website: z.string().max(500).optional(),
    })
    .refine((d) => !!d.email || !!d.phone, {
      message: "Indiquez un téléphone ou un email pour que nous puissions vous répondre.",
      path: ["phone"],
    })
    .refine((d) => d.customerType === "INDIVIDUAL" || !!d.companyName, {
      message: "Indiquez le nom de votre entreprise.",
      path: ["companyName"],
    }),
};
