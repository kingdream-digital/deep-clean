import type Anthropic from "@anthropic-ai/sdk";
import { withTenant } from "../../lib/db.ts";
import { AppError } from "../../lib/errors.ts";
import { getOrgBasics } from "../../lib/orgCache.ts";
import { logger } from "../../lib/logger.ts";

/**
 * Consommation de l'assistant par entreprise et par mois : sert au quota de
 * l'abonnement (nombre de demandes) et au suivi des coûts (jetons).
 */
export function currentMonth(now: Date = new Date()): string {
  return now.toISOString().slice(0, 7);
}

/** Réserve une demande dans le quota du mois ; refuse si le quota est atteint. */
export async function reserveRequest(orgId: string): Promise<void> {
  const org = await getOrgBasics(orgId);
  if (org.assistantMonthlyQuota <= 0) throw AppError.forbidden("L'assistant n'est pas inclus dans votre abonnement.");
  const month = currentMonth();
  const used = await withTenant(orgId, async (tx) => {
    const row = await tx.aiUsageMonth.upsert({
      where: { organizationId_month: { organizationId: orgId, month } },
      create: { month, requests: 1 },
      update: { requests: { increment: 1 } },
    });
    return row.requests;
  });
  if (used > org.assistantMonthlyQuota) {
    throw new AppError(
      429,
      "ASSISTANT_QUOTA",
      `Votre entreprise a utilisé ses ${org.assistantMonthlyQuota} demandes à l'assistant ce mois-ci. Le quota se renouvelle le 1er du mois.`,
    );
  }
}

export async function usageThisMonth(orgId: string): Promise<number> {
  const row = await withTenant(orgId, (tx) =>
    tx.aiUsageMonth.findUnique({ where: { organizationId_month: { organizationId: orgId, month: currentMonth() } } }),
  );
  return row?.requests ?? 0;
}

export async function recordUsage(orgId: string, usage: Anthropic.Beta.BetaUsage | undefined): Promise<void> {
  if (!usage) return;
  try {
    await withTenant(orgId, (tx) =>
      tx.aiUsageMonth.upsert({
        where: { organizationId_month: { organizationId: orgId, month: currentMonth() } },
        create: {
          month: currentMonth(),
          inputTokens: BigInt(usage.input_tokens ?? 0),
          outputTokens: BigInt(usage.output_tokens ?? 0),
          cacheReadTokens: BigInt(usage.cache_read_input_tokens ?? 0),
        },
        update: {
          inputTokens: { increment: BigInt(usage.input_tokens ?? 0) },
          outputTokens: { increment: BigInt(usage.output_tokens ?? 0) },
          cacheReadTokens: { increment: BigInt(usage.cache_read_input_tokens ?? 0) },
        },
      }),
    );
  } catch (err) {
    logger.warn({ err }, "Consommation de l'assistant non enregistrée");
  }
}
