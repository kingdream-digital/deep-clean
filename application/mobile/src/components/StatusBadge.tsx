import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import { PulsingDot } from "./PulsingDot";
import type { MissionStatus } from "../api/missions.api";

const LABELS: Record<MissionStatus, string> = {
  SCHEDULED: "Planifiée",
  IN_PROGRESS: "En cours",
  COMPLETED: "Terminée",
  CANCELLED: "Annulée",
};

// Pastille pulsante réservée au statut "actif" (En cours) — jamais sur un
// statut terminal, pour que le mouvement signale vraiment quelque chose.
const ACTIVE_STATUSES: MissionStatus[] = ["IN_PROGRESS"];

// Une mission terminée passe par deux états bien distincts pour le terrain :
// « À valider » (travail fini, en attente du contrôle d'un responsable) puis
// « Validée ». Le simple « Terminée » prêtait à confusion avec « Validée »
// (retour explicite du client) : il n'est plus affiché.
//
// `overdue` : mission planifiée dont l'horaire est passé sans démarrage (voir
// isMissionOverdue) — affichée « Non démarrée », pas « Planifiée ». Même teinte
// d'alerte que l'en-tête « MISSION NON DÉMARRÉE » de l'accueil ; la pastille
// reste fixe, ce qui la distingue de « En cours ».
export function StatusBadge({
  status,
  overdue = false,
  validated = false,
}: {
  status: MissionStatus;
  overdue?: boolean;
  validated?: boolean;
}) {
  const { colors, radius, spacing, type } = useTheme();

  const tone: Record<MissionStatus, { bg: string; fg: string }> = {
    SCHEDULED: { bg: colors.accentSoft, fg: colors.accent },
    IN_PROGRESS: { bg: colors.warningSoft, fg: colors.warning },
    COMPLETED: { bg: colors.successSoft, fg: colors.success },
    CANCELLED: { bg: colors.dangerSoft, fg: colors.danger },
  };
  const awaitingValidation = status === "COMPLETED" && !validated;
  const t = overdue || awaitingValidation ? { bg: colors.warningSoft, fg: colors.warning } : tone[status];
  const label = overdue ? "Non démarrée" : status === "COMPLETED" ? (validated ? "Validée" : "À valider") : LABELS[status];

  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: t.bg, borderRadius: radius.pill, borderColor: t.fg + "4D", paddingHorizontal: spacing.sm },
      ]}
    >
      {ACTIVE_STATUSES.includes(status) ? (
        <PulsingDot color={t.fg} size={6} style={styles.dot} />
      ) : (
        <View style={[styles.staticDot, { backgroundColor: t.fg }]} />
      )}
      <Text style={[type.caption, { color: t.fg, textTransform: "uppercase", letterSpacing: 0.4 }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    alignSelf: "flex-start",
    borderWidth: 1,
  },
  dot: { marginRight: 5 },
  staticDot: { width: 6, height: 6, borderRadius: 3, marginRight: 5 },
});
