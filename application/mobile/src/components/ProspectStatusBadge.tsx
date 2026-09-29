import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import { PROSPECT_STATUS_LABELS } from "../api/prospects.api";
import type { ProspectStatus } from "../api/prospects.api";

export function ProspectStatusBadge({ status }: { status: ProspectStatus }) {
  const { colors, radius, spacing, type } = useTheme();

  const tone: Record<ProspectStatus, { bg: string; fg: string }> = {
    NEW: { bg: colors.infoSoft, fg: colors.info },
    CONTACTED: { bg: colors.infoSoft, fg: colors.info },
    MEETING_SCHEDULED: { bg: colors.purpleSoft, fg: colors.purple },
    QUOTE_TO_PREPARE: { bg: colors.warningSoft, fg: colors.warning },
    QUOTE_SENT: { bg: colors.warningSoft, fg: colors.warning },
    NEGOTIATING: { bg: colors.accentSoft, fg: colors.accent },
    WON: { bg: colors.successSoft, fg: colors.success },
    LOST: { bg: colors.neutralSoft, fg: colors.neutral },
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
        {PROSPECT_STATUS_LABELS[status]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { flexDirection: "row", alignItems: "center", paddingVertical: 4, alignSelf: "flex-start", borderWidth: 1 },
  dot: { width: 6, height: 6, borderRadius: 3, marginRight: 5 },
});
