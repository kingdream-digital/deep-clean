import { can, INVOICE_OPEN_STATUSES, type ActivityDto, type DashboardDto, type Page } from "@aussitot/shared";
import { seq, toDbDate, withTenant } from "../../lib/db.ts";
import { requirePermission, type Ctx } from "../../lib/context.ts";
import { redis } from "../../lib/redis.ts";
import { activityLabel } from "../../lib/audit.ts";
import { monthStart, todayIn, dayRange } from "../../lib/time.ts";
import { missionsOfDay, nextMissionFor } from "../missions/missions.service.ts";
import { unreadCount } from "../notifications/notifications.service.ts";

interface SalesMetrics {
  quotesToFollowUp: number;
  quotesPendingCents: number;
  invoicesOverdueCount: number;
  invoicesOverdueCents: number;
  invoicedThisMonthCents: number;
  collectedThisMonthCents: number;
  draftsCount: number;
}

/**
 * Indicateurs commerciaux de l'entreprise. Identiques pour tous ses
 * utilisateurs : mis en cache 30 secondes dans Redis (une seule requête à la
 * base par entreprise et par période, quel que soit le nombre de personnes
 * qui ouvrent leur tableau de bord).
 */
export async function salesMetrics(ctx: Ctx): Promise<SalesMetrics> {
  const today = todayIn(ctx.timezone);
  const cacheKey = `dash:sales:${ctx.orgId}:${today}`;
  try {
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as SalesMetrics;
  } catch {
    /* cache indisponible : calcul direct */
  }
  const metrics = await withTenant(ctx.orgId, async (tx) => {
    const month = toDbDate(monthStart(today));
    const [pending, overdue, invoiced, collected, drafts] = await seq(
      () =>
        tx.quote.aggregate({
          where: { status: "SENT", OR: [{ validUntil: null }, { validUntil: { gte: toDbDate(today) } }] },
          _count: true,
          _sum: { totalCents: true },
        }),
      () =>
        tx.invoice.aggregate({
          where: { kind: "INVOICE", status: { in: [...INVOICE_OPEN_STATUSES] }, dueDate: { lt: toDbDate(today) } },
          _count: true,
          _sum: { totalCents: true, amountPaidCents: true },
        }),
      () => tx.invoice.aggregate({ where: { status: { notIn: ["DRAFT"] }, issueDate: { gte: month } }, _sum: { totalCents: true } }),
      () => tx.payment.aggregate({ where: { paidOn: { gte: month } }, _sum: { amountCents: true } }),
      () => tx.invoice.count({ where: { status: "DRAFT" } }),
    );
    return {
      quotesToFollowUp: pending._count,
      quotesPendingCents: pending._sum.totalCents ?? 0,
      invoicesOverdueCount: overdue._count,
      invoicesOverdueCents: (overdue._sum.totalCents ?? 0) - (overdue._sum.amountPaidCents ?? 0),
      invoicedThisMonthCents: invoiced._sum.totalCents ?? 0,
      collectedThisMonthCents: collected._sum.amountCents ?? 0,
      draftsCount: drafts,
    };
  });
  try {
    await redis.set(cacheKey, JSON.stringify(metrics), "EX", 30);
  } catch {
    /* sans effet */
  }
  return metrics;
}

/** Tableau de bord adapté au rôle : « où je dois aller, quand, quoi faire, y a-t-il du nouveau ? » */
export async function getDashboard(ctx: Ctx): Promise<DashboardDto> {
  const today = todayIn(ctx.timezone);
  const [user, todayMissions, nextMission, unread] = await Promise.all([
    withTenant(ctx.orgId, (tx) => tx.user.findUniqueOrThrow({ where: { id: ctx.userId }, select: { firstName: true } })),
    missionsOfDay(ctx, today, true),
    nextMissionFor(ctx),
    unreadCount(ctx),
  ]);
  const dashboard: DashboardDto = { greetingName: user.firstName, today, todayMissions, nextMission, unreadNotifications: unread };

  if (can(ctx.role, "quotes.read")) dashboard.sales = await salesMetrics(ctx);
  if (can(ctx.role, "planning.readAll")) {
    const { start, end } = dayRange(today, today, ctx.timezone);
    dashboard.team = await withTenant(ctx.orgId, async (tx) => {
      const [activeMembers, missionsToday, missionsUnassigned] = await seq(
        () => tx.user.count({ where: { isActive: true } }),
        () => tx.mission.count({ where: { startsAt: { gte: start, lt: end }, status: { not: "CANCELLED" } } }),
        () => tx.mission.count({ where: { startsAt: { gte: start }, status: "PLANNED", assignments: { none: {} } } }),
      );
      return { activeMembers, missionsToday, missionsUnassigned };
    });
  }
  return dashboard;
}

export async function listActivity(
  ctx: Ctx,
  query: { cursor?: string; limit: number; entityType?: string; entityId?: string },
): Promise<Page<ActivityDto>> {
  requirePermission(ctx, "activity.read");
  return withTenant(ctx.orgId, async (tx) => {
    const rows = await tx.activityLog.findMany({
      where: { entityType: query.entityType, entityId: query.entityId },
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > query.limit;
    const page = rows.slice(0, query.limit);
    return {
      items: page.map((r) => ({
        id: r.id,
        action: r.action,
        label: activityLabel(r.action) + (r.viaAssistant ? " (via l'assistant)" : ""),
        entityType: r.entityType,
        entityId: r.entityId,
        actor: r.user ? { id: r.user.id, name: `${r.user.firstName} ${r.user.lastName}` } : null,
        createdAt: r.createdAt.toISOString(),
      })),
      nextCursor: hasMore ? page.at(-1)!.id : null,
    };
  });
}
