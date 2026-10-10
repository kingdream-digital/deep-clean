import { addDays, dayKey, timeKey, zonedDateTime } from "@aussitot/shared";

/** Jour courant dans le fuseau de l'entreprise (« AAAA-MM-JJ »). */
export function todayIn(timezone: string, now: Date = new Date()): string {
  return dayKey(now, timezone);
}

/** Bornes [début, fin[ d'une période de jours, en instants, dans le fuseau de l'entreprise. */
export function dayRange(from: string, to: string, timezone: string): { start: Date; end: Date } {
  return { start: zonedDateTime(from, "00:00", timezone), end: zonedDateTime(addDays(to, 1), "00:00", timezone) };
}

export function monthStart(day: string): string {
  return `${day.slice(0, 7)}-01`;
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export { addDays, dayKey, timeKey, zonedDateTime };
