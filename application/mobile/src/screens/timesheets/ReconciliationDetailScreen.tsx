import React, { useCallback, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import Animated, { FadeInUp } from "react-native-reanimated";
import { ScreenContainer } from "../../components/ScreenContainer";
import { StateView } from "../../components/StateView";
import { Card } from "../../components/Card";
import { TimeEntryStatusBadge } from "../../components/TimeEntryStatusBadge";
import { useTheme } from "../../theme/ThemeProvider";
import { getReconciliationDetail } from "../../api/timesheets.api";
import type { ReconciliationDetail, ReconciliationMissionEntry } from "../../api/timesheets.api";
import { formatHoursMinutes } from "../../utils/timesheetSummary";
import type { MenuStackParamList } from "../../navigation/MenuStack";
import { frenchDateFormat } from "../../utils/frenchDate";

const dayFmt = frenchDateFormat({ weekday: "short", day: "numeric", month: "short" });
const timeFmt = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });
const GAP_TOLERANCE_MINUTES = 15;

type Route = RouteProp<MenuStackParamList, "ReconciliationDetail">;

function GapBadge({ gapMinutes }: { gapMinutes: number }) {
  const { colors, spacing, radius, type } = useTheme();
  let label = "Conforme";
  let tone = colors.success;
  if (gapMinutes > GAP_TOLERANCE_MINUTES) {
    label = `+${formatHoursMinutes(gapMinutes)} (heures supp.)`;
    tone = colors.warning;
  } else if (gapMinutes < -GAP_TOLERANCE_MINUTES) {
    label = `-${formatHoursMinutes(-gapMinutes)} manquantes`;
    tone = colors.danger;
  }
  return (
    <View style={{ backgroundColor: tone + "1A", borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 3, alignSelf: "flex-start" }}>
      <Text style={[type.caption, { color: tone }]}>{label}</Text>
    </View>
  );
}

function EntryRow({ entry }: { entry: ReconciliationMissionEntry["matchedEntries"][number] }) {
  const { colors, spacing, type } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.xs }}>
      <View style={{ flex: 1 }}>
        <Text style={[type.footnote, { color: colors.ink }]}>
          {timeFmt.format(new Date(entry.clockIn))} – {entry.clockOut ? timeFmt.format(new Date(entry.clockOut)) : "en cours"}
        </Text>
        {!!entry.validatedBy && (
          <Text style={[type.caption, { color: colors.inkTertiary, marginTop: 1 }]}>
            {entry.status === "REJECTED" ? "Refusé" : "Validé"} par {entry.validatedBy.firstName} {entry.validatedBy.lastName}
          </Text>
        )}
      </View>
      <TimeEntryStatusBadge status={entry.status} />
    </View>
  );
}

// Détail du rapprochement pointage <-> mission pour une personne : pour
// chaque mission planifiée, les pointages rattachés (recoupement horaire),
// l'écart calculé et qui a validé — pour que la RH comprenne d'où vient un
// écart signalé sur ReconciliationScreen sans rouvrir chaque mission une par une.
export function ReconciliationDetailScreen() {
  const { colors, spacing, type } = useTheme();
  const { params } = useRoute<Route>();

  const [detail, setDetail] = useState<ReconciliationDetail | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  const load = useCallback(async () => {
    try {
      setState("loading");
      setDetail(await getReconciliationDetail(params.userId, params.from, params.to));
      setState("ready");
    } catch {
      setState("error");
    }
  }, [params.userId, params.from, params.to]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  if (state === "loading") {
    return (
      <ScreenContainer>
        <StateView kind="loading" />
      </ScreenContainer>
    );
  }
  if (state === "error" || !detail) {
    return (
      <ScreenContainer>
        <StateView kind="error" onRetry={load} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={{ paddingTop: spacing.lg, paddingBottom: spacing.xxl }} showsVerticalScrollIndicator={false}>
        <Card style={{ marginBottom: spacing.lg }}>
          <View style={{ flexDirection: "row" }}>
            <View style={{ flex: 1 }}>
              <Text style={[type.title2, { color: colors.ink }]}>{formatHoursMinutes(detail.totals.workedMinutes)}</Text>
              <Text style={[type.caption, { color: colors.inkTertiary, marginTop: 2 }]}>Pointées</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[type.title2, { color: colors.ink }]}>{formatHoursMinutes(detail.totals.scheduledMinutes)}</Text>
              <Text style={[type.caption, { color: colors.inkTertiary, marginTop: 2 }]}>Prévues (missions)</Text>
            </View>
          </View>
        </Card>

        {detail.missions.length === 0 && detail.unmatchedEntries.length === 0 && (
          <StateView kind="empty" icon="calendar-outline" message="Aucune mission ni pointage sur cette période." />
        )}

        {detail.missions.map((m, index) => (
          <Animated.View key={m.mission.id} entering={FadeInUp.delay(Math.min(index, 6) * 30).duration(240)}>
            <Card style={{ marginBottom: spacing.sm }}>
              <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
                <View style={{ flex: 1, marginRight: spacing.sm }}>
                  <Text style={[type.headline, { color: colors.ink }]}>{m.mission.title}</Text>
                  <Text style={[type.footnote, { color: colors.inkSecondary, marginTop: 2 }]}>
                    {m.mission.site.name} · {dayFmt.format(new Date(m.mission.date))} · {timeFmt.format(new Date(m.mission.startTime))}–
                    {timeFmt.format(new Date(m.mission.endTime))} ({formatHoursMinutes(m.scheduledMinutes)})
                  </Text>
                </View>
                <GapBadge gapMinutes={m.gapMinutes} />
              </View>

              {m.matchedEntries.length === 0 ? (
                <View style={{ flexDirection: "row", alignItems: "center", marginTop: spacing.sm }}>
                  <Ionicons name="alert-circle-outline" size={14} color={colors.danger} />
                  <Text style={[type.footnote, { color: colors.danger, marginLeft: 4 }]}>Aucun pointage rattaché à cette mission.</Text>
                </View>
              ) : (
                m.matchedEntries.map((e) => <EntryRow key={e.id} entry={e} />)
              )}
            </Card>
          </Animated.View>
        ))}

        {detail.unmatchedEntries.length > 0 && (
          <View style={{ marginTop: spacing.md }}>
            <Text style={[type.overline, { color: colors.inkTertiary, marginBottom: spacing.sm }]}>
              POINTAGES SANS MISSION CORRESPONDANTE
            </Text>
            <Card>
              {detail.unmatchedEntries.map((e, i) => (
                <View key={e.id} style={{ marginTop: i === 0 ? 0 : spacing.sm, paddingTop: i === 0 ? 0 : spacing.sm, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.border }}>
                  <EntryRow entry={e} />
                </View>
              ))}
            </Card>
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
