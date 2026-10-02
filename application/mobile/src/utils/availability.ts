import type { Mission } from "../api/missions.api";
import type { Availability } from "../components/EmployeePickerModal";

const timeFmt = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });

function formatHours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, "0")}`;
}

/**
 * Disponibilité de chaque personne pour un créneau donné (retour explicite
 * du client : ne jamais prévoir quelqu'un qui est déjà ailleurs) :
 *   - absente ce jour-là, ou déjà sur une mission qui se recouvre → bloquant ;
 *   - autre mission plus tôt / plus tard ce jour-là → information ;
 *   - heures restantes sur la semaine face au contrat (si renseigné).
 * Partagé par le formulaire de mission et l'écran de réaffectation.
 */
export function computeAvailability(params: {
  start: Date;
  end: Date;
  dayMissions: Mission[];
  weekMissions: Mission[];
  absentIds: Set<string>;
  people: Array<{ id: string; weeklyHours?: number | null }>;
}): Record<string, Availability> {
  const minutesOf = (d: Date) => d.getHours() * 60 + d.getMinutes();
  const wantedStart = minutesOf(params.start);
  const wantedEnd = minutesOf(params.end);
  const result: Record<string, Availability> = {};
  for (const id of params.absentIds) result[id] = { blocking: true, label: "Absent ce jour-là (congé ou absence approuvée)" };
  for (const mission of params.dayMissions) {
    const start = new Date(mission.startTime);
    const end = new Date(mission.endTime);
    const overlaps = minutesOf(start) < wantedEnd && minutesOf(end) > wantedStart;
    const where = `${mission.site.name}, ${timeFmt.format(start)}–${timeFmt.format(end)}`;
    for (const assignment of mission.assignments) {
      const current = result[assignment.userId];
      if (current?.blocking) continue;
      result[assignment.userId] = overlaps
        ? { blocking: true, label: `Déjà prise : ${where}` }
        : { blocking: false, label: current ? `${current.label} · ${where}` : `Aussi ce jour-là : ${where}` };
    }
  }
  const missionMinutes = Math.max(0, wantedEnd - wantedStart);
  const plannedByUser = new Map<string, number>();
  for (const mission of params.weekMissions) {
    const minutes = (new Date(mission.endTime).getTime() - new Date(mission.startTime).getTime()) / 60000;
    for (const a of mission.assignments) plannedByUser.set(a.userId, (plannedByUser.get(a.userId) ?? 0) + minutes);
  }
  for (const person of params.people) {
    if (person.weeklyHours == null) continue;
    const remaining = person.weeklyHours * 60 - (plannedByUser.get(person.id) ?? 0);
    const after = remaining - missionMinutes;
    const hours =
      remaining <= 0
        ? { text: `Semaine déjà complète (${formatHours(person.weeklyHours * 60)})`, over: true }
        : after < 0
          ? { text: `Reste ${formatHours(remaining)} cette semaine : cette mission dépasserait de ${formatHours(-after)}`, over: true }
          : { text: `Reste ${formatHours(remaining)} cette semaine sur ${formatHours(person.weeklyHours * 60)}`, over: false };
    result[person.id] = { ...(result[person.id] ?? { blocking: false, label: "" }), hours };
  }
  return result;
}

/** Lundi et dimanche (« AAAA-MM-JJ », locaux) de la semaine d'une date. */
export function weekBoundsKeys(date: Date, toKey: (d: Date) => string): [string, string] {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate() - ((date.getDay() + 6) % 7));
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
  return [toKey(monday), toKey(sunday)];
}
