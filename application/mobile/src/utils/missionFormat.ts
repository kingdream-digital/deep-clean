import type { Mission } from "../api/missions.api";

const dayFormatter = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" });
const timeFormatter = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });

export function formatMissionDay(dateIso: string): string {
  const label = dayFormatter.format(new Date(dateIso));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function formatMissionTimeRange(startIso: string, endIso: string): string {
  return `${timeFormatter.format(new Date(startIso))} – ${timeFormatter.format(new Date(endIso))}`;
}

// Extrait AAAA-MM-JJ à partir des composants LOCAUX d'une date — jamais via
// toISOString()/slice, qui convertit en UTC et peut faire glisser le jour
// calendaire d'un jour selon le fuseau horaire de l'appareil.
export function toLocalDateKey(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function dateKey(dateIso: string): string {
  return toLocalDateKey(new Date(dateIso));
}

export function todayKey(): string {
  return toLocalDateKey(new Date());
}

export interface MissionGroup {
  key: string;
  label: string;
  missions: Mission[];
}

export function groupMissionsByDate(missions: Mission[]): MissionGroup[] {
  const groups = new Map<string, Mission[]>();
  for (const mission of missions) {
    const key = dateKey(mission.date);
    const list = groups.get(key) ?? [];
    list.push(mission);
    groups.set(key, list);
  }
  return Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, list]) => ({ key, label: formatMissionDay(list[0].date), missions: list }));
}

// --- Vue "semaine" du planning (lundi → dimanche) ---------------------------

export const WEEKDAY_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

/** Lundi de la semaine contenant `date`, à minuit local. */
export function mondayOf(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0 = dimanche .. 6 = samedi
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date: Date, amount: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + amount);
  return d;
}

export function isSameLocalDay(a: Date, b: Date): boolean {
  return toLocalDateKey(a) === toLocalDateKey(b);
}

const weekRangeSameMonthFormatter = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long" });
const weekRangeShortFormatter = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });

/** Ex: "22 – 28 septembre" ou "29 sept. – 5 oct." si la semaine chevauche deux mois. */
export function formatWeekRange(monday: Date, sunday: Date): string {
  if (monday.getMonth() === sunday.getMonth()) {
    return `${monday.getDate()} – ${weekRangeSameMonthFormatter.format(sunday)}`;
  }
  return `${weekRangeShortFormatter.format(monday)} – ${weekRangeShortFormatter.format(sunday)}`;
}
