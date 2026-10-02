import { useCallback, useEffect, useRef, useState } from "react";
import type { EffectCallback } from "react";
import { AppState, Platform } from "react-native";
import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import { apiClient } from "../api/client";

// Synchronisation entre appareils (retour explicite du client : « quand on
// change quelque chose, ça doit changer toutes les infos partout »).
//
// Le serveur tient un numéro de version qui avance à chaque modification
// (voir backend utils/changeVersion.ts). Tant que l'application est ouverte
// et connectée, on le consulte toutes les POLL_INTERVAL_MS ; dès qu'il
// change, l'écran affiché se recharge tout seul, discrètement (sans roue de
// chargement ni écran d'erreur), et les autres se rechargent quand on y
// revient. Un pointage validé sur l'ordinateur apparaît ainsi sur le
// téléphone en quelques secondes.

const POLL_INTERVAL_MS = 8_000;

type Listener = () => void;
const listeners = new Set<Listener>();
let lastVersion: string | null = null;
let backgroundDepth = 0;

/** Vrai pendant le lancement d'un rechargement automatique (pas de roue de chargement). */
export function isBackgroundRefresh(): boolean {
  return backgroundDepth > 0;
}

export function subscribeToDataChanges(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emitChange(): void {
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch {
      // Un écran en erreur n'empêche jamais les autres de se mettre à jour.
    }
  }
}

function appIsVisible(): boolean {
  if (Platform.OS === "web") return typeof document === "undefined" || document.visibilityState !== "hidden";
  return AppState.currentState === "active";
}

async function checkVersion(): Promise<void> {
  if (!appIsVisible()) return;
  try {
    const { data } = await apiClient.get<{ version: string }>("/sync/version");
    if (lastVersion !== null && data.version !== lastVersion) emitChange();
    lastVersion = data.version;
  } catch {
    // Hors connexion ou serveur indisponible : on réessaie au prochain tour.
  }
}

/** Démarre la surveillance (une fois connecté) ; renvoie la fonction d'arrêt. */
export function startLiveSync(): () => void {
  lastVersion = null;
  void checkVersion();
  const interval = setInterval(() => void checkVersion(), POLL_INTERVAL_MS);
  // Retour au premier plan : vérification immédiate.
  const appStateSub = AppState.addEventListener("change", (s) => {
    if (s === "active") void checkVersion();
  });
  const onVisible = () => {
    if (appIsVisible()) void checkVersion();
  };
  if (Platform.OS === "web" && typeof document !== "undefined") document.addEventListener("visibilitychange", onVisible);
  return () => {
    clearInterval(interval);
    appStateSub.remove();
    if (Platform.OS === "web" && typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisible);
    lastVersion = null;
  };
}

/**
 * Remplace useFocusEffect : charge l'écran quand il s'affiche, ET le
 * recharge discrètement chaque fois que les données changent (sur cet
 * appareil ou un autre) tant qu'il reste affiché.
 */
export function useLiveFocusEffect(effect: EffectCallback): void {
  const isFocused = useIsFocused();
  const [tick, setTick] = useState(0);
  const lastRunTick = useRef(0);

  useEffect(() => {
    if (!isFocused) return undefined;
    return subscribeToDataChanges(() => setTick((t) => t + 1));
  }, [isFocused]);

  useFocusEffect(
    useCallback(() => {
      const background = tick !== lastRunTick.current;
      lastRunTick.current = tick;
      if (!background) return effect();
      backgroundDepth += 1;
      try {
        return effect();
      } finally {
        backgroundDepth -= 1;
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [effect, tick])
  );
}

/**
 * Pour un composant qui charge ses données lui-même (carte, liste intégrée) :
 * appelle `reload` discrètement à chaque changement, tant que l'écran qui le
 * contient est affiché.
 */
export function useReloadOnDataChange(reload: () => unknown): void {
  const isFocused = useIsFocused();
  const reloadRef = useRef(reload);
  reloadRef.current = reload;
  useEffect(() => {
    if (!isFocused) return undefined;
    return subscribeToDataChanges(() => {
      backgroundDepth += 1;
      try {
        void reloadRef.current();
      } finally {
        backgroundDepth -= 1;
      }
    });
  }, [isFocused]);
}
