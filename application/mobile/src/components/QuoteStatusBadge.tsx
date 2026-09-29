import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import { QUOTE_STATUS_LABELS } from "../api/quotes.api";
import type { QuoteStatus } from "../api/quotes.api";

export function QuoteStatusBadge({ status }: { status: QuoteStatus }) {
  const { colors, radius, spacing, type } = useTheme();

  const tone: Record<QuoteStatus, { bg: string; fg: string }> = {
    DRAFT: { bg: colors.neutralSoft, fg: colors.neutral },
    TO_VALIDATE: { bg: colors.warningSoft, fg: colors.warning },
    VALIDATED: { bg: colors.infoSoft, fg: colors.info },
    SENT: { bg: colors.accentSoft, fg: colors.accent },
    FOLLOW_UP: { bg: colors.purpleSoft, fg: colors.purple },
    ACCEPTED: { bg: colors.successSoft, fg: colors.success },
    REJECTED: { bg: colors.dangerSoft, fg: colors.danger },
    EXPIRED: { bg: colors.neutralSoft, fg: colors.neutral },
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
        {QUOTE_STATUS_LABELS[status]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { flexDirection: "row", alignItems: "center", paddingVertical: 4, alignSelf: "flex-start", borderWidth: 1 },
  dot: { width: 6, height: 6, borderRadius: 3, marginRight: 5 },
});
