// En français, le premier jour du mois s'écrit « 1er » : « jeudi 1er octobre »,
// « du 1er au 7 juin ». Intl.DateTimeFormat ne le fait pas et affiche
// « jeudi 1 octobre » — une faute visible partout dans l'app le 1er de chaque
// mois. Toute date affichée avec le jour du mois passe donc par
// frenchDateFormat() plutôt que par `new Intl.DateTimeFormat("fr-FR", …)`.

/** « 1er » pour le premier du mois, le nombre seul sinon. */
export function dayOfMonthLabel(day: number): string {
  return day === 1 ? "1er" : String(day);
}

/**
 * Remplace le jour « 1 » d'une date déjà formatée par « 1er ». Ne touche qu'un
 * « 1 » isolé suivi d'un espace (« 1 octobre », « jeu. 1 oct. ») : jamais 11,
 * 21, 31, une année ni une heure.
 */
export function withFirstOfMonth(label: string): string {
  return label.replace(/(^|\s)1(?=\s)/, "$11er");
}

/** Équivalent de `new Intl.DateTimeFormat("fr-FR", options)`, avec le « 1er ». */
export function frenchDateFormat(options: Intl.DateTimeFormatOptions): { format: (date: Date | number) => string } {
  const formatter = new Intl.DateTimeFormat("fr-FR", options);
  return { format: (date) => withFirstOfMonth(formatter.format(date)) };
}

const dayMonthYear = frenchDateFormat({ day: "numeric", month: "short", year: "numeric" });
const dayMonth = frenchDateFormat({ day: "numeric", month: "short" });

/**
 * Période lisible d'un coup d'œil, sans répéter ce qui est commun aux deux
 * bornes : « 19 – 23 oct. 2026 », « 28 sept. – 4 oct. 2026 », « 1er oct. 2026 »
 * pour un seul jour. Remplace « 19 oct. 2026 → 23 oct. 2026 », qui se coupait
 * en plein milieu sur un téléphone.
 */
export function formatDateRange(start: Date, end: Date): string {
  const sameDay = start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth() && start.getDate() === end.getDate();
  if (sameDay) return dayMonthYear.format(start);
  if (start.getFullYear() !== end.getFullYear()) return `${dayMonthYear.format(start)} – ${dayMonthYear.format(end)}`;
  if (start.getMonth() !== end.getMonth()) return `${dayMonth.format(start)} – ${dayMonthYear.format(end)}`;
  return `${dayOfMonthLabel(start.getDate())} – ${dayMonthYear.format(end)}`;
}

/**
 * Jour calendaire d'une date d'absence. Le serveur enregistre une absence du
 * 19 au 23 octobre comme « 19 oct. 00:00 » → « 23 oct. 23:59:59 », en heure
 * universelle : lue à l'heure de Paris, la fin tombait le 24 à 1 h 59, et
 * l'absence s'affichait jusqu'au 24. On lit donc le jour tel qu'il a été
 * enregistré, quel que soit le fuseau du téléphone.
 */
export function calendarDay(iso: string): Date {
  const d = new Date(iso);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Période d'une absence (dates renvoyées par le serveur), voir formatDateRange. */
export function formatAbsencePeriod(startIso: string, endIso: string): string {
  return formatDateRange(calendarDay(startIso), calendarDay(endIso));
}
