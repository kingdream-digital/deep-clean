import type { VatRegime } from "@aussitot/shared";
import { withTenant } from "./db.ts";
import { AppError } from "./errors.ts";
import { redis, createRedis } from "./redis.ts";
import { logger } from "./logger.ts";

/**
 * Informations de base de chaque entreprise (fuseau horaire, statut,
 * abonnement), lues à chaque requête : gardées en mémoire 30 secondes et
 * invalidées sur toutes les instances (Redis pub/sub) quand elles changent.
 */
export interface OrgBasics {
  id: string;
  slug: string;
  name: string;
  status: "ACTIVE" | "SUSPENDED";
  plan: string;
  timezone: string;
  vatRegime: VatRegime;
  defaultVatRateBps: number;
  assistantMonthlyQuota: number;
  seatLimit: number;
  hasLogo: boolean;
  brandColor: string | null;
}

const TTL_MS = 30_000;
const CHANNEL = "org:invalidate";
const cache = new Map<string, { value: OrgBasics; expiresAt: number }>();

export async function getOrgBasics(orgId: string): Promise<OrgBasics> {
  const hit = cache.get(orgId);
  if (hit && hit.expiresAt > Date.now()) return hit.value;
  const org = await withTenant(orgId, (tx) => tx.organization.findUnique({ where: { id: orgId } }));
  if (!org) throw AppError.unauthorized();
  const value: OrgBasics = {
    id: org.id,
    slug: org.slug,
    name: org.name,
    status: org.status,
    plan: org.plan,
    timezone: org.timezone,
    vatRegime: org.vatRegime,
    defaultVatRateBps: org.defaultVatRateBps,
    assistantMonthlyQuota: org.assistantMonthlyQuota,
    seatLimit: org.seatLimit,
    hasLogo: Boolean(org.logoKey),
    brandColor: org.brandColor,
  };
  cache.set(orgId, { value, expiresAt: Date.now() + TTL_MS });
  return value;
}

export async function invalidateOrg(orgId: string): Promise<void> {
  cache.delete(orgId);
  try {
    await redis.publish(CHANNEL, orgId);
  } catch {
    /* les autres instances se mettront à jour à l'expiration (30 s) */
  }
}

let subscriber: ReturnType<typeof createRedis> | null = null;

/** Écoute les invalidations publiées par les autres instances. */
export async function startOrgCacheSync(): Promise<void> {
  if (subscriber) return;
  subscriber = createRedis("org-cache-sub");
  subscriber.on("message", (_channel, orgId: string) => cache.delete(orgId));
  try {
    await subscriber.subscribe(CHANNEL);
  } catch (err) {
    logger.warn({ err }, "Synchronisation du cache entreprise indisponible");
  }
}

export async function stopOrgCacheSync(): Promise<void> {
  await subscriber?.quit().catch(() => undefined);
  subscriber = null;
}
