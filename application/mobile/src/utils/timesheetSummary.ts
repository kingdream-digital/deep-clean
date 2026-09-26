import type { TimeEntry } from "../api/timesheets.api";

export interface WeekSummary {
  validatedMinutes: number;
  pendingMinutes: number;
  totalMinutes: number;
}

// Un pointage encore ouvert (pas de clockOut) n'est pas comptabilisé dans le
// total de la semaine — seules les sessions terminées comptent, qu'elles
// soient déjà validées ou encore en attente. Les pointages refusés sont
// volontairement exclus du total : ils ne représentent pas des heures
// retenues.
export function computeWeekSummary(entries: TimeEntry[]): WeekSummary {
  let validatedMinutes = 0;
  let pendingMinutes = 0;

  for (const entry of entries) {
    if (!entry.clockOut) continue;
    const minutes = Math.max(
      0,
      Math.round((new Date(entry.clockOut).getTime() - new Date(entry.clockIn).getTime()) / 60000)
    );
    if (entry.status === "VALIDATED") validatedMinutes += minutes;
    else if (entry.status === "PENDING") pendingMinutes += minutes;
  }

  return { validatedMinutes, pendingMinutes, totalMinutes: validatedMinutes + pendingMinutes };
}

export function formatHoursMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${String(m).padStart(2, "0")}`;
}
