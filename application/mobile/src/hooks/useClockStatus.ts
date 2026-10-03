import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import * as ImagePicker from "expo-image-picker";
import { useSharedValue, withSpring } from "react-native-reanimated";
import { clockIn, clockOut, getMyTimesheetStatus } from "../api/timesheets.api";
import type { ClockPhotoAsset, TimeEntry } from "../api/timesheets.api";
import { extractErrorMessage } from "../api/client";
import { pickWebImages } from "../utils/webImagePicker";
import { capturePosition } from "../utils/geolocation";
import { useLiveFocusEffect } from "../sync/liveSync";
import { Alert } from "../utils/alert";

// Le pointage exige toujours une position GPS + une photo prise sur l'instant
// (justificatif anti-fraude, retour explicite du client — voir
// docs/DEPLOYMENT.md pour le contexte). `CaptureAborted` distingue une
// annulation volontaire de l'utilisateur (ferme la caméra, refuse la
// localisation) d'une vraie erreur réseau : dans les deux cas on abandonne
// l'action sans toucher au serveur, mais seule la vraie erreur doit
// s'afficher comme un message d'échec.
class CaptureAborted extends Error {}

// Toujours l'appareil photo, jamais la galerie : une photo choisie dans la
// pellicule pourrait dater de n'importe quand, ce qui viderait le
// justificatif de tout son sens anti-fraude.
async function capturePhoto(): Promise<ClockPhotoAsset> {
  if (Platform.OS === "web") {
    // Même contournement que ReportProblemScreen (voir utils/webImagePicker.ts).
    const [file] = await pickWebImages({ multiple: false, capture: true });
    if (!file) throw new CaptureAborted();
    return { uri: file.uri, fileName: file.fileName, mimeType: file.mimeType, file: file.file };
  }

  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    throw new Error("Accès à l'appareil photo refusé : autorisez-le dans les réglages pour pointer.");
  }
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.8 });
  if (result.canceled || !result.assets[0]) throw new CaptureAborted();
  const asset = result.assets[0];
  return { uri: asset.uri, fileName: asset.fileName, mimeType: asset.mimeType };
}

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
const LONG_SESSION_MINUTES = 12 * 60;

export function useClockStatus() {
  const [openEntry, setOpenEntry] = useState<TimeEntry | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Toujours null désormais : le pointage exige une photo (voir plus haut),
  // donc il ne peut plus jamais être mis en file hors ligne — gardé dans la
  // forme retournue pour ne pas devoir toucher TimesheetWidget/TimesheetScreen,
  // qui l'affichent déjà correctement (jamais "en attente de synchronisation").
  const pendingAction: { type: "CLOCK_IN" | "CLOCK_OUT"; at: string } | null = null;
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
  }, []);

  useLiveFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  useEffect(() => {
    return () => {
      if (successTimeout.current) clearTimeout(successTimeout.current);
    };
  }, []);

  const effectiveClockedIn = !!openEntry;
  const effectiveClockInTime = openEntry?.clockIn;

  // Rafraîchit l'anneau et le temps écoulé pendant que le pointage est en
  // cours, sans quoi ils resteraient figés jusqu'au prochain re-rendu
  // déclenché par autre chose.
  const [, forceTick] = useState(0);
  useEffect(() => {
    if (!effectiveClockedIn) return;
    const id = setInterval(() => forceTick((n) => n + 1), 60000);
    return () => clearInterval(id);
  }, [effectiveClockedIn]);

  // Retour d'audit : une sortie pointée après un oubli (16 h « en poste »)
  // partait sans avertissement. Au-delà de 12 h, on demande confirmation.
  function handlePress(onClockOutSuccess?: () => void) {
    const minutes = effectiveClockInTime ? elapsedMinutes(effectiveClockInTime) : 0;
    if (effectiveClockedIn && minutes > LONG_SESSION_MINUTES) {
      Alert.alert(
        "Pointage très long",
        `Vous êtes en poste depuis ${elapsedLabel(minutes)}. Si vous avez oublié de pointer votre sortie, pointez-la maintenant et prévenez votre responsable : il vous demandera de corriger l'heure réelle.`,
        [
          { text: "Annuler", style: "cancel" },
          { text: "Pointer ma sortie", onPress: () => void doPress(onClockOutSuccess) },
        ]
      );
      return;
    }
    void doPress(onClockOutSuccess);
  }

  async function doPress(onClockOutSuccess?: () => void) {
    setError(null);
    setActing(true);
    const wasClockingOut = effectiveClockedIn;
    try {
      const net = await NetInfo.fetch();
      if (!net.isConnected || net.isInternetReachable === false) {
        // Une photo est un fichier binaire, jamais mis en file hors ligne
        // (même règle que ReportProblemScreen) : contrairement à avant, il
        // n'y a plus de pointage "en attente de synchronisation" possible.
        throw new Error("Vous êtes hors connexion : le pointage nécessite une vraie connexion pour envoyer la photo justificative. Réessayez dès que possible.");
      }

      const position = await capturePosition(
        "Localisation refusée : autorisez l'accès à votre position dans les réglages pour pointer.",
        "Position GPS indisponible pour le moment. Réessayez dans un instant, idéalement à l'extérieur."
      );
      const photo = await capturePhoto();

      const entry = wasClockingOut ? await clockOut(position, photo) : await clockIn(position, photo);
      setOpenEntry(entry.clockOut ? null : entry);
      if (wasClockingOut) {
        onClockOutSuccess?.();
        if (successTimeout.current) clearTimeout(successTimeout.current);
        successScale.value = 0.7;
        successScale.value = withSpring(1, { damping: 11, stiffness: 220 });
        setShowSuccess(true);
        successTimeout.current = setTimeout(() => setShowSuccess(false), 2800);
      }
    } catch (err) {
      if (!(err instanceof CaptureAborted)) {
        setError(extractErrorMessage(err, "Action impossible."));
      }
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
