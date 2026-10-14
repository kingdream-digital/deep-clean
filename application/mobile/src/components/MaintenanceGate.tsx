import React, { useCallback, useEffect, useRef, useState } from "react";
import { AppState, StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useAuth } from "../auth/AuthContext";
import { checkMaintenance, getMaintenance, subscribeToMaintenance } from "../sync/maintenance";
import type { MaintenanceInfo } from "../sync/maintenance";
import { refreshAllScreens } from "../sync/liveSync";
import { MaintenanceScreen } from "./MaintenanceScreen";

const POLL_MS = 15_000;

/**
 * Recouvre toute l'application pendant une maintenance (activée depuis
 * Coolify : MAINTENANCE_MODE=true). L'état vient du serveur — /status au
 * démarrage et au retour au premier plan, et toute réponse « 503
 * MAINTENANCE » en cours d'utilisation. Pendant la maintenance, vérifie
 * toutes les 15 s et rouvre l'application d'elle-même, session intacte.
 *
 * Ce n'est qu'un affichage : le blocage réel est fait par le serveur
 * (backend config/maintenance.ts). L'admin technique, seul autorisé à
 * entrer, peut écarter l'écran pour se connecter.
 */
export function MaintenanceGate() {
  const { user } = useAuth();
  const [info, setInfo] = useState<MaintenanceInfo | null>(getMaintenance());
  const [adminBypass, setAdminBypass] = useState(false);
  const active = info !== null;

  useEffect(
    () =>
      subscribeToMaintenance((next) => {
        setInfo(next);
        // Un compte autre qu'admin a tenté d'entrer : l'écran revient.
        if (next) setAdminBypass(false);
      }),
    []
  );

  useEffect(() => {
    void checkMaintenance();
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") void checkMaintenance();
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!active) return undefined;
    const id = setInterval(() => void checkMaintenance(), POLL_MS);
    return () => clearInterval(id);
  }, [active]);

  // Fin de maintenance : les écrans restés en erreur se rechargent seuls.
  const wasActive = useRef(active);
  useEffect(() => {
    if (wasActive.current && !active) refreshAllScreens();
    wasActive.current = active;
  }, [active]);

  const retry = useCallback(async () => (await checkMaintenance()) === null, []);

  if (!info || user?.role === "ADMIN" || (adminBypass && !user)) return null;

  return (
    <Animated.View entering={FadeIn.duration(300)} exiting={FadeOut.duration(400)} style={[StyleSheet.absoluteFill, { zIndex: 1000 }]}>
      <View style={StyleSheet.absoluteFill}>
        <MaintenanceScreen message={info.message} until={info.until} onRetry={retry} onAdminAccess={user ? undefined : () => setAdminBypass(true)} />
      </View>
    </Animated.View>
  );
}
