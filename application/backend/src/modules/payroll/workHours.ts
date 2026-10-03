import { companyOffsetMs } from "../../utils/companyTime";
import { frenchPublicHolidays } from "../../utils/frenchCalendar";
import { NIGHT_END_HOUR, NIGHT_START_HOUR, PAY_RULES, rateOn } from "./payRules";

// Ventilation des heures travaillées selon les majorations légales (voir
// payRules.ts). Calcul minute par minute, en heure de Paris (heure d'été
// comprise) : une vacation 20 h → 2 h un samedi soir est ainsi découpée
// exactement (1 h de jour, 2 h de nuit le samedi, 2 h de nuit le dimanche…).

export interface WorkedPeriod {
  clockIn: Date;
  clockOut: Date;
  /** Intervention exceptionnelle, hors planning habituel : majorations à 100 %. */
  exceptional?: boolean;
}

export type PayCategory = "normal" | "night" | "sunday" | "holiday";

export interface PayBreakdown {
  totalMinutes: number;
  /** Minutes rangées dans la majoration retenue (la plus favorable, sans cumul). */
  minutesByCategory: Record<PayCategory, number>;
  /** Minutes par taux appliqué (« 0.2 » → 120 min à +20 %). */
  minutesByRate: Record<string, number>;
  /** Majoration totale, en minutes équivalentes (Σ minutes × taux). */
  premiumMinutes: number;
  /** Toutes les minutes effectuées entre 21 h et 6 h (base du repos compensateur). */
  nightMinutes: number;
  /** Minutes de nuit par « journée de travail » (la nuit 21 h → 6 h compte pour un seul jour). */
  nightMinutesByWorkDay: Record<string, number>;
}

const holidayCache = new Map<number, Set<string>>();
function isHoliday(dateKey: string): boolean {
  const year = Number(dateKey.slice(0, 4));
  let set = holidayCache.get(year);
  if (!set) {
    set = frenchPublicHolidays(year);
    holidayCache.set(year, set);
  }
  return set.has(dateKey);
}

function emptyBreakdown(): PayBreakdown {
  return {
    totalMinutes: 0,
    minutesByCategory: { normal: 0, night: 0, sunday: 0, holiday: 0 },
    minutesByRate: {},
    premiumMinutes: 0,
    nightMinutes: 0,
    nightMinutesByWorkDay: {},
  };
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function computePayBreakdown(periods: WorkedPeriod[]): PayBreakdown {
  const result = emptyBreakdown();
  for (const period of periods) {
    const start = Math.floor(period.clockIn.getTime() / 60_000) * 60_000;
    const end = Math.floor(period.clockOut.getTime() / 60_000) * 60_000;
    let offset = companyOffsetMs(new Date(start));
    for (let t = start; t < end; t += 60_000) {
      // Le décalage ne change qu'à l'heure pile (passage heure d'été/hiver).
      if (t % 3_600_000 === 0) offset = companyOffsetMs(new Date(t));
      const local = new Date(t + offset);
      const hour = local.getUTCHours();
      const dateKey = `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}`;
      const isNight = hour >= NIGHT_START_HOUR || hour < NIGHT_END_HOUR;
      const exceptional = !!period.exceptional;

      let category: PayCategory = "normal";
      let rate = 0;
      const consider = (c: PayCategory, r: number) => {
        if (r > rate) {
          rate = r;
          category = c;
        }
      };
      if (isNight) consider("night", rateOn(exceptional ? PAY_RULES.night.exceptional : PAY_RULES.night.regular, dateKey));
      if (local.getUTCDay() === 0) consider("sunday", rateOn(exceptional ? PAY_RULES.sunday.exceptional : PAY_RULES.sunday.regular, dateKey));
      if (isHoliday(dateKey)) {
        const full = exceptional || (PAY_RULES.holiday.alwaysFullDates as readonly string[]).includes(dateKey.slice(5));
        consider("holiday", rateOn(full ? PAY_RULES.holiday.exceptional : PAY_RULES.holiday.regular, dateKey));
      }

      result.totalMinutes += 1;
      result.minutesByCategory[category] += 1;
      const key = String(rate);
      result.minutesByRate[key] = (result.minutesByRate[key] ?? 0) + 1;
      result.premiumMinutes += rate;
      if (isNight) {
        result.nightMinutes += 1;
        // Journée de travail : la nuit de 21 h à 6 h est rattachée au jour où elle commence.
        const workDay = new Date(t + offset - NIGHT_END_HOUR * 3_600_000);
        const workDayKey = `${workDay.getUTCFullYear()}-${pad(workDay.getUTCMonth() + 1)}-${pad(workDay.getUTCDate())}`;
        result.nightMinutesByWorkDay[workDayKey] = (result.nightMinutesByWorkDay[workDayKey] ?? 0) + 1;
      }
    }
  }
  result.premiumMinutes = Math.round(result.premiumMinutes * 100) / 100;
  return result;
}

/** Lundi (« AAAA-MM-JJ ») de la semaine d'un jour. */
function mondayKey(dateKey: string): string {
  const d = new Date(`${dateKey}T00:00:00Z`);
  const shift = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - shift);
  return d.toISOString().slice(0, 10);
}

/**
 * Statut de travailleur de nuit sur une période (un mois en pratique) :
 * au moins 2 jours par semaine avec 3 h de nuit, sur la majorité des
 * semaines travaillées de la période — ou 270 h de nuit sur 12 mois.
 */
export function isNightWorker(
  periodBreakdown: Pick<PayBreakdown, "nightMinutesByWorkDay">,
  workedDays: string[],
  nightMinutesLast12Months: number
): boolean {
  const rules = PAY_RULES.nightWorker;
  if (nightMinutesLast12Months >= rules.minNightHoursPer12Months * 60) return true;
  const weeks = new Map<string, number>();
  for (const day of workedDays) weeks.set(mondayKey(day), weeks.get(mondayKey(day)) ?? 0);
  for (const [day, minutes] of Object.entries(periodBreakdown.nightMinutesByWorkDay)) {
    if (minutes >= rules.minNightMinutesPerDay) {
      const w = mondayKey(day);
      weeks.set(w, (weeks.get(w) ?? 0) + 1);
    }
  }
  if (weeks.size === 0) return false;
  const qualifying = [...weeks.values()].filter((n) => n >= rules.minDaysPerWeek).length;
  return qualifying > 0 && qualifying * 2 >= weeks.size;
}

/** Repos compensateur acquis (minutes) : 2 % des minutes de nuit du mois. */
export function compensatoryRestMinutes(nightMinutes: number): number {
  return Math.round(nightMinutes * PAY_RULES.nightWorker.compensatoryRestRatio);
}
