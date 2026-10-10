import { dayKey, formatDayLong, formatDayShort, formatEuro, formatRelativeDay, timeKey } from "@aussitot/shared";

export { formatEuro, formatDayLong, formatDayShort, formatRelativeDay };

/** « à l'instant », « il y a 5 min », « hier », « 3 oct. ». */
export function timeAgo(iso: string, timezone = "Europe/Paris"): string {
  const date = new Date(iso);
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 60) return "à l'instant";
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`;
  if (diff < 6 * 3600) return `il y a ${Math.floor(diff / 3600)} h`;
  const today = dayKey(new Date(), timezone);
  const d = dayKey(date, timezone);
  const rel = formatRelativeDay(d, today);
  if (rel === "Aujourd'hui" || rel === "Hier") return rel.toLowerCase();
  return formatDayShort(d, { year: d.slice(0, 4) !== today.slice(0, 4) });
}

export function greeting(now: Date = new Date()): string {
  const h = now.getHours();
  if (h < 5) return "Bonsoir";
  if (h < 18) return "Bonjour";
  return "Bonsoir";
}

export function fullName(p: { firstName: string; lastName: string }): string {
  return `${p.firstName} ${p.lastName}`;
}

/** Instant ISO → « 10 oct. à 08:12 » (fuseau de l'entreprise). */
export function formatInstant(iso: string, timezone = "Europe/Paris"): string {
  const date = new Date(iso);
  const day = dayKey(date, timezone);
  const today = dayKey(new Date(), timezone);
  const label = day === today ? "aujourd'hui" : formatDayShort(day, { year: day.slice(0, 4) !== today.slice(0, 4) });
  return `${label} à ${timeKey(date, timezone)}`;
}

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
