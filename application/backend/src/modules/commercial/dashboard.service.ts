import { ProspectStatus, QuoteStatus } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { getSiteProgress } from "../sites/sites.service";
import { COMMERCIAL_FULL_ROLES } from "./roles";
import type { Actor } from "./roles";

function currentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

const QUOTE_IN_PROGRESS_STATUSES: QuoteStatus[] = [
  QuoteStatus.DRAFT,
  QuoteStatus.TO_VALIDATE,
  QuoteStatus.VALIDATED,
  QuoteStatus.SENT,
  QuoteStatus.FOLLOW_UP,
];

interface SiteAttention {
  siteId: string;
  siteName: string;
  remainingVisits: number;
}

export interface CommercialDashboard {
  commercial: {
    // "Prospects en cours" — exclut Gagné/Perdu, déjà clos (§35-36).
    activeProspects: number;
    quotesInProgress: number;
    quotesToFollowUp: number;
    quotesAccepted: number;
    quotesRejected: number;
  };
  sites: {
    activeSites: number;
    // Agrégés sur les chantiers ayant un objectif défini pour le mois en
    // cours — recalculés à la volée (voir sites.service.ts::getSiteProgress),
    // jamais une valeur stockée qui pourrait dériver (§34).
    period: string;
    plannedVisits: number;
    completedVisits: number;
    remainingVisits: number;
    // Alerte purement informative (§37) — n'affecte jamais le planning.
    sitesNeedingAttention: SiteAttention[];
  };
  // Absent pour un Superviseur : la facturation ne figure pas dans sa liste
  // de permissions (cahier des charges §1-3).
  invoicing: {
    toPrepare: number;
    validated: number;
    sent: number;
    paid: number;
    // Indicateur, pas un chiffre comptable : somme du prévisionnel mensuel
    // (voir Quote.monthlyAmountHt) des devis actuellement acceptés.
    projectedMonthlyRevenueHt: number;
  } | null;
}

// Tableau de bord commercial (cahier des charges §35-37) — n'affiche que des
// informations et des indicateurs, ne déclenche ni ne modifie jamais rien
// (aucune mission, aucun chantier, aucune facture créée ici).
export async function getCommercialDashboard(actor: Actor): Promise<CommercialDashboard> {
  const isFull = COMMERCIAL_FULL_ROLES.includes(actor.role);
  const period = currentPeriod();

  const prospectScope = isFull ? {} : { OR: [{ assignedUserId: actor.userId }, { createdById: actor.userId }] };
  const quoteScope = isFull ? {} : { OR: [{ assignedUserId: actor.userId }, { createdById: actor.userId }] };
  // "Mes chantiers" pour un superviseur (§36) — l'interlocuteur fixe du
  // chantier (Site.supervisorId), pas une notion de propriété plus large.
  const siteScope = isFull ? { isActive: true } : { isActive: true, supervisorId: actor.userId };

  const [activeProspects, quotesInProgress, quotesToFollowUp, quotesAccepted, quotesRejected, sites] = await Promise.all([
    prisma.prospect.count({ where: { ...prospectScope, status: { notIn: [ProspectStatus.WON, ProspectStatus.LOST] } } }),
    prisma.quote.count({ where: { ...quoteScope, status: { in: QUOTE_IN_PROGRESS_STATUSES } } }),
    prisma.quote.count({ where: { ...quoteScope, status: QuoteStatus.FOLLOW_UP } }),
    prisma.quote.count({ where: { ...quoteScope, status: QuoteStatus.ACCEPTED } }),
    prisma.quote.count({ where: { ...quoteScope, status: QuoteStatus.REJECTED } }),
    prisma.site.findMany({ where: siteScope, select: { id: true, name: true } }),
  ]);

  let plannedVisits = 0;
  let completedVisits = 0;
  const sitesNeedingAttention: SiteAttention[] = [];
  for (const site of sites) {
    const progress = await getSiteProgress(actor, site.id, period);
    if (progress.target) {
      plannedVisits += progress.target.plannedVisits;
      completedVisits += progress.completedVisits;
      if (progress.remainingVisits && progress.remainingVisits > 0) {
        sitesNeedingAttention.push({ siteId: site.id, siteName: site.name, remainingVisits: progress.remainingVisits });
      }
    }
  }
  sitesNeedingAttention.sort((a, b) => b.remainingVisits - a.remainingVisits);

  let invoicing: CommercialDashboard["invoicing"] = null;
  if (isFull) {
    const [toPrepare, validated, sent, paid, acceptedAgg] = await Promise.all([
      prisma.invoice.count({ where: { status: "DRAFT" } }),
      prisma.invoice.count({ where: { status: "VALIDATED" } }),
      prisma.invoice.count({ where: { status: "SENT" } }),
      prisma.invoice.count({ where: { status: "PAID" } }),
      prisma.quote.aggregate({ where: { status: QuoteStatus.ACCEPTED }, _sum: { monthlyAmountHt: true } }),
    ]);
    invoicing = { toPrepare, validated, sent, paid, projectedMonthlyRevenueHt: acceptedAgg._sum.monthlyAmountHt ?? 0 };
  }

  return {
    commercial: { activeProspects, quotesInProgress, quotesToFollowUp, quotesAccepted, quotesRejected },
    sites: {
      activeSites: sites.length,
      period,
      plannedVisits,
      completedVisits,
      remainingVisits: Math.max(0, plannedVisits - completedVisits),
      sitesNeedingAttention: sitesNeedingAttention.slice(0, 5),
    },
    invoicing,
  };
}
