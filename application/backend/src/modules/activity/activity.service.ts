import { prisma } from "../../db/prisma";
import { companyDayEnd, companyDayStart } from "../../utils/companyTime";

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
  if (filters.from) createdAtFilter.gte = companyDayStart(filters.from);
  if (filters.to) createdAtFilter.lte = companyDayEnd(filters.to);

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

  const labels = await resolveEntityLabels(items);
  return {
    items: items.map((item) => ({ ...item, entityLabel: item.entityId ? labels.get(`${item.entityType}:${item.entityId}`) ?? null : null })),
    total,
    page: filters.page,
    pageSize: filters.pageSize,
  };
}

/**
 * Nom lisible de l'élément concerné (« Compte désactivé » → quel compte ?).
 * Une requête groupée par type d'élément présent dans la page, jamais une
 * par ligne.
 */
async function resolveEntityLabels(items: { entityType: string | null; entityId: string | null }[]): Promise<Map<string, string>> {
  const idsByType = new Map<string, string[]>();
  for (const item of items) {
    if (!item.entityType || !item.entityId) continue;
    const list = idsByType.get(item.entityType) ?? [];
    if (!list.includes(item.entityId)) list.push(item.entityId);
    idsByType.set(item.entityType, list);
  }
  const labels = new Map<string, string>();
  const put = (type: string, rows: { id: string; label: string }[]) => {
    for (const row of rows) labels.set(`${type}:${row.id}`, row.label);
  };
  const ids = (type: string) => ({ in: idsByType.get(type) ?? [] });
  await Promise.all(
    [...idsByType.keys()].map(async (type) => {
      switch (type) {
        case "User":
        case "EmployeeDocument": {
          if (type === "EmployeeDocument") {
            const docs = await prisma.employeeDocument.findMany({ where: { id: ids(type) }, select: { id: true, user: { select: { firstName: true, lastName: true } } } });
            put(type, docs.map((d) => ({ id: d.id, label: `${d.user.firstName} ${d.user.lastName}` })));
          } else {
            const users = await prisma.user.findMany({ where: { id: ids(type) }, select: { id: true, firstName: true, lastName: true } });
            put(type, users.map((u) => ({ id: u.id, label: `${u.firstName} ${u.lastName}` })));
          }
          break;
        }
        case "Site":
          put(type, (await prisma.site.findMany({ where: { id: ids(type) }, select: { id: true, name: true } })).map((r) => ({ id: r.id, label: r.name })));
          break;
        case "Mission":
          put(type, (await prisma.mission.findMany({ where: { id: ids(type) }, select: { id: true, title: true } })).map((r) => ({ id: r.id, label: r.title })));
          break;
        case "Problem":
          put(type, (await prisma.problem.findMany({ where: { id: ids(type) }, select: { id: true, description: true } })).map((r) => ({ id: r.id, label: r.description.slice(0, 60) })));
          break;
        case "TimeEntry":
          put(type, (await prisma.timeEntry.findMany({ where: { id: ids(type) }, select: { id: true, user: { select: { firstName: true, lastName: true } } } })).map((r) => ({ id: r.id, label: `${r.user.firstName} ${r.user.lastName}` })));
          break;
        case "Absence":
          put(type, (await prisma.absence.findMany({ where: { id: ids(type) }, select: { id: true, user: { select: { firstName: true, lastName: true } } } })).map((r) => ({ id: r.id, label: `${r.user.firstName} ${r.user.lastName}` })));
          break;
        case "CleaningStandard":
          put(type, (await prisma.cleaningStandard.findMany({ where: { id: ids(type) }, select: { id: true, name: true } })).map((r) => ({ id: r.id, label: r.name })));
          break;
        case "Announcement":
          put(type, (await prisma.announcement.findMany({ where: { id: ids(type) }, select: { id: true, title: true } })).map((r) => ({ id: r.id, label: r.title })));
          break;
        case "Conversation":
          put(type, (await prisma.conversation.findMany({ where: { id: ids(type) }, select: { id: true, title: true } })).map((r) => ({ id: r.id, label: r.title ?? "Discussion" })));
          break;
        case "Prospect":
          put(type, (await prisma.prospect.findMany({ where: { id: ids(type) }, select: { id: true, companyName: true } })).map((r) => ({ id: r.id, label: r.companyName })));
          break;
        case "Client":
          put(type, (await prisma.client.findMany({ where: { id: ids(type) }, select: { id: true, companyName: true } })).map((r) => ({ id: r.id, label: r.companyName })));
          break;
        case "Quote":
          put(type, (await prisma.quote.findMany({ where: { id: ids(type) }, select: { id: true, quoteNumber: true } })).map((r) => ({ id: r.id, label: r.quoteNumber })));
          break;
        case "Invoice":
          put(type, (await prisma.invoice.findMany({ where: { id: ids(type) }, select: { id: true, invoiceNumber: true } })).map((r) => ({ id: r.id, label: r.invoiceNumber })));
          break;
        default:
          break;
      }
    })
  );
  return labels;
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
