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
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(300),
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
