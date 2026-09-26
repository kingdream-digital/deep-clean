import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import NetInfo from "@react-native-community/netinfo";
import { useSharedValue, withSpring } from "react-native-reanimated";
import { clockIn, clockOut, getMyTimesheetStatus } from "../api/timesheets.api";
import type { TimeEntry } from "../api/timesheets.api";
import { extractErrorMessage } from "../api/client";
import { enqueueAction, getQueue } from "../offline/queue";

export function elapsedMinutes(clockInAt: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(clockInAt).getTime()) / 60000));
}

export function elapsedLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h} h ${String(m).padStart(2, "0")}` : `${m} min`;
}

// Journée "pleine" de référence pour donner un sens au remplissage de
// l'anneau — purement visuel, aucune notion d'horaire contractuel réel n'est
// vérifiée ici (ça reste du ressort du planning/des missions).
export const REFERENCE_WORKDAY_MINUTES = 8 * 60;

// Logique de pointage (entrée/sortie, y compris hors ligne) partagée entre le
// widget du tableau de bord et l'écran Pointage dédié — une seule source de
// vérité pour cet état, plutôt que deux copies qui pourraient diverger.
export function useClockStatus() {
  const [openEntry, setOpenEntry] = useState<TimeEntry | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<{ type: "CLOCK_IN" | "CLOCK_OUT"; at: string } | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const successScale = useSharedValue(0.7);
  const successTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await getMyTimesheetStatus();
      setOpenEntry(res.openEntry);
      setState("ready");
    } catch {
      setState("error");
    }
    const queue = await getQueue();
    const lastTimesheetAction = [...queue].reverse().find((a) => a.type === "CLOCK_IN" || a.type === "CLOCK_OUT");
    setPendingAction(
      lastTimesheetAction ? { type: lastTimesheetAction.type as "CLOCK_IN" | "CLOCK_OUT", at: lastTimesheetAction.createdAt } : null
    );
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  useEffect(() => {
    return () => {
      if (successTimeout.current) clearTimeout(successTimeout.current);
    };
  }, []);

  const effectiveClockedIn = pendingAction ? pendingAction.type === "CLOCK_IN" : !!openEntry;
  const effectiveClockInTime = pendingAction?.type === "CLOCK_IN" ? pendingAction.at : openEntry?.clockIn;

  // Rafraîchit l'anneau et le temps écoulé pendant que le pointage est en
  // cours, sans quoi ils resteraient figés jusqu'au prochain re-rendu
  // déclenché par autre chose.
  const [, forceTick] = useState(0);
  useEffect(() => {
    if (!effectiveClockedIn) return;
    const id = setInterval(() => forceTick((n) => n + 1), 60000);
    return () => clearInterval(id);
  }, [effectiveClockedIn]);

  async function handlePress(onClockOutSuccess?: () => void) {
    setError(null);
    setActing(true);
    const wasClockingOut = effectiveClockedIn;
    try {
      const net = await NetInfo.fetch();
      if (!net.isConnected || net.isInternetReachable === false) {
        const type = wasClockingOut ? "CLOCK_OUT" : "CLOCK_IN";
        await enqueueAction(type, {});
        setPendingAction({ type, at: new Date().toISOString() });
        setActing(false);
        return;
      }
      const entry = wasClockingOut ? await clockOut() : await clockIn();
      setOpenEntry(entry.clockOut ? null : entry);
      setPendingAction(null);
      if (wasClockingOut) {
        onClockOutSuccess?.();
        if (successTimeout.current) clearTimeout(successTimeout.current);
        successScale.value = 0.7;
        successScale.value = withSpring(1, { damping: 11, stiffness: 220 });
        setShowSuccess(true);
        successTimeout.current = setTimeout(() => setShowSuccess(false), 2800);
      }
    } catch (err) {
      setError(extractErrorMessage(err, "Action impossible."));
    } finally {
      setActing(false);
    }
  }

  const minutesElapsed = effectiveClockInTime ? elapsedMinutes(effectiveClockInTime) : 0;

  return {
    state,
    openEntry,
    acting,
    error,
    pendingAction,
    effectiveClockedIn,
    effectiveClockInTime,
    minutesElapsed,
    showSuccess,
    successScale,
    handlePress,
  };
}
