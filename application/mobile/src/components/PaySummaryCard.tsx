import React, { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "./Card";
import { useTheme } from "../theme/ThemeProvider";
import { getPaySummary } from "../api/timesheets.api";
import type { PaySummary } from "../api/timesheets.api";
import { formatHoursMinutes } from "../utils/timesheetSummary";
import { useReloadOnDataChange, isBackgroundRefresh } from "../sync/liveSync";

// Majorations du mois (retour explicite du client : différencier les heures
// de nuit, de dimanche et de jour férié, et le repos des travailleurs de
// nuit). Affiche uniquement ce que le serveur a calculé à partir des
// pointages — rien n'est saisi à la main.

function hours(minutes: number): string {
  return formatHoursMinutes(Math.round(minutes));
}

function signedHours(minutes: number): string {
  return minutes < 0 ? `− ${hours(-minutes)}` : hours(minutes);
}

interface Props {
  month: string; // « AAAA-MM »
  userId?: string;
}

export function PaySummaryCard({ month, userId }: Props) {
  const { colors, spacing, type, radius } = useTheme();
  const [summary, setSummary] = useState<PaySummary | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    const silent = isBackgroundRefresh();
    try {
      if (!silent) setFailed(false);
      setSummary(await getPaySummary(month, userId));
    } catch {
      if (!silent) {
        setSummary(null);
        setFailed(true);
      }
    }
  }, [month, userId]);

  useEffect(() => {
    setSummary(null);
    void load();
  }, [load]);
  useReloadOnDataChange(load);

  if (failed) {
    return (
      <Card style={{ marginTop: spacing.md }}>
        <Text style={[type.footnote, { color: colors.inkTertiary }]}>Majorations indisponibles pour le moment.</Text>
      </Card>
    );
  }
  if (!summary || summary.totals.countedMinutes === 0) return null;

  const { totals, nightWorker, compensatoryRest } = summary;
  const rows: { icon: React.ComponentProps<typeof Ionicons>["name"]; label: string; minutes: number }[] = [
    { icon: "moon-outline", label: "Heures de nuit (21 h – 6 h)", minutes: totals.minutesByCategory.night },
    { icon: "sunny-outline", label: "Heures du dimanche", minutes: totals.minutesByCategory.sunday },
    { icon: "flag-outline", label: "Heures de jour férié", minutes: totals.minutesByCategory.holiday },
    { icon: "time-outline", label: "Heures normales", minutes: totals.minutesByCategory.normal },
  ];
  const showRest = nightWorker.isNightWorker || compensatoryRest.yearAcquiredMinutes > 0 || compensatoryRest.yearTakenMinutes > 0;
  const restDays = Math.floor(Math.max(0, compensatoryRest.balanceMinutes) / compensatoryRest.restDayMinutes);

  return (
    <Card style={{ marginTop: spacing.md }}>
      <Text style={[type.overline, { color: colors.inkTertiary, marginBottom: spacing.sm }]}>MAJORATIONS DU MOIS</Text>
      {rows.map((row) => (
        <View key={row.label} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 5 }}>
          <Ionicons name={row.icon} size={16} color={row.minutes > 0 && row.label !== "Heures normales" ? colors.accent : colors.inkTertiary} />
          <Text style={[type.callout, { color: colors.inkSecondary, flex: 1, marginLeft: spacing.sm }]}>{row.label}</Text>
          <Text style={[type.callout, { color: colors.ink, fontWeight: "600" }]}>{hours(row.minutes)}</Text>
        </View>
      ))}

      {totals.byRate.length > 0 && (
        <View style={{ marginTop: spacing.sm, padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.accentSoft }}>
          {totals.byRate.map((r) => (
            <Text key={r.rate} style={[type.footnote, { color: colors.inkSecondary }]}>
              {hours(r.minutes)} majorées à +{Math.round(r.rate * 100)} %
            </Text>
          ))}
          <Text style={[type.callout, { color: colors.accentText, fontWeight: "600", marginTop: 4 }]}>
            Majoration : + {hours(totals.premiumMinutes)} payées en plus
          </Text>
        </View>
      )}
      {totals.pendingMinutes > 0 && (
        <Text style={[type.caption, { color: colors.inkTertiary, marginTop: spacing.xs }]}>
          Dont {hours(totals.pendingMinutes)} encore en attente de validation.
        </Text>
      )}

      {showRest && (
        <View style={{ marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border }}>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: spacing.xs }}>
            <Ionicons name="bed-outline" size={16} color={colors.accent} />
            <Text style={[type.headline, { color: colors.ink, marginLeft: spacing.sm, flex: 1 }]}>Repos compensateur</Text>
          </View>
          <Text style={[type.footnote, { color: colors.inkTertiary, marginBottom: spacing.xs }]}>
            {nightWorker.isNightWorker && <Text style={{ color: colors.accentText, fontWeight: "600" }}>Travailleur de nuit · </Text>}
            {nightWorker.reason}
          </Text>
          <RestRow label="Acquis ce mois (2 % des heures de nuit)" value={hours(compensatoryRest.monthAcquiredMinutes)} />
          <RestRow label="Acquis depuis janvier" value={hours(compensatoryRest.yearAcquiredMinutes)} />
          <RestRow label="Déjà pris" value={hours(compensatoryRest.yearTakenMinutes)} />
          <RestRow label="Reste à prendre" value={signedHours(compensatoryRest.balanceMinutes)} strong />
          <Text style={[type.caption, { color: colors.inkTertiary, marginTop: spacing.xs }]}>
            {restDays > 0
              ? `Soit ${restDays} jour${restDays > 1 ? "s" : ""} de repos à poser (payé${restDays > 1 ? "s" : ""}, 7 h par jour).`
              : "Un jour de repos payé se pose dès 7 h acquises (demande d'absence « Repos compensateur »)."}
          </Text>
        </View>
      )}
    </Card>
  );
}

function RestRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  const { colors, type } = useTheme();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 }}>
      <Text style={[type.footnote, { color: colors.inkSecondary, flex: 1 }]}>{label}</Text>
      <Text style={[strong ? type.callout : type.footnote, { color: colors.ink, fontWeight: strong ? "700" : "500" }]}>{value}</Text>
    </View>
  );
}
