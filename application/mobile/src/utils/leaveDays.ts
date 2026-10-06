// Jours de congés au format français : virgule décimale, deux décimales au
// plus (« 0,08 », « 12,5 », « 25 »). Le nombre brut s'affichait jusqu'ici
// avec un point (« 0.08 »), et `toFixed(1)` en ajoutait un autre (« 0.1 »).
const daysFormatter = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });

export function formatDays(days: number): string {
  return daysFormatter.format(days);
}

/** « 1 jour », « 1,5 jour », « 2 jours » : le pluriel commence à deux. */
export function formatDaysWithUnit(days: number): string {
  return `${formatDays(days)} ${Math.abs(days) >= 2 ? "jours" : "jour"}`;
}
