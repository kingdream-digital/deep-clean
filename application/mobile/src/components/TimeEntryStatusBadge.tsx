import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import type { TimeEntryStatus } from "../api/timesheets.api";

const LABELS: Record<TimeEntryStatus, string> = {
  PENDING: "En attente",
  VALIDATED: "Validé",
  REJECTED: "Refusé",
};

export function TimeEntryStatusBadge({ status }: { status: TimeEntryStatus }) {
  const { colors, radius, spacing, type } = useTheme();

  const tone: Record<TimeEntryStatus, { bg: string; fg: string }> = {
    PENDING: { bg: colors.warningSoft, fg: colors.warning },
    VALIDATED: { bg: colors.successSoft, fg: colors.success },
    REJECTED: { bg: colors.dangerSoft, fg: colors.danger },
  };
  const t = tone[status];

  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: t.bg, borderRadius: radius.pill, borderColor: t.fg + "4D", paddingHorizontal: spacing.sm },
      ]}
    >
      <View style={[styles.dot, { backgroundColor: t.fg }]} />
      <Text style={[type.caption, { color: t.fg, textTransform: "uppercase", letterSpacing: 0.4 }]}>
        {LABELS[status]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { flexDirection: "row", alignItems: "center", paddingVertical: 4, alignSelf: "flex-start", borderWidth: 1 },
  dot: { width: 6, height: 6, borderRadius: 3, marginRight: 5 },
});
