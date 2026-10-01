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
