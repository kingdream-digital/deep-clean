import { AbsenceStatus, AbsenceType, LeaveAccrualStatus, LeaveTransactionType, NotificationType, Role } from "@prisma/client";
import { addDaysToKey, calendarDay, companyDateKey, companyDayEnd, companyDayStart } from "../../utils/companyTime";
import { countWorkableDays } from "../../utils/frenchCalendar";
import { prisma } from "../../db/prisma";
import { ApiError } from "../../utils/ApiError";
import { logActivity } from "../../utils/activityLog";
import { createNotification } from "../notifications/notifications.service";
import { env } from "../../config/env";
import { referencePeriodOf, splitLeaveByPeriod } from "./leavePeriods";
import type { LeaveCredit, LeaveDebit } from "./leavePeriods";

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

// Décompte d'un congé : jours OUVRABLES (lundi → samedi, hors jours fériés),
// même unité que l'acquisition légale (2,5 jours ouvrables par mois). C'est la
// MÊME fonction qui sert à l'aperçu d'une demande et à la déduction réelle à
// la validation : jamais deux calculs qui divergent.
export function countBusinessDays(startDate: Date, endDate: Date): number {
  return countWorkableDays(startDate, endDate);
}

// ---------------------------------------------------------------------------
// Acquisition des congés, mois par mois
// ---------------------------------------------------------------------------
//
// Règle légale de base (Code du travail, L3141-3) : 2,5 jours ouvrables
// acquis par mois de travail effectif, soit 30 jours ouvrables (5 semaines)
// par période de référence (1er juin → 31 mai, L3141-10 à défaut d'accord).
// Le taux et le plafond restent réglables par salarié (User.leaveAccrualRate /
// leaveAccrualCap) ; la valeur par défaut vient de l'environnement.
//
// Absences et ouverture de droits :
//   - congé payé, accident du travail / maladie professionnelle, congé
//     maternité / paternité / adoption, autre absence : assimilés à du
//     travail effectif (L3141-5) → acquisition normale ;
//   - arrêt maladie non professionnel : 2 jours ouvrables par mois
//     (L3141-5-1, loi du 22 avril 2024), soit 80 % du taux ;
//   - congé sans solde : aucun droit acquis sur ces jours.
// Un mois partiel (embauche en cours de mois) est calculé au prorata des
// jours calendaires.
//
// Chaque mois écoulé produit un relevé « à valider » (LeaveAccrual PROPOSED) :
// la RH le consulte, peut le corriger, puis le valide. Seuls les relevés
// validés comptent dans le solde.

const ASSIMILATED_TYPES: AbsenceType[] = [
  AbsenceType.PAID_LEAVE,
  AbsenceType.WORK_ACCIDENT,
  AbsenceType.PARENTAL_LEAVE,
  // Repos compensateur des travailleurs de nuit : temps de travail effectif
  // (Code du travail L3122-8) — il ne fait perdre aucun jour de congé.
  AbsenceType.COMPENSATORY_REST,
  AbsenceType.OTHER,
];
const SICK_RATE_RATIO = 2 / 2.5;
const DEFAULT_PERIOD_CAP = 30;

export interface MonthAccrualDetails {
  month: string;
  monthDays: number;
  consideredDays: number; // jours du mois sous contrat
  workedDays: number;
  assimilatedDays: number;
  sickDays: number;
  unpaidDays: number;
  rate: number;
  sickRate: number;
  rawDays: number;
  capped: boolean;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y!, m!, 0)).getUTCDate();
}

/** Début du contrat, en jour calendaire « AAAA-MM-JJ ». */
function contractStartKey(hireDate: Date): string {
  const iso = hireDate.toISOString();
  // Jour calendaire stocké à minuit UTC, ou instant (défaut : création du compte).
  return iso.endsWith("T00:00:00.000Z") ? iso.slice(0, 10) : companyDateKey(hireDate);
}

/** Période de référence (1er juin → 31 mai) contenant ce mois : « AAAA » de début. */
function referencePeriodStartYear(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return m! >= 6 ? y! : y! - 1;
}

function addMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y!, m! - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

/**
 * Calcul d'un mois (ou d'une partie de mois jusqu'à `untilKey` inclus, pour
 * l'estimation du mois en cours). `null` si le contrat n'a pas commencé.
 */
export function computeMonthAccrual(
  user: { hireDate: Date; leaveAccrualRate: number | null },
  month: string,
  absences: Array<{ type: AbsenceType; startDate: Date; endDate: Date }>,
  untilKey?: string
): MonthAccrualDetails | null {
  const rate = user.leaveAccrualRate ?? env.DEFAULT_LEAVE_ACCRUAL_RATE_PER_MONTH;
  const sickRate = round2(rate * SICK_RATE_RATIO);
  const monthDays = daysInMonth(month);
  const firstKey = `${month}-01`;
  const lastKey = untilKey && untilKey < `${month}-${String(monthDays).padStart(2, "0")}` ? untilKey : `${month}-${String(monthDays).padStart(2, "0")}`;
  const startKey = contractStartKey(user.hireDate) > firstKey ? contractStartKey(user.hireDate) : firstKey;
  if (startKey > lastKey) return null;

  let workedDays = 0;
  let assimilatedDays = 0;
  let sickDays = 0;
  let unpaidDays = 0;
  for (let key = startKey; key <= lastKey; key = addDaysToKey(key, 1)) {
    const day = calendarDay(key);
    const absence = absences.find((a) => day >= a.startDate && day <= a.endDate);
    if (!absence) workedDays++;
    else if (absence.type === AbsenceType.SICK_LEAVE) sickDays++;
    else if (absence.type === AbsenceType.UNPAID_LEAVE) unpaidDays++;
    else if (ASSIMILATED_TYPES.includes(absence.type)) assimilatedDays++;
    else workedDays++;
  }
  const consideredDays = workedDays + assimilatedDays + sickDays + unpaidDays;
  const rawDays = round2(((workedDays + assimilatedDays) / monthDays) * rate + (sickDays / monthDays) * sickRate);
  return { month, monthDays, consideredDays, workedDays, assimilatedDays, sickDays, unpaidDays, rate, sickRate, rawDays, capped: false };
}

const ACCRUAL_EXCLUDED_ROLES: Role[] = [Role.ADMIN];

/**
 * Calcule les relevés des mois écoulés manquants (jusqu'au mois précédent
 * inclus) pour tous les salariés actifs, ou ceux demandés. Idempotent : un
 * mois déjà validé n'est jamais touché ; un relevé encore « à valider » et
 * non corrigé par la RH est recalculé (ex. arrêt maladie saisi après coup).
 * Le compteur d'un nouveau salarié part de 0 : rien avant la création de son
 * compte (la reprise d'un solde existant se fait par une correction RH).
 */
export async function generateAccruals(options: { userIds?: string[]; now?: Date } = {}): Promise<number> {
  const now = options.now ?? new Date();
  const lastCompleted = addMonth(companyDateKey(now).slice(0, 7), -1);
  const users = await prisma.user.findMany({
    where: { isActive: true, role: { notIn: ACCRUAL_EXCLUDED_ROLES }, ...(options.userIds ? { id: { in: options.userIds } } : {}) },
    select: { id: true, hireDate: true, createdAt: true, leaveAccrualRate: true, leaveAccrualCap: true },
  });

  let written = 0;
  for (const user of users) {
    const startKey = contractStartKey(user.hireDate);
    const createdKey = companyDateKey(user.createdAt);
    let month = (startKey > createdKey ? startKey : createdKey).slice(0, 7);
    if (month > lastCompleted) continue;

    const [absences, existing] = await Promise.all([
      prisma.absence.findMany({
        where: { userId: user.id, status: AbsenceStatus.APPROVED, endDate: { gte: calendarDay(`${month}-01`) } },
        select: { type: true, startDate: true, endDate: true },
      }),
      prisma.leaveAccrual.findMany({ where: { userId: user.id }, select: { id: true, month: true, status: true, days: true, computedDays: true } }),
    ]);
    const byMonth = new Map(existing.map((a) => [a.month, a]));
    const cap = user.leaveAccrualCap ?? DEFAULT_PERIOD_CAP;

    for (; month <= lastCompleted; month = addMonth(month, 1)) {
      const current = byMonth.get(month);
      const untouched = current && current.status === LeaveAccrualStatus.PROPOSED && current.days === current.computedDays;
      if (current && !untouched) continue;

      const details = computeMonthAccrual(user, month, absences);
      if (!details) continue;
      // Plafond de la période de référence (1er juin → 31 mai).
      const periodYear = referencePeriodStartYear(month);
      const alreadyInPeriod = existing
        .filter((a) => a.month !== month && referencePeriodStartYear(a.month) === periodYear)
        .reduce((sum, a) => sum + a.days, 0);
      const days = round2(Math.max(0, Math.min(details.rawDays, cap - alreadyInPeriod)));
      const finalDetails = { ...details, capped: days < details.rawDays };

      if (current) {
        if (current.computedDays !== days) {
          await prisma.leaveAccrual.update({ where: { id: current.id }, data: { computedDays: days, days, details: finalDetails } });
          current.days = days;
          current.computedDays = days;
          written++;
        }
      } else {
        const created = await prisma.leaveAccrual.create({
          data: { userId: user.id, month, computedDays: days, days, details: finalDetails },
          select: { id: true, month: true, status: true, days: true, computedDays: true },
        });
        existing.push(created);
        written++;
      }
    }
  }
  return written;
}

const VALIDATE_ACCRUAL_ROLES: Role[] = [Role.HR, Role.DIRECTOR, Role.ADMIN];

const accrualSelect = {
  id: true,
  userId: true,
  user: { select: { id: true, firstName: true, lastName: true, role: true, weeklyHours: true } },
  month: true,
  computedDays: true,
  days: true,
  details: true,
  status: true,
  note: true,
  validatedAt: true,
  validatedBy: { select: { id: true, firstName: true, lastName: true } },
} as const;

/**
 * Tâche du 1er de chaque mois : calcule les relevés du mois écoulé et
 * prévient la RH / la direction qu'ils sont à valider.
 */
export async function runMonthlyAccrualJob(now: Date = new Date()): Promise<void> {
  const written = await generateAccruals({ now });
  await remindPreviousYearLeave(now);
  if (written === 0) return;
  await notifyAccrualsToValidate(addMonth(companyDateKey(now).slice(0, 7), -1));
}

/** Prévient la RH et la direction que les relevés d'un mois sont à valider. */
export async function notifyAccrualsToValidate(month: string): Promise<void> {
  const recipients = await prisma.user.findMany({
    where: { role: { in: VALIDATE_ACCRUAL_ROLES_FOR_NOTICE }, isActive: true },
    select: { id: true },
  });
  for (const r of recipients) {
    await createNotification({
      userId: r.id,
      type: NotificationType.GENERAL,
      title: "Congés acquis à valider",
      body: `Les congés acquis en ${monthLabel(month)} ont été calculés. Vérifiez-les et validez-les dans Menu → Compteurs de congés.`,
      relatedEntityType: "LeaveAccruals",
      relatedEntityId: month,
    });
  }
}
const VALIDATE_ACCRUAL_ROLES_FOR_NOTICE: Role[] = [Role.HR, Role.DIRECTOR];

const REMINDER_TITLE = "Congés de l'an dernier à prendre";

/**
 * Le 1er mars, avril et mai : rappelle à chaque salarié qui a encore des
 * congés de l'an dernier qu'ils sont à prendre avant le 31 mai. Une seule
 * fois par mois (la tâche tourne aussi à chaque démarrage du serveur).
 */
export async function remindPreviousYearLeave(now: Date = new Date()): Promise<number> {
  const todayKey = companyDateKey(now);
  const month = Number(todayKey.slice(5, 7));
  if (month < 3 || month > 5) return 0;
  const monthKey = todayKey.slice(0, 7);
  const users = await prisma.user.findMany({
    where: { isActive: true, role: { notIn: ACCRUAL_EXCLUDED_ROLES } },
    select: { id: true, role: true },
  });
  let sent = 0;
  for (const u of users) {
    const already = await prisma.notification.findFirst({
      where: { userId: u.id, relatedEntityType: "LeaveBalance", relatedEntityId: `rappel-${monthKey}` },
      select: { id: true },
    });
    if (already) continue;
    const balance = await getLeaveBalance({ userId: u.id, role: u.role }, u.id, Number(todayKey.slice(0, 4)));
    if (balance.previousYear.remaining <= 0) continue;
    await createNotification({
      userId: u.id,
      type: NotificationType.GENERAL,
      title: REMINDER_TITLE,
      body: `Il vous reste ${formatDays(balance.previousYear.remaining)} de l'an dernier, à prendre avant le 31 mai. Passé cette date, ils sont perdus sauf accord de la RH.`,
      relatedEntityType: "LeaveBalance",
      relatedEntityId: `rappel-${monthKey}`,
    });
    sent++;
  }
  return sent;
}

/** Relevés d'un mois (RH, direction, admin, superviseur en lecture). */
export async function listAccruals(actor: Actor, filters: { month?: string; status?: LeaveAccrualStatus }) {
  if (!canManageLeave(actor)) throw ApiError.forbidden();
  // Les mois écoulés manquants sont calculés à la demande : la RH voit
  // toujours un relevé à jour, même si la tâche mensuelle n'a pas encore tourné.
  await generateAccruals();
  return prisma.leaveAccrual.findMany({
    where: { ...(filters.month ? { month: filters.month } : {}), ...(filters.status ? { status: filters.status } : {}) },
    select: accrualSelect,
    orderBy: [{ month: "desc" }, { user: { lastName: "asc" } }],
  });
}

/** Validation (et correction éventuelle) d'un relevé par la RH. */
export async function validateAccrual(actor: Actor, id: string, input: { days?: number; note?: string }) {
  if (!VALIDATE_ACCRUAL_ROLES.includes(actor.role)) throw ApiError.forbidden();
  const accrual = await prisma.leaveAccrual.findUnique({ where: { id } });
  if (!accrual) throw ApiError.notFound("Relevé introuvable.");
  if (accrual.status === LeaveAccrualStatus.VALIDATED) throw ApiError.conflict("Ce relevé est déjà validé.");
  if (accrual.userId === actor.userId) throw ApiError.forbidden("Vous ne pouvez pas valider vos propres congés.");

  const days = input.days ?? accrual.days;
  if (days < 0 || days > 31) throw ApiError.badRequest("Nombre de jours invalide.");
  const corrected = round2(days) !== round2(accrual.computedDays);
  if (corrected && !input.note?.trim()) throw ApiError.badRequest("Indiquez le motif de la correction.");

  const updated = await prisma.leaveAccrual.update({
    where: { id },
    data: { days: round2(days), note: input.note?.trim() || accrual.note, status: LeaveAccrualStatus.VALIDATED, validatedById: actor.userId, validatedAt: new Date() },
    select: accrualSelect,
  });
  await logActivity({
    userId: actor.userId,
    action: corrected ? "LEAVE_ACCRUAL_CORRECTED" : "LEAVE_ACCRUAL_VALIDATED",
    entityType: "User",
    entityId: accrual.userId,
    metadata: { month: accrual.month, computedDays: accrual.computedDays, days: round2(days), note: input.note },
  });
  await createNotification({
    userId: accrual.userId,
    type: NotificationType.GENERAL,
    title: "Congés acquis",
    body: `${formatDays(round2(days))} acquis pour ${monthLabel(accrual.month)}${corrected && input.note ? ` (${input.note.trim()})` : ""}.`,
    relatedEntityType: "LeaveBalance",
    relatedEntityId: accrual.id,
  });
  return updated;
}

/** Valide d'un coup tous les relevés « à valider » d'un mois, sans correction. */
export async function validateMonth(actor: Actor, month: string): Promise<number> {
  if (!VALIDATE_ACCRUAL_ROLES.includes(actor.role)) throw ApiError.forbidden();
  const pending = await prisma.leaveAccrual.findMany({
    where: { month, status: LeaveAccrualStatus.PROPOSED, userId: { not: actor.userId } },
    select: { id: true },
  });
  for (const accrual of pending) await validateAccrual(actor, accrual.id, {});
  return pending.length;
}

function formatDays(n: number): string {
  const text = String(n).replace(".", ",");
  return `${text} jour${n > 1 ? "s" : ""} ouvrable${n > 1 ? "s" : ""}`;
}

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y!, m! - 1, 1)));
}

export interface LeaveBalanceResult {
  userId: string;
  year: number;
  // Solde : acquis VALIDÉ par la RH (+ corrections) − pris − demandes en attente.
  acquired: number;
  taken: number;
  pending: number;
  remaining: number;
  // Acquis calculé mais pas encore validé par la RH (ne compte pas encore).
  toValidate: number;
  // Période de référence en cours (1er juin → 31 mai) : acquis / plafond.
  period: { start: string; end: string; acquired: number; cap: number };
  // Mois en cours, estimation jusqu'à aujourd'hui (validée le mois suivant).
  currentMonth: { month: string; estimatedDays: number };
  // Congés de l'an dernier (période précédente), à prendre avant `deadline`.
  previousYear: { periodYear: number; acquired: number; used: number; remaining: number; deadline: string };
  // Congés de l'année en cours d'acquisition (pris par anticipation déduits).
  currentYear: { periodYear: number; acquired: number; used: number; remaining: number; usableFrom: string };
  // Reliquat des années antérieures non pris au 31 mai : perdu (sauf report RH).
  expired: { days: number; on: string };
  monthlyRate: number;
}

// Compteur complet d'un salarié — l'employé ne voit que le sien, la RH (et
// direction/superviseur/admin) tous, le chef d'équipe son équipe.
export async function getLeaveBalance(actor: Actor, targetUserId: string, year: number): Promise<LeaveBalanceResult> {
  await assertCanViewBalance(actor, targetUserId);

  const user = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { hireDate: true, leaveAccrualRate: true, leaveAccrualCap: true },
  });
  if (!user) throw ApiError.notFound("Compte introuvable.");
  await generateAccruals({ userIds: [targetUserId] });

  const todayKey = companyDateKey(new Date());
  const thisMonth = todayKey.slice(0, 7);
  const periodYear = referencePeriodStartYear(thisMonth);

  const [accruals, transactions, pendingRequests, monthAbsences] = await Promise.all([
    prisma.leaveAccrual.findMany({ where: { userId: targetUserId }, select: { month: true, days: true, status: true } }),
    prisma.leaveTransaction.findMany({
      where: { userId: targetUserId },
      select: { type: true, days: true, occurredAt: true, absenceId: true, absence: { select: { startDate: true } } },
    }),
    prisma.absence.findMany({
      where: { userId: targetUserId, type: AbsenceType.PAID_LEAVE, status: AbsenceStatus.PENDING },
      select: { startDate: true, endDate: true },
    }),
    prisma.absence.findMany({
      where: { userId: targetUserId, status: AbsenceStatus.APPROVED, endDate: { gte: calendarDay(`${thisMonth}-01`) } },
      select: { type: true, startDate: true, endDate: true },
    }),
  ]);

  const validatedAccruals = accruals.filter((a) => a.status === LeaveAccrualStatus.VALIDATED);
  const validated = validatedAccruals.reduce((s, a) => s + a.days, 0);
  const toValidate = accruals.filter((a) => a.status === LeaveAccrualStatus.PROPOSED).reduce((s, a) => s + a.days, 0);
  const periodAcquired = accruals.filter((a) => referencePeriodStartYear(a.month) === periodYear).reduce((s, a) => s + a.days, 0);

  // Congés pris : LEAVE_TAKEN (négatif) + LEAVE_CANCELLED (positif) d'une
  // même absence se neutralisent exactement — on garde le net par absence,
  // daté du premier jour du congé (pour le décompte N-1 / N).
  const takenByAbsence = new Map<string, LeaveDebit>();
  const credits: LeaveCredit[] = validatedAccruals.map((a) => ({ periodYear: referencePeriodOf(a.month), days: a.days }));
  const debits: LeaveDebit[] = [];
  let adjustments = 0;
  for (const [i, t] of transactions.entries()) {
    if (t.type === LeaveTransactionType.ADJUSTMENT) {
      adjustments += t.days;
      const dateKey = companyDateKey(t.occurredAt);
      // Correction RH positive (reprise de solde, report accordé) : utilisable
      // tout de suite, donc rangée avec les congés de l'an dernier.
      if (t.days > 0) credits.push({ periodYear: referencePeriodOf(dateKey) - 1, days: t.days });
      else debits.push({ dateKey, days: -t.days });
      continue;
    }
    const key = t.absenceId ?? `tx-${i}`;
    const dateKey = t.absence ? t.absence.startDate.toISOString().slice(0, 10) : companyDateKey(t.occurredAt);
    const entry = takenByAbsence.get(key) ?? { dateKey, days: 0 };
    entry.days -= t.days;
    takenByAbsence.set(key, entry);
  }
  const takenDebits = [...takenByAbsence.values()].filter((d) => d.days > 0);
  const taken = takenDebits.reduce((s, d) => s + d.days, 0);
  const pendingDebits = pendingRequests.map((r) => ({ dateKey: r.startDate.toISOString().slice(0, 10), days: countBusinessDays(r.startDate, r.endDate) }));
  const pending = pendingDebits.reduce((s, d) => s + d.days, 0);
  const split = splitLeaveByPeriod(credits, [...debits, ...takenDebits, ...pendingDebits], todayKey);

  const acquired = round2(validated + adjustments);
  const remaining = round2(split.previous.remaining + split.current.remaining);
  const estimate = computeMonthAccrual(user, thisMonth, monthAbsences, todayKey);

  return {
    userId: targetUserId,
    year,
    acquired,
    taken: round2(taken),
    pending,
    remaining,
    toValidate: round2(toValidate),
    period: { start: `${periodYear}-06-01`, end: `${periodYear + 1}-05-31`, acquired: round2(periodAcquired), cap: user.leaveAccrualCap ?? DEFAULT_PERIOD_CAP },
    currentMonth: { month: thisMonth, estimatedDays: estimate?.rawDays ?? 0 },
    previousYear: { ...split.previous, deadline: `${periodYear + 1}-05-31` },
    currentYear: { ...split.current, usableFrom: `${periodYear + 1}-06-01` },
    expired: { days: split.expired, on: `${periodYear}-05-31` },
    monthlyRate: user.leaveAccrualRate ?? env.DEFAULT_LEAVE_ACCRUAL_RATE_PER_MONTH,
  };
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
  // Garde-fous (retour d'audit) : motif obligatoire, montant plausible, et
  // jamais sur son propre compteur (même règle que la validation des relevés).
  if (!input.note?.trim()) throw ApiError.badRequest("Indiquez le motif de la correction (il est communiqué au salarié).");
  if (Math.abs(input.days) > 60) throw ApiError.badRequest("Une correction ne peut pas dépasser 60 jours. Faites-en plusieurs si nécessaire.");
  if (targetUserId === actor.userId) throw ApiError.forbidden("Vous ne pouvez pas corriger votre propre compteur : demandez à une autre personne habilitée.");

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
    relatedEntityType: "LeaveBalance",
    relatedEntityId: transaction.id,
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
