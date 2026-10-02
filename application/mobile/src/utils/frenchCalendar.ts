// Copie conforme de backend/src/utils/frenchCalendar.ts (aperçu instantané
// dans le formulaire d'absence ; la valeur qui compte reste celle du serveur).
//
// Jours fériés légaux en France métropolitaine (Code du travail, L3133-1) et
// décompte des congés payés en jours OUVRABLES (lundi → samedi, hors
// dimanches et jours fériés) : unité de la règle légale de base, 2,5 jours
// ouvrables acquis par mois, 30 par an.
//
// Toutes les dates sont des jours calendaires « AAAA-MM-JJ » (ou des Date à
// minuit UTC) : aucun fuseau horaire n'intervient.

/** Dimanche de Pâques (algorithme de Meeus/Jones/Butcher), en UTC. */
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

const holidayCache = new Map<number, Set<string>>();

/** Les 11 jours fériés légaux de l'année, « AAAA-MM-JJ ». */
export function frenchPublicHolidays(year: number): Set<string> {
  const cached = holidayCache.get(year);
  if (cached) return cached;
  const key = (d: Date) => d.toISOString().slice(0, 10);
  const shift = (d: Date, days: number) => new Date(d.getTime() + days * 86_400_000);
  const easter = easterSunday(year);
  const set = new Set<string>([
    `${year}-01-01`, // Jour de l'an
    key(shift(easter, 1)), // Lundi de Pâques
    `${year}-05-01`, // Fête du travail
    `${year}-05-08`, // Victoire 1945
    key(shift(easter, 39)), // Ascension
    key(shift(easter, 50)), // Lundi de Pentecôte
    `${year}-07-14`, // Fête nationale
    `${year}-08-15`, // Assomption
    `${year}-11-01`, // Toussaint
    `${year}-11-11`, // Armistice
    `${year}-12-25`, // Noël
  ]);
  holidayCache.set(year, set);
  return set;
}

export function isFrenchPublicHoliday(dateKey: string): boolean {
  return frenchPublicHolidays(Number(dateKey.slice(0, 4))).has(dateKey);
}

/**
 * Jours ouvrables entre deux jours calendaires inclus : du lundi au samedi,
 * hors jours fériés. C'est ce qui est décompté du solde pour un congé payé.
 */
export function countWorkableDays(startDate: Date, endDate: Date): number {
  let count = 0;
  const cursor = new Date(startDate);
  cursor.setUTCHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setUTCHours(0, 0, 0, 0);
  while (cursor <= end) {
    if (cursor.getUTCDay() !== 0 && !isFrenchPublicHoliday(cursor.toISOString().slice(0, 10))) count++;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}
