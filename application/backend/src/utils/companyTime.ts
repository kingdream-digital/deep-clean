// Heure de l'entreprise (France), indépendante du fuseau du serveur.
//
// L'app envoie des heures « murales » (« 08:00 » le « 2026-10-02 ») et affiche
// les instants reçus dans le fuseau du téléphone. Le serveur les interprétait
// jusqu'ici dans SON fuseau : sur un hébergement en heure universelle (le cas
// par défaut d'un conteneur Coolify), une mission saisie pour 8 h s'affichait
// à 10 h sur les téléphones, et les notifications et exports indiquaient des
// heures décalées. Toutes les conversions heure murale <-> instant passent
// désormais par ce module, qui calcule toujours en heure de Paris (heure
// d'été comprise).
//
// Les jours calendaires sans heure (date d'une mission, bornes d'une absence)
// sont, eux, stockés à minuit UTC (`calendarDay`) : c'est ce que l'app lit
// (composants UTC, voir mobile/src/utils/frenchDate.ts::calendarDay), et cela
// ne dépend pas non plus du fuseau du serveur.

export const COMPANY_TIME_ZONE = "Europe/Paris";

const partsFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: COMPANY_TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  weekday: "short",
});

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface WallParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number;
}

function wallParts(instant: Date): WallParts {
  const parts = Object.fromEntries(partsFormatter.formatToParts(instant).map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: WEEKDAYS.indexOf(parts.weekday ?? ""),
  };
}

/** Décalage (ms) de l'heure de Paris par rapport à UTC à cet instant. */
function offsetAt(instant: Date): number {
  const p = wallParts(instant);
  const wallAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return wallAsUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * Instant correspondant à « tel jour, telle heure » à Paris.
 * `time` : "HH:mm", "HH:mm:ss" ou "HH:mm:ss.SSS".
 */
export function companyDateTime(date: string, time: string): Date {
  const [hms = "00:00", ms = "0"] = time.split(".");
  const [h = "0", m = "0", s = "0"] = hms.split(":");
  const [y = 1970, mo = 1, d = 1] = date.split("-").map(Number);
  const wallAsUtc = Date.UTC(y, mo - 1, d, Number(h), Number(m), Number(s), Number(ms.padEnd(3, "0")));
  // Deux passes : le décalage dépend de l'instant lui-même (changement
  // d'heure), la seconde passe corrige le cas où la première tombe de
  // l'autre côté du changement.
  let instant = new Date(wallAsUtc - offsetAt(new Date(wallAsUtc)));
  instant = new Date(wallAsUtc - offsetAt(instant));
  return instant;
}

/** Début (00:00:00.000) d'une journée à Paris. */
export function companyDayStart(date: string): Date {
  return companyDateTime(date, "00:00:00.000");
}

/** Fin (23:59:59.999) d'une journée à Paris. */
export function companyDayEnd(date: string): Date {
  return companyDateTime(date, "23:59:59.999");
}

/** Jour calendaire sans heure : minuit UTC (date d'une mission, d'une absence). */
export function calendarDay(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

/** Fin d'un jour calendaire sans heure (23:59:59.999 UTC). */
export function calendarDayEnd(date: string): Date {
  return new Date(`${date}T23:59:59.999Z`);
}

/** « AAAA-MM-JJ » d'un jour calendaire stocké à minuit UTC. */
export function calendarDayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const pad = (n: number) => String(n).padStart(2, "0");

/** « AAAA-MM-JJ » du jour à Paris pour cet instant. */
export function companyDateKey(instant: Date): string {
  const p = wallParts(instant);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** « HH:mm » à Paris pour cet instant. */
export function companyTimeKey(instant: Date): string {
  const p = wallParts(instant);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

/** « JJ/MM/AAAA » à Paris pour cet instant. */
export function companyDateLabel(instant: Date): string {
  const p = wallParts(instant);
  return `${pad(p.day)}/${pad(p.month)}/${p.year}`;
}

/** « JJ/MM » à Paris pour cet instant. */
export function companyDayMonthLabel(instant: Date): string {
  const p = wallParts(instant);
  return `${pad(p.day)}/${pad(p.month)}`;
}

/** Jour de la semaine à Paris (0 = dimanche … 6 = samedi). */
export function companyWeekday(instant: Date): number {
  return wallParts(instant).weekday;
}

/** Jour calendaire (minuit UTC) d'aujourd'hui à Paris. */
export function companyToday(now: Date = new Date()): Date {
  return calendarDay(companyDateKey(now));
}

/** Ajoute des jours à une date « AAAA-MM-JJ ». */
export function addDaysToKey(date: string, days: number): string {
  const d = calendarDay(date);
  d.setUTCDate(d.getUTCDate() + days);
  return calendarDayKey(d);
}

const longDayFormatter = new Intl.DateTimeFormat("fr-FR", { timeZone: COMPANY_TIME_ZONE, weekday: "long", day: "numeric", month: "long" });

/** « mercredi 7 octobre » (« 1er » pour le premier du mois), à Paris. */
export function companyLongDayLabel(instant: Date): string {
  return longDayFormatter.format(instant).replace(/(^|\s)1(?=\s)/, "$11er");
}
