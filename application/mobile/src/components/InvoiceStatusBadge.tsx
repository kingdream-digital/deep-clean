import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import { INVOICE_STATUS_LABELS } from "../api/invoices.api";
import type { InvoiceStatus } from "../api/invoices.api";

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  const { colors, radius, spacing, type } = useTheme();

  const tone: Record<InvoiceStatus, { bg: string; fg: string }> = {
    DRAFT: { bg: colors.neutralSoft, fg: colors.neutral },
    VALIDATED: { bg: colors.infoSoft, fg: colors.info },
    SENT: { bg: colors.accentSoft, fg: colors.accent },
    PAID: { bg: colors.successSoft, fg: colors.success },
    CANCELLED: { bg: colors.dangerSoft, fg: colors.danger },
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
        {INVOICE_STATUS_LABELS[status]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { flexDirection: "row", alignItems: "center", paddingVertical: 4, alignSelf: "flex-start", borderWidth: 1 },
  dot: { width: 6, height: 6, borderRadius: 3, marginRight: 5 },
});
