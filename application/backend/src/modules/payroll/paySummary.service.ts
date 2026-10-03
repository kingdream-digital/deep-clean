import { AbsenceStatus, AbsenceType, NightWorkerStatus, Role, TimeEntryStatus } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { ApiError } from "../../utils/ApiError";
import { addDaysToKey, companyDateKey, companyDayStart } from "../../utils/companyTime";
import { countWorkableDays } from "../../utils/frenchCalendar";
import { canViewUserHours, exceptionalEntryIds } from "../timesheets/timesheets.service";
import { PAY_RULES } from "./payRules";
import { compensatoryRestMinutes, computePayBreakdown, isNightWorker } from "./workHours";
import type { PayBreakdown, PayCategory } from "./workHours";

// Heures majorées du mois d'une personne (retour explicite du client :
// « différencier heures de dimanche, de nuit, de jour férié ; majoration de
// nuit ; jour de repos pour le personnel de nuit au taux légal »).
//
// Tout est recalculé ici à partir des pointages (jamais saisi à la main) :
// ventilation par majoration, statut de travailleur de nuit, et repos
// compensateur acquis / pris / restant sur l'année civile.

interface Actor {
  userId: string;
  role: Role;
}

/** Une journée de repos compensateur = 7 h (35 h sur 5 jours). */
export const REST_DAY_MINUTES = 7 * 60;

export interface MonthPayTotals {
  countedMinutes: number;
  pendingMinutes: number;
  minutesByCategory: Record<PayCategory, number>;
  premiumMinutes: number;
  nightMinutes: number;
  byRate: { rate: number; minutes: number }[];
}

export interface PaySummary {
  month: string;
  user: { id: string; firstName: string; lastName: string; nightWorkerStatus: NightWorkerStatus };
  totals: MonthPayTotals;
  nightWorker: { isNightWorker: boolean; source: NightWorkerStatus; reason: string };
  compensatoryRest: {
    monthAcquiredMinutes: number;
    yearAcquiredMinutes: number;
    yearTakenMinutes: number;
    balanceMinutes: number;
    restDayMinutes: number;
  };
}

function monthStartKey(month: string): string {
  return `${month}-01`;
}

function nextMonth(month: string): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

function addMonths(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const index = y * 12 + (m - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

function emptyMonth(): PayBreakdown & { pendingMinutes: number; workedDays: Set<string> } {
  return {
    totalMinutes: 0,
    minutesByCategory: { normal: 0, night: 0, sunday: 0, holiday: 0 },
    minutesByRate: {},
    premiumMinutes: 0,
    nightMinutes: 0,
    nightMinutesByWorkDay: {},
    pendingMinutes: 0,
    workedDays: new Set(),
  };
}

export async function getPaySummary(actor: Actor, userId: string, month: string): Promise<PaySummary> {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw ApiError.badRequest("Mois invalide (format AAAA-MM).");
  if (!(await canViewUserHours(actor, userId))) throw ApiError.notFound("Personne introuvable.");
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, firstName: true, lastName: true, nightWorkerStatus: true } });
  if (!user) throw ApiError.notFound("Personne introuvable.");

  // Données nécessaires : l'année civile en cours (repos compensateur) et,
  // pour chacun de ses mois, les 12 mois glissants précédents (seuil de
  // 270 h de nuit) — soit au plus 23 mois de pointages.
  const year = month.slice(0, 4);
  const firstMonth = addMonths(`${year}-01`, -11);
  const end = companyDayStart(monthStartKey(nextMonth(month)));
  const entries = await prisma.timeEntry.findMany({
    where: { userId, clockOut: { not: null }, status: { not: TimeEntryStatus.REJECTED }, clockIn: { gte: companyDayStart(monthStartKey(firstMonth)), lt: end } },
    select: { id: true, userId: true, clockIn: true, clockOut: true, status: true },
    orderBy: { clockIn: "asc" },
  });
  const exceptional = await exceptionalEntryIds(entries);

  const months = new Map<string, ReturnType<typeof emptyMonth>>();
  for (const entry of entries) {
    const key = companyDateKey(entry.clockIn).slice(0, 7);
    const bucket = months.get(key) ?? emptyMonth();
    months.set(key, bucket);
    const b = computePayBreakdown([{ clockIn: entry.clockIn, clockOut: entry.clockOut!, exceptional: exceptional.has(entry.id) }]);
    bucket.totalMinutes += b.totalMinutes;
    if (entry.status === TimeEntryStatus.PENDING) bucket.pendingMinutes += b.totalMinutes;
    for (const c of Object.keys(b.minutesByCategory) as PayCategory[]) bucket.minutesByCategory[c] += b.minutesByCategory[c];
    for (const [rate, minutes] of Object.entries(b.minutesByRate)) bucket.minutesByRate[rate] = (bucket.minutesByRate[rate] ?? 0) + minutes;
    bucket.premiumMinutes += b.premiumMinutes;
    bucket.nightMinutes += b.nightMinutes;
    for (const [day, minutes] of Object.entries(b.nightMinutesByWorkDay)) bucket.nightMinutesByWorkDay[day] = (bucket.nightMinutesByWorkDay[day] ?? 0) + minutes;
    bucket.workedDays.add(companyDateKey(entry.clockIn));
  }

  const nightStatusOf = (m: string): { isNightWorker: boolean; reason: string } => {
    if (user.nightWorkerStatus === NightWorkerStatus.YES) return { isNightWorker: true, reason: "Déclaré travailleur de nuit par la RH." };
    if (user.nightWorkerStatus === NightWorkerStatus.NO) return { isNightWorker: false, reason: "Déclaré non travailleur de nuit par la RH." };
    const bucket = months.get(m) ?? emptyMonth();
    let last12 = 0;
    for (let i = 0; i < 12; i++) last12 += months.get(addMonths(m, -i))?.nightMinutes ?? 0;
    const yes = isNightWorker(bucket, [...bucket.workedDays], last12);
    const rules = PAY_RULES.nightWorker;
    return {
      isNightWorker: yes,
      reason: yes
        ? last12 >= rules.minNightHoursPer12Months * 60
          ? `Plus de ${rules.minNightHoursPer12Months} h de nuit sur 12 mois.`
          : `Au moins ${rules.minNightMinutesPerDay / 60} h de nuit, ${rules.minDaysPerWeek} fois par semaine.`
        : `Moins de ${rules.minNightMinutesPerDay / 60} h de nuit ${rules.minDaysPerWeek} fois par semaine, et moins de ${rules.minNightHoursPer12Months} h sur 12 mois.`,
    };
  };

  // Repos compensateur : acquis chaque mois où la personne est travailleur
  // de nuit (2 % des heures faites entre 21 h et 6 h), de janvier au mois choisi.
  let yearAcquired = 0;
  let monthAcquired = 0;
  for (let m = `${year}-01`; m <= month; m = nextMonth(m)) {
    const acquired = nightStatusOf(m).isNightWorker ? compensatoryRestMinutes(months.get(m)?.nightMinutes ?? 0) : 0;
    yearAcquired += acquired;
    if (m === month) monthAcquired = acquired;
  }

  // Repos pris : absences « repos compensateur » approuvées dans l'année,
  // jusqu'à la fin du mois choisi.
  const lastDay = addDaysToKey(monthStartKey(nextMonth(month)), -1);
  const rests = await prisma.absence.findMany({
    where: { userId, type: AbsenceType.COMPENSATORY_REST, status: AbsenceStatus.APPROVED, startDate: { lte: new Date(`${lastDay}T00:00:00Z`) }, endDate: { gte: new Date(`${year}-01-01T00:00:00Z`) } },
    select: { startDate: true, endDate: true },
  });
  const yearFirst = new Date(`${year}-01-01T00:00:00Z`);
  const yearLast = new Date(`${lastDay}T00:00:00Z`);
  const takenDays = rests.reduce((sum, r) => {
    const from = r.startDate < yearFirst ? yearFirst : r.startDate;
    const to = r.endDate > yearLast ? yearLast : r.endDate;
    return from <= to ? sum + countWorkableDays(from, to) : sum;
  }, 0);
  const yearTaken = takenDays * REST_DAY_MINUTES;

  const bucket = months.get(month) ?? emptyMonth();
  const status = nightStatusOf(month);
  return {
    month,
    user,
    totals: {
      countedMinutes: bucket.totalMinutes,
      pendingMinutes: bucket.pendingMinutes,
      minutesByCategory: bucket.minutesByCategory,
      premiumMinutes: Math.round(bucket.premiumMinutes * 100) / 100,
      nightMinutes: bucket.nightMinutes,
      byRate: Object.entries(bucket.minutesByRate)
        .map(([rate, minutes]) => ({ rate: Number(rate), minutes }))
        .filter((r) => r.rate > 0)
        .sort((a, b) => a.rate - b.rate),
    },
    nightWorker: { ...status, source: user.nightWorkerStatus },
    compensatoryRest: {
      monthAcquiredMinutes: monthAcquired,
      yearAcquiredMinutes: yearAcquired,
      yearTakenMinutes: yearTaken,
      balanceMinutes: yearAcquired - yearTaken,
      restDayMinutes: REST_DAY_MINUTES,
    },
  };
}
