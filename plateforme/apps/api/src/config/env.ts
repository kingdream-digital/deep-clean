import { z } from "zod";

/**
 * Configuration validée au démarrage : une variable manquante ou invalide
 * arrête le processus immédiatement plutôt que de laisser tourner l'API dans
 * un état de sécurité incertain. Aucun secret n'a de valeur par défaut.
 */
const bool = z
  .string()
  .optional()
  .transform((v) => v === "true" || v === "1");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  HOST: z.string().default("0.0.0.0"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),

  /** Rôle PostgreSQL SANS privilège (soumis aux politiques RLS). */
  DATABASE_URL: z.string().min(1, "DATABASE_URL est requis"),
  DB_POOL_SIZE: z.coerce.number().int().min(1).max(200).default(20),

  REDIS_URL: z.string().min(1, "REDIS_URL est requis"),

  JWT_SECRET: z.string().min(32, "JWT_SECRET doit faire au moins 32 caractères"),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(600),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(72).default(12),
  REMEMBER_ME_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),

  /** URL publique de l'app (liens dans les emails, CORS). */
  APP_URL: z.string().url().default("http://localhost:8081"),
  CORS_ORIGINS: z.string().default(""),
  /** Derrière un répartiteur de charge / proxy : faire confiance à X-Forwarded-For. */
  TRUST_PROXY: bool,

  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(300),
  LOGIN_RATE_LIMIT_PER_15_MIN: z.coerce.number().int().positive().default(20),
  ASSISTANT_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(20),

  /** Jeton de l'opérateur de la plateforme (création d'entreprises clientes). */
  PLATFORM_ADMIN_TOKEN: z.string().min(32).optional(),

  // Assistant (Claude)
  ANTHROPIC_API_KEY: z.string().optional(),
  ASSISTANT_MODEL: z.string().default("claude-opus-5-5"),
  ASSISTANT_EFFORT: z.enum(["low", "medium", "high", "xhigh", "max"]).default("low"),
  ASSISTANT_MAX_TOOL_ROUNDS: z.coerce.number().int().min(1).max(20).default(8),
  /** Nombre maximal de réponses de l'assistant générées en parallèle par instance. */
  ASSISTANT_MAX_CONCURRENCY: z.coerce.number().int().min(1).max(2000).default(200),

  // Emails sortants (devis, factures, relances)
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: bool,
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  /** Expéditeur technique ; le nom affiché est celui de l'entreprise cliente. */
  MAIL_FROM_ADDRESS: z.string().email().default("no-reply@aussitot.app"),

  // Stockage des fichiers (logos, PDF, photos) : disque local ou S3 compatible
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default("storage"),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().default("fr-par"),
  S3_ENDPOINT: z.string().url().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: bool,

  // Notifications push (Expo)
  EXPO_ACCESS_TOKEN: z.string().optional(),

  /** Démo uniquement : jeu de données d'exemple chargeable par `npm run db:seed`. */
  DEMO_MODE: bool,
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error("Configuration invalide :", z.flattenError(parsed.error).fieldErrors);
  throw new Error("Configuration d'environnement invalide — vérifier le fichier .env");
}

if (parsed.data.NODE_ENV === "production") {
  if (parsed.data.JWT_SECRET.includes("dev-only")) throw new Error("JWT_SECRET de développement interdit en production.");
  if (!parsed.data.CORS_ORIGINS) throw new Error("CORS_ORIGINS est requis en production.");
}

export const env = {
  ...parsed.data,
  isProduction: parsed.data.NODE_ENV === "production",
  isTest: parsed.data.NODE_ENV === "test",
  corsOrigins: parsed.data.CORS_ORIGINS.split(",")
    .map((o) => o.trim())
    .filter(Boolean),
};

export type Env = typeof env;
