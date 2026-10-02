import { AbsenceStatus, AbsenceType, LeaveTransactionType, NotificationType, Role } from "@prisma/client";
import { companyDayEnd, companyDayStart } from "../../utils/companyTime";
import { prisma } from "../../db/prisma";
import { ApiError } from "../../utils/ApiError";
import { logActivity } from "../../utils/activityLog";
import { createNotification } from "../notifications/notifications.service";
import { env } from "../../config/env";

interface Actor {
  userId: string;
  role: Role;
}

// Mêmes rôles que absences.service.ts::MANAGE_ABSENCES_ROLES — le moteur de
// congés (solde, historique, corrections) suit la même autorité que la
// décision des demandes elles-mêmes.
const MANAGE_LEAVE_ROLES: Role[] = [Role.HR, Role.DIRECTOR, Role.ADMIN, Role.SUPERVISOR];

function canManageLeave(actor: Actor): boolean {
  return MANAGE_LEAVE_ROLES.includes(actor.role);
}

// Duplique volontairement absences.service.ts::resolveManagedTeamIds (même
// requête, quelques lignes) plutôt que de l'importer : évite une dépendance
// circulaire (absences.service.ts appelle déjà ce module pour la déduction).
async function resolveManagedTeamIds(managerId: string): Promise<string[]> {
  const team = await prisma.siteMember.findMany({ where: { site: { managerId } }, select: { userId: true } });
  return Array.from(new Set([managerId, ...team.map((m) => m.userId)]));
}

async function assertCanViewBalance(actor: Actor, targetUserId: string): Promise<void> {
  if (actor.userId === targetUserId) return;
  if (canManageLeave(actor)) return;
  if (actor.role === Role.SITE_MANAGER) {
    const team = await resolveManagedTeamIds(actor.userId);
    if (team.includes(targetUserId)) return;
  }
  // 404 (jamais 403) hors périmètre — même convention que le reste de l'app
  // (sites, missions, absences...) : ne révèle pas l'existence du compte.
  throw ApiError.notFound("Compte introuvable.");
}

// Compte les jours OUVRÉS (lundi-vendredi) entre deux dates incluses. Aucun
// calendrier de jours fériés dans l'application (limite connue et assumée) —
// en contrepartie, c'est la MÊME fonction qui sert à la fois à afficher "en
// attente" à la création d'une demande et à calculer la déduction réelle à
// la validation : jamais deux calculs différents qui pourraient diverger.
export function countBusinessDays(startDate: Date, endDate: Date): number {
  let count = 0;
  // Jours calendaires stockés à minuit UTC : on avance en UTC, pour un
  // résultat identique quel que soit le fuseau du serveur.
  const cursor = new Date(startDate);
  cursor.setUTCHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setUTCHours(0, 0, 0, 0);
  while (cursor <= end) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) count++;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

export interface AccrualBreakdown {
  monthlyRate: number;
  cap: number | null;
  daysElapsed: number;
  monthsAccrued: number;
  rawAccrued: number;
  accrued: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const AVG_DAYS_PER_MONTH = 30.44;

/**
 * Calcul DÉTERMINISTE de l'acquis pour une année donnée à partir de la date
 * d'embauche — jamais un compteur stocké qui pourrait dériver (retour
 * explicite du client : "calculs automatiques et traçables"). Le taux
 * mensuel et le plafond éventuel sont configurables PAR SALARIÉ
 * (User.leaveAccrualRate/leaveAccrualCap, réglables par la RH/direction —
 * temps partiel, avenant...) ; seul le DÉFAUT appliqué en l'absence de
 * réglage propre est une constante (DEFAULT_LEAVE_ACCRUAL_RATE_PER_MONTH),
 * elle-même modifiable sans redéploiement (variable d'environnement) —
 * jamais une règle figée dans le code ("+2,5 jours par mois" en dur).
 *
 * Prorata linéaire en JOURS calendaires (pas en mois civils) entre le début
 * de la période (embauche ou 1er janvier, le plus tardif des deux) et sa fin
 * (aujourd'hui ou 31 décembre, le plus proche des deux) : plus simple et
 * plus robuste qu'un calcul mois par mois (aucun cas particulier de
 * frontière de mois), au prix d'une légère approximation (mois moyen de
 * 30,44 jours) jugée largement suffisante pour un compteur indicatif.
 */
export function computeAccrual(
  user: { hireDate: Date; leaveAccrualRate: number | null; leaveAccrualCap: number | null },
  year: number,
  asOf: Date = new Date()
): AccrualBreakdown {
  const monthlyRate = user.leaveAccrualRate ?? env.DEFAULT_LEAVE_ACCRUAL_RATE_PER_MONTH;
  const cap = user.leaveAccrualCap ?? null;

  const yearStart = companyDayStart(`${year}-01-01`);
  const yearEnd = companyDayEnd(`${year}-12-31`);
  const periodStart = user.hireDate > yearStart ? user.hireDate : yearStart;
  const periodEnd = asOf < yearEnd ? asOf : yearEnd;

  if (periodEnd <= periodStart) {
    return { monthlyRate, cap, daysElapsed: 0, monthsAccrued: 0, rawAccrued: 0, accrued: 0 };
  }

  const daysElapsed = Math.floor((periodEnd.getTime() - periodStart.getTime()) / MS_PER_DAY) + 1;
  const monthsAccrued = Math.round((daysElapsed / AVG_DAYS_PER_MONTH) * 100) / 100;
  const rawAccrued = Math.round(monthsAccrued * monthlyRate * 100) / 100;
  const accrued = cap != null ? Math.min(rawAccrued, cap) : rawAccrued;

  return { monthlyRate, cap, daysElapsed, monthsAccrued, rawAccrued, accrued };
}

export interface LeaveBalanceResult {
  userId: string;
  year: number;
  acquired: number;
  taken: number;
  pending: number;
  remaining: number;
  breakdown: AccrualBreakdown;
}

// Compteur complet (acquis / pris / en attente / restant) pour un salarié et
// une année — voir CLAUDE.md / retour client : "L'employé ne voit que son
// compteur. Les RH peuvent consulter tous les compteurs." (même esprit
// étendu au chef d'équipe pour sa propre équipe, comme pour le reste du
// module absences).
export async function getLeaveBalance(actor: Actor, targetUserId: string, year: number): Promise<LeaveBalanceResult> {
  await assertCanViewBalance(actor, targetUserId);

  const user = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { hireDate: true, leaveAccrualRate: true, leaveAccrualCap: true },
  });
  if (!user) throw ApiError.notFound("Compte introuvable.");

  const yearStart = companyDayStart(`${year}-01-01`);
  const yearEnd = companyDayEnd(`${year}-12-31`);
  const now = new Date();
  const asOf = now < yearEnd ? now : yearEnd;

  const breakdown = computeAccrual(user, year, asOf);

  const [takenAndCancelledAgg, adjustmentAgg, pendingRequests] = await Promise.all([
    // LEAVE_TAKEN (négatif) + LEAVE_CANCELLED (positif) se neutralisent
    // exactement pour un congé annulé — "pris" reflète donc le net réel.
    prisma.leaveTransaction.aggregate({
      where: {
        userId: targetUserId,
        type: { in: [LeaveTransactionType.LEAVE_TAKEN, LeaveTransactionType.LEAVE_CANCELLED] },
        occurredAt: { gte: yearStart, lte: yearEnd },
      },
      _sum: { days: true },
    }),
    prisma.leaveTransaction.aggregate({
      where: { userId: targetUserId, type: LeaveTransactionType.ADJUSTMENT, occurredAt: { gte: yearStart, lte: yearEnd } },
      _sum: { days: true },
    }),
    prisma.absence.findMany({
      where: {
        userId: targetUserId,
        type: AbsenceType.PAID_LEAVE,
        status: AbsenceStatus.PENDING,
        startDate: { lte: yearEnd },
        endDate: { gte: yearStart },
      },
      select: { startDate: true, endDate: true },
    }),
  ]);

  const taken = Math.max(0, -(takenAndCancelledAgg._sum.days ?? 0));
  const adjustments = adjustmentAgg._sum.days ?? 0;
  const pending = pendingRequests.reduce((sum, r) => sum + countBusinessDays(r.startDate, r.endDate), 0);

  const acquired = Math.round((breakdown.accrued + adjustments) * 100) / 100;
  const remaining = Math.round((acquired - taken - pending) * 100) / 100;

  return { userId: targetUserId, year, acquired, taken, pending, remaining, breakdown };
}

// Appelé par absences.service.ts::decideAbsence à la validation d'un congé
// payé — jamais depuis un autre point d'entrée, pour garantir qu'une
// déduction est toujours adossée à une demande réellement approuvée.
export async function recordLeaveTaken(
  absence: { id: string; userId: string; startDate: Date; endDate: Date },
  actorId: string
): Promise<number> {
  const days = countBusinessDays(absence.startDate, absence.endDate);
  await prisma.leaveTransaction.create({
    data: {
      userId: absence.userId,
      type: LeaveTransactionType.LEAVE_TAKEN,
      days: -days,
      absenceId: absence.id,
      createdById: actorId,
      note: "Congé validé",
    },
  });
  return days;
}

// Appelé par absences.service.ts::cancelAbsence — recrédite exactement le
// nombre de jours déduits à la validation (même fonction de calcul).
export async function recordLeaveCancelled(
  absence: { id: string; userId: string; startDate: Date; endDate: Date },
  actorId: string
): Promise<number> {
  const days = countBusinessDays(absence.startDate, absence.endDate);
  await prisma.leaveTransaction.create({
    data: {
      userId: absence.userId,
      type: LeaveTransactionType.LEAVE_CANCELLED,
      days,
      absenceId: absence.id,
      createdById: actorId,
      note: "Congé annulé",
    },
  });
  return days;
}

// Correction manuelle RH (retour explicite du client, section "Correction
// des compteurs") — seule action qui modifie le solde SANS demande de congé
// associée. Toujours journalisée et notifiée au salarié concerné.
export async function createLeaveAdjustment(
  actor: Actor,
  targetUserId: string,
  input: { days: number; note?: string }
) {
  if (!canManageLeave(actor)) throw ApiError.forbidden();
  if (input.days === 0) throw ApiError.badRequest("Le nombre de jours de la correction ne peut pas être nul.");

  const target = await prisma.user.findUnique({ where: { id: targetUserId } });
  if (!target) throw ApiError.notFound("Compte introuvable.");

  const transaction = await prisma.leaveTransaction.create({
    data: {
      userId: targetUserId,
      type: LeaveTransactionType.ADJUSTMENT,
      days: input.days,
      createdById: actor.userId,
      note: input.note,
    },
  });

  await logActivity({
    userId: actor.userId,
    action: "LEAVE_ADJUSTMENT",
    entityType: "User",
    entityId: targetUserId,
    metadata: { days: input.days, note: input.note },
  });

  await createNotification({
    userId: targetUserId,
    type: NotificationType.GENERAL,
    title: "Correction de votre solde de congés",
    body: `${input.days > 0 ? "+" : ""}${input.days} jour${Math.abs(input.days) > 1 ? "s" : ""}${
      input.note ? " : " + input.note : " (correction RH)."
    }`,
  });

  return transaction;
}

interface ListLeaveTransactionsFilters {
  year?: number;
}

// Historique complet des transactions d'un salarié — "les RH doivent pouvoir
// comprendre l'origine exacte du solde de chaque salarié" (retour explicite
// du client).
export async function listLeaveTransactions(actor: Actor, targetUserId: string, filters: ListLeaveTransactionsFilters) {
  await assertCanViewBalance(actor, targetUserId);

  const where: Record<string, unknown> = { userId: targetUserId };
  if (filters.year) {
    where.occurredAt = {
      gte: companyDayStart(`${filters.year}-01-01`),
      lte: companyDayEnd(`${filters.year}-12-31`),
    };
  }

  return prisma.leaveTransaction.findMany({
    where,
    select: {
      id: true,
      type: true,
      days: true,
      occurredAt: true,
      note: true,
      absenceId: true,
      createdBy: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: { occurredAt: "desc" },
  });
}
