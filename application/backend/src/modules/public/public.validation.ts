import { z } from "zod";

// Prestations proposées par DEEP CLEAN : mêmes intitulés que le formulaire
// de devis du site officiel deep-clean.fr (dossier v2/ du dépôt).
export const PUBLIC_SERVICES = [
  "Nettoyage en profondeur",
  "Entretien régulier",
  "Bureaux & espaces pro",
  "Conciergerie",
  "Canapés & fauteuils",
  "Matelas",
  "Textiles, sols & vitres",
  "Remise en état",
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
      customerType: z.enum(["INDIVIDUAL", "BUSINESS", "OWNER"]),
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
      // Description facultative (retour explicite du client : le service
      // choisi suffit, « peut-être une description »).
      message: optionalText(2000),
      consent: z.literal(true, { errorMap: () => ({ message: "Votre accord est nécessaire pour que nous puissions vous recontacter." }) }),
      // Champ piège invisible pour les personnes : seul un robot le remplit.
      website: z.string().max(500).optional(),
    })
    .refine((d) => !!d.email || !!d.phone, {
      message: "Indiquez un téléphone ou un email pour que nous puissions vous répondre.",
      path: ["phone"],
    })
    .refine((d) => d.customerType !== "BUSINESS" || !!d.companyName, {
      message: "Indiquez le nom de votre entreprise.",
      path: ["companyName"],
    }),
};
