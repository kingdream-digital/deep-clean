import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

// Toute variable manquante ou invalide fait échouer le démarrage immédiatement
// plutôt que de laisser l'application tourner dans un état de sécurité incertain.
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),

  DATABASE_URL: z.string().min(1, "DATABASE_URL est requis"),

  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET doit faire au moins 32 caractères"),
  JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET doit faire au moins 32 caractères"),
  JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_EXPIRES_IN_DAYS: z.coerce.number().int().positive().default(1),
  JWT_REFRESH_EXPIRES_IN_DAYS_REMEMBER_ME: z.coerce.number().int().positive().default(30),

  CORS_ORIGINS: z.string().default(""),

  RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().int().positive().default(15),
  // Relevé de 300 à 600 : l'accueil à lui seul déclenche ~7 requêtes en
  // parallèle à chaque focus d'écran, et un usage normal (navigation entre
  // plusieurs écrans, actualisations) épuisait le quota en quelques minutes
  // même pour un seul utilisateur légitime.
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(600),
  AUTH_RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(10),

  BOOTSTRAP_ADMIN_EMAIL: z.string().email().optional(),
  BOOTSTRAP_ADMIN_PASSWORD: z.string().min(12).optional(),

  // Stockage local des photos (fondation) — à remplacer par un stockage objet
  // (S3/GCS + URLs signées) en production multi-instance.
  UPLOAD_DIR: z.string().default("uploads"),
  MAX_UPLOAD_SIZE_MB: z.coerce.number().int().positive().default(8),
  // Documents PDF (ex. standard de nettoyage joint à une mission) : plafond
  // distinct et plus généreux que les photos, un PDF illustré dépassant
  // couramment quelques Mo.
  MAX_DOCUMENT_UPLOAD_SIZE_MB: z.coerce.number().int().positive().default(15),

  // Optionnel : jeton d'accès Expo pour l'envoi de notifications push
  // (recommandé par Expo en production, pas requis pour fonctionner).
  EXPO_ACCESS_TOKEN: z.string().optional(),

  // Moteur de congés — retour explicite du client : "les règles d'acquisition
  // doivent être configurables, ne pas coder une règle fixe". Cette valeur
  // n'est qu'un DÉFAUT (2,5 j/mois = minimum légal français) appliqué à la
  // création d'un compte ; la RH peut ensuite ajuster le taux propre à
  // chaque salarié (temps partiel...) via sa fiche (voir User.leaveAccrualRate
  // dans schema.prisma et leave.service.ts).
  DEFAULT_LEAVE_ACCRUAL_RATE_PER_MONTH: z.coerce.number().positive().default(2.5),

  // Coordonnées légales de l'entreprise exploitante — utilisées sur les PDF
  // (devis/factures) envoyés au client final (cahier des charges module
  // commercial, §15). Tous optionnels pour ne jamais bloquer le démarrage
  // du serveur, mais DOIVENT être renseignés en production avant d'envoyer
  // un vrai devis : sans eux, le PDF reste utilisable mais incomplet.
  COMPANY_LEGAL_NAME: z.string().default("Deep Clean"),
  COMPANY_ADDRESS: z.string().optional(),
  COMPANY_SIRET: z.string().optional(),
  COMPANY_PHONE: z.string().optional(),
  COMPANY_EMAIL: z.string().optional(),
  COMPANY_VAT_NUMBER: z.string().optional(),
  // Mentions légales complètes (facture électronique, réforme 2026) :
  // adresse découpée (exigée par le format structuré), SIREN, forme
  // juridique, capital, RCS, coordonnées bancaires et conditions de paiement.
  COMPANY_POSTAL_CODE: z.string().optional(),
  COMPANY_CITY: z.string().optional(),
  COMPANY_SIREN: z.string().optional(),
  COMPANY_LEGAL_FORM: z.string().optional(), // ex. « SAS »
  COMPANY_SHARE_CAPITAL: z.string().optional(), // ex. « 10 000 € »
  COMPANY_RCS: z.string().optional(), // ex. « RCS Paris 123 456 789 »
  COMPANY_IBAN: z.string().optional(),
  COMPANY_BIC: z.string().optional(),
  // « true » si l'entreprise a opté pour le paiement de la TVA d'après les
  // débits (mention obligatoire sur la facture dans ce cas).
  COMPANY_VAT_ON_DEBITS: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1"),
  INVOICE_PAYMENT_DAYS: z.coerce.number().int().min(0).max(60).default(30),
  // Taux des pénalités de retard (mention obligatoire). Par défaut : trois
  // fois le taux d'intérêt légal, minimum prévu par le Code de commerce.
  INVOICE_LATE_PENALTY_TEXT: z.string().default("trois fois le taux d'intérêt légal"),

  // Facture électronique via la plateforme agréée Super PDP
  // (https://www.superpdp.tech). Identifiants « client credentials » créés
  // dans l'espace Super PDP ; sans eux, l'envoi électronique est désactivé
  // (le reste de la facturation fonctionne normalement). Un identifiant de
  // « bac à sable » envoie en test, sans valeur légale.
  SUPERPDP_CLIENT_ID: z.string().optional(),
  SUPERPDP_CLIENT_SECRET: z.string().optional(),
  SUPERPDP_API_URL: z.string().url().default("https://api.superpdp.tech"),

  // Envoi d'email (devis/factures au client final, §16) — si non configuré,
  // le serveur reste fonctionnel (mode simulation journalisé) mais aucun
  // email n'est réellement délivré : à renseigner avant une mise en
  // production réelle du module commercial.
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: z.coerce.boolean().default(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error("Configuration d'environnement invalide :", parsed.error.flatten().fieldErrors);
  throw new Error("Configuration d'environnement invalide — vérifier le fichier .env");
}

export const env = {
  ...parsed.data,
  isProduction: parsed.data.NODE_ENV === "production",
  isTest: parsed.data.NODE_ENV === "test",
  corsOrigins: parsed.data.CORS_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean),
};
