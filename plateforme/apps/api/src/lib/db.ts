import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from "../generated/prisma/client.ts";
import { env } from "../config/env.ts";
import { logger } from "./logger.ts";

/**
 * Accès base de données.
 *
 * L'API se connecte avec un rôle PostgreSQL sans privilège : toutes les
 * tables sont protégées par des politiques Row-Level Security qui ne laissent
 * voir que les lignes de l'entreprise positionnée dans la transaction
 * (`app.org_id`). Concrètement, TOUT accès aux données métier passe par
 * `withTenant(orgId, tx => …)` : sans entreprise positionnée, la base ne
 * renvoie rien et refuse toute écriture.
 */

const adapter = new PrismaPg(
  {
    connectionString: env.DATABASE_URL,
    max: env.DB_POOL_SIZE,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    application_name: "aussitot-api",
  },
  { onPoolError: (err) => logger.error({ err }, "Erreur du pool PostgreSQL") },
);

export const prisma = new PrismaClient({ adapter });

export type Db = Prisma.TransactionClient;
export { Prisma };

interface TenantTxOptions {
  timeoutMs?: number;
  isolationLevel?: Prisma.TransactionIsolationLevel;
}

/** Exécute `fn` dans une transaction rattachée à l'entreprise `orgId` (isolation RLS). */
export async function withTenant<T>(orgId: string, fn: (tx: Db) => Promise<T>, options: TenantTxOptions = {}): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT set_config('app.org_id', ${orgId}, true)`;
      return fn(tx);
    },
    { maxWait: 10_000, timeout: options.timeoutMs ?? 15_000, isolationLevel: options.isolationLevel },
  );
}

// ---------------------------------------------------------------------------
// Accès transverses — uniquement via les fonctions SECURITY DEFINER de la
// migration initiale, qui ne renvoient que le strict nécessaire.
// ---------------------------------------------------------------------------

export async function findOrgBySlug(slug: string): Promise<{ id: string; status: "ACTIVE" | "SUSPENDED" } | null> {
  const rows = await prisma.$queryRaw<{ id: string; status: "ACTIVE" | "SUSPENDED" }[]>`
    SELECT id, status::text AS status FROM app_org_by_slug(${slug})`;
  return rows[0] ?? null;
}

export async function findSessionOrg(refreshTokenHash: string): Promise<string | null> {
  const rows = await prisma.$queryRaw<{ org: string | null }[]>`SELECT app_session_org(${refreshTokenHash}) AS org`;
  return rows[0]?.org ?? null;
}

export async function activeOrgIds(): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`SELECT app_active_org_ids AS id FROM app_active_org_ids()`;
  return rows.map((r) => r.id);
}

export async function staleQueuedEmails(before: Date, limit: number): Promise<{ id: string; organizationId: string }[]> {
  const rows = await prisma.$queryRaw<{ id: string; organization_id: string }[]>`
    SELECT id, organization_id FROM app_stale_queued_emails(${before}, ${limit})`;
  return rows.map((r) => ({ id: r.id, organizationId: r.organization_id }));
}

export async function isSlugAvailable(slug: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ ok: boolean }[]>`SELECT app_slug_available(${slug}) AS ok`;
  return rows[0]?.ok ?? false;
}

/** Vérifie que la base répond (sonde de disponibilité). */
export async function pingDatabase(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

/** Identifiant UUID v7 (ordonné dans le temps : index B-tree compacts à grande échelle). */
export function uuidv7(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const ts = BigInt(Date.now());
  for (let i = 0; i < 6; i += 1) bytes[i] = Number((ts >> BigInt(8 * (5 - i))) & 0xffn);
  bytes[6] = (bytes[6]! & 0x0f) | 0x70;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** « 2026-10-12 » → Date à minuit UTC (colonnes @db.Date). */
export function toDbDate(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

/** Date à minuit UTC (colonne @db.Date) → « 2026-10-12 ». */
export function fromDbDate(date: Date): string;
export function fromDbDate(date: Date | null): string | null;
export function fromDbDate(date: Date | null): string | null {
  return date ? date.toISOString().slice(0, 10) : null;
}

export function iso(date: Date): string;
export function iso(date: Date | null | undefined): string | null;
export function iso(date: Date | null | undefined): string | null {
  return date ? date.toISOString() : null;
}

/** Quantité Decimal Prisma → nombre (3 décimales au plus). */
export function decimalToNumber(value: Prisma.Decimal | number): number {
  return typeof value === "number" ? value : Number(value.toString());
}
