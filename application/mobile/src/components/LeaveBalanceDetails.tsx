import React from "react";
import { Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeProvider";
import type { LeaveBalance } from "../api/leave.api";
import { formatDays } from "../utils/leaveDays";

const periodFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

// « 1er juin 2026 » : premier du mois en français.
function dayLabel(key: string): string {
  return periodFmt.format(new Date(`${key}T00:00:00Z`)).replace(/^1 /, "1er ");
}

function periodLabel(start: string, end: string): string {
  return `du ${dayLabel(start)} au ${dayLabel(end)}`;
}

// Lignes explicatives sous le solde de congés : période de référence (acquis /
// plafond), jours calculés en attente de validation RH, mois en cours. Même
// rendu pour le salarié (Mes absences) et la RH (fiche du salarié).
export function LeaveBalanceDetails({ balance }: { balance: LeaveBalance }) {
  const { colors, spacing, type } = useTheme();
  const line = (icon: keyof typeof Ionicons.glyphMap, text: string, color: string = colors.inkSecondary) => (
    <View style={{ flexDirection: "row", alignItems: "flex-start", marginTop: spacing.xs }}>
      <Ionicons name={icon} size={14} color={color} style={{ marginTop: 2 }} />
      <Text style={[type.footnote, { color, marginLeft: 6, flex: 1 }]}>{text}</Text>
    </View>
  );
  return (
    <View style={{ marginTop: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border }}>
      {line(
        "calendar-outline",
        `Période de référence ${periodLabel(balance.period.start, balance.period.end)} : ${formatDays(balance.period.acquired)} / ${formatDays(balance.period.cap)} jours acquis.`
      )}
      {balance.toValidate > 0 &&
        line("hourglass-outline", `+${formatDays(balance.toValidate)} jour${balance.toValidate >= 2 ? "s" : ""} calculé${balance.toValidate >= 2 ? "s" : ""}, en attente de validation par la RH.`, colors.warning)}
      {line(
        "trending-up-outline",
        `Ce mois-ci : +${formatDays(balance.currentMonth.estimatedDays)} jour${balance.currentMonth.estimatedDays >= 2 ? "s" : ""} en cours d'acquisition (${formatDays(balance.monthlyRate)} par mois complet).`
      )}
      <Text style={[type.caption, { color: colors.inkTertiary, marginTop: spacing.xs }]}>En jours ouvrables (du lundi au samedi, hors jours fériés).</Text>
    </View>
  );
}
