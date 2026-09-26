import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import { PulsingDot } from "./PulsingDot";
import type { ProblemStatus } from "../api/problems.api";

const LABELS: Record<ProblemStatus, string> = {
  NEW: "Nouveau",
  IN_PROGRESS: "En cours",
  RESOLVED: "Traité",
  VALIDATED: "Validé",
};

// Pastille pulsante réservée aux statuts "actifs" (à traiter) — jamais sur
// un statut terminal, pour que le mouvement signale vraiment quelque chose.
const ACTIVE_STATUSES: ProblemStatus[] = ["NEW", "IN_PROGRESS"];

export function ProblemStatusBadge({ status }: { status: ProblemStatus }) {
  const { colors, radius, spacing, type } = useTheme();

  // Quatre statuts, quatre couleurs distinctes — "Traité" réutilise l'accent
  // (garde la marque présente dans le flux) sans se confondre avec "Validé".
  const tone: Record<ProblemStatus, { bg: string; fg: string }> = {
    NEW: { bg: colors.neutralSoft, fg: colors.neutral },
    IN_PROGRESS: { bg: colors.warningSoft, fg: colors.warning },
    RESOLVED: { bg: colors.accentSoft, fg: colors.accent },
    VALIDATED: { bg: colors.successSoft, fg: colors.success },
  };
  const t = tone[status];

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
        {LABELS[status]}
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
