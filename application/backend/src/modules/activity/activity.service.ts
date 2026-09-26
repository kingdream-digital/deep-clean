import { prisma } from "../../db/prisma";

interface ListActivityLogsFilters {
  userId?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  from?: string;
  to?: string;
  page: number;
  pageSize: number;
}

const activityLogSelect = {
  id: true,
  action: true,
  entityType: true,
  entityId: true,
  metadata: true,
  createdAt: true,
  user: { select: { id: true, firstName: true, lastName: true, email: true, role: true } },
} as const;

/**
 * Consultation du journal d'activité (cahier des charges §21) — jusqu'ici les
 * actions sensibles (comptes, plannings, validations...) étaient bien
 * enregistrées via logActivity() mais AUCUNE route ne permettait de les
 * relire : en cas d'incident ("qui a désactivé ce compte ? qui a validé
 * cette mission ?"), la RH/direction n'avait aucun moyen de le savoir depuis
 * l'application, seul un accès direct à la base de données le permettait.
 */
export async function listActivityLogs(filters: ListActivityLogsFilters) {
  // Un seul objet fusionnant les deux bornes (leçon d'un bug déjà corrigé
  // ailleurs cette session : deux spreads séparés sur la même clé `createdAt`
  // s'écraseraient silencieusement l'un l'autre).
  const createdAtFilter: { gte?: Date; lte?: Date } = {};
  if (filters.from) createdAtFilter.gte = new Date(`${filters.from}T00:00:00`);
  if (filters.to) createdAtFilter.lte = new Date(`${filters.to}T23:59:59`);

  const where = {
    ...(filters.userId ? { userId: filters.userId } : {}),
    ...(filters.action ? { action: filters.action } : {}),
    ...(filters.entityType ? { entityType: filters.entityType } : {}),
    ...(filters.entityId ? { entityId: filters.entityId } : {}),
    ...(Object.keys(createdAtFilter).length > 0 ? { createdAt: createdAtFilter } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.activityLog.findMany({
      where,
      select: activityLogSelect,
      orderBy: { createdAt: "desc" },
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
    }),
    prisma.activityLog.count({ where }),
  ]);

  return { items, total, page: filters.page, pageSize: filters.pageSize };
}

// Liste distincte des valeurs d'`action` déjà enregistrées, pour peupler un
// filtre côté mobile sans coder en dur la liste des actions possibles (elles
// évoluent au fil des modules) — bornée à un nombre de résultats raisonnable
// par construction (le nombre de valeurs d'action distinctes est petit, de
// l'ordre de quelques dizaines, jamais proportionnel au volume du journal).
export async function listDistinctActions(): Promise<string[]> {
  const rows = await prisma.activityLog.findMany({
    distinct: ["action"],
    select: { action: true },
    orderBy: { action: "asc" },
  });
  return rows.map((r) => r.action);
}
