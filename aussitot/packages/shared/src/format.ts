/**
 * Mise en forme française (montants, quantités, dates) — partagée par l'API
 * (PDF, emails, réponses de l'assistant) et l'app. Les dates sont toujours
 * affichées dans le fuseau de l'ENTREPRISE (réglage par entreprise, Paris par
 * défaut), jamais dans celui du serveur : leçon de Deep Clean, où un serveur
 * en heure universelle décalait toutes les missions de deux heures.
 */

export const DEFAULT_TIME_ZONE = "Europe/Paris";

const euroFormatter = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const numberFormatter = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 3 });

/** Remplace les espaces insécables fines (absentes des polices PDF standard) par des espaces simples. */
export function plainSpaces(text: string): string {
  return text.replace(/[  ]/g, " ");
}

/** 125050 → « 1 250,50 € ». */
export function formatEuro(cents: number, options: { plain?: boolean } = {}): string {
  const text = euroFormatter.format(cents / 100);
  return options.plain ? plainSpaces(text) : text;
}

/** 2.5 → « 2,5 ». */
export function formatQuantity(quantity: number, options: { plain?: boolean } = {}): string {
  const text = numberFormatter.format(quantity);
  return options.plain ? plainSpaces(text) : text;
}

/** 2000 → « 20 % », 550 → « 5,5 % ». */
export function formatVatRate(bps: number): string {
  return `${numberFormatter.format(bps / 100)} %`;
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

interface WallParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const partsFormatters = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = partsFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    partsFormatters.set(timeZone, formatter);
  }
  return formatter;
}

export function wallParts(instant: Date, timeZone: string = DEFAULT_TIME_ZONE): WallParts {
  const parts: Record<string, string> = {};
  for (const part of partsFormatter(timeZone).formatToParts(instant)) parts[part.type] = part.value;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

function offsetMs(instant: Date, timeZone: string): number {
  const p = wallParts(instant, timeZone);
  const wallAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return wallAsUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** « AAAA-MM-JJ » du jour, dans le fuseau donné. */
export function dayKey(instant: Date, timeZone: string = DEFAULT_TIME_ZONE): string {
  const p = wallParts(instant, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** « HH:mm » dans le fuseau donné. */
export function timeKey(instant: Date, timeZone: string = DEFAULT_TIME_ZONE): string {
  const p = wallParts(instant, timeZone);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

/**
 * Instant correspondant à « tel jour à telle heure » dans le fuseau donné
 * (gère les changements d'heure : deux passes de correction du décalage).
 */
export function zonedDateTime(date: string, time: string, timeZone: string = DEFAULT_TIME_ZONE): Date {
  const [y = 1970, mo = 1, d = 1] = date.split("-").map(Number);
  const [h = 0, mi = 0, s = 0] = time.split(":").map(Number);
  const wallAsUtc = Date.UTC(y, mo - 1, d, h, mi, s);
  let instant = new Date(wallAsUtc - offsetMs(new Date(wallAsUtc), timeZone));
  instant = new Date(wallAsUtc - offsetMs(instant, timeZone));
  return instant;
}

/** Ajoute n jours à une clé « AAAA-MM-JJ ». */
export function addDays(date: string, days: number): string {
  const [y = 1970, m = 1, d = 1] = date.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return next.toISOString().slice(0, 10);
}

/** Jour de la semaine (0 = dimanche) d'une clé « AAAA-MM-JJ ». */
export function weekdayOf(date: string): number {
  const [y = 1970, m = 1, d = 1] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Lundi de la semaine contenant ce jour. */
export function startOfWeek(date: string): string {
  const weekday = weekdayOf(date);
  return addDays(date, weekday === 0 ? -6 : 1 - weekday);
}

const WEEKDAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const MONTHS_SHORT = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

function dayNumber(day: number): string {
  return day === 1 ? "1er" : String(day);
}

/** « jeudi 1er octobre 2026 » (ou sans l'année / le jour de semaine). */
export function formatDayLong(date: string, options: { weekday?: boolean; year?: boolean } = {}): string {
  const [y = 1970, m = 1, d = 1] = date.split("-").map(Number);
  const parts = [] as string[];
  if (options.weekday !== false) parts.push(WEEKDAYS[weekdayOf(date)]!);
  parts.push(dayNumber(d), MONTHS[m - 1]!);
  if (options.year !== false) parts.push(String(y));
  return parts.join(" ");
}

/** « 1er oct. 2026 ». */
export function formatDayShort(date: string, options: { year?: boolean } = {}): string {
  const [y = 1970, m = 1, d = 1] = date.split("-").map(Number);
  return [dayNumber(d), MONTHS_SHORT[m - 1], options.year === false ? undefined : String(y)].filter(Boolean).join(" ");
}

/** « Aujourd'hui », « Demain », « Hier » ou « jeudi 1er octobre ». */
export function formatRelativeDay(date: string, today: string): string {
  if (date === today) return "Aujourd'hui";
  if (date === addDays(today, 1)) return "Demain";
  if (date === addDays(today, -1)) return "Hier";
  const sameYear = date.slice(0, 4) === today.slice(0, 4);
  const label = formatDayLong(date, { year: !sameYear });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** « 8 h 30 » pour la lecture vocale, « 08:30 » sinon. */
export function formatTimeSpoken(time: string): string {
  const [h = "0", m = "00"] = time.split(":");
  return m === "00" ? `${Number(h)} h` : `${Number(h)} h ${m}`;
}

/** « octobre 2026 » pour une clé « AAAA-MM ». */
export function formatMonth(month: string): string {
  const [y = 1970, m = 1] = month.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone });
    return true;
  } catch {
    return false;
  }
}
