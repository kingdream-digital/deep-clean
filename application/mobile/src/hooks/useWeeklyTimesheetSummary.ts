import { useCallback, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { useAuth } from "../auth/AuthContext";
import { listTimeEntries } from "../api/timesheets.api";
import { addDays, mondayOf, toLocalDateKey } from "../utils/missionFormat";
import { computeWeekSummary } from "../utils/timesheetSummary";
import type { WeekSummary } from "../utils/timesheetSummary";

const EMPTY: WeekSummary = { validatedMinutes: 0, pendingMinutes: 0, totalMinutes: 0 };

// Semaine en cours (lundi → dimanche), toujours propre à l'utilisateur
// connecté (`userId`) — même pour un rôle qui a par défaut une vue plus
// large (chef d'équipe, superviseur...), ce résumé ne concerne que SES
// propres heures, remises à 0 chaque nouvelle semaine par construction
// (filtre `from`/`to` recalculé à chaque lundi).
export function useWeeklyTimesheetSummary() {
  const { user } = useAuth();
  const [summary, setSummary] = useState<WeekSummary>(EMPTY);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  const load = useCallback(async () => {
    if (!user) return;
    try {
      setState("loading");
      const weekStart = mondayOf(new Date());
      const weekEnd = addDays(weekStart, 6);
      const res = await listTimeEntries({
        userId: user.id,
        from: toLocalDateKey(weekStart),
        to: toLocalDateKey(weekEnd),
        pageSize: 100,
      });
      setSummary(computeWeekSummary(res.items));
      setState("ready");
    } catch {
      setState("error");
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  return { summary, state, reload: load };
}
