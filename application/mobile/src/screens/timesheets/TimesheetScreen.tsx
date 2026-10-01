import React, { useCallback, useState } from "react";
import { FlatList, RefreshControl, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Animated, { FadeInUp } from "react-native-reanimated";
import { ScreenContainer } from "../../components/ScreenContainer";
import { StateView } from "../../components/StateView";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { PressableScale } from "../../components/PressableScale";
import { PulsingDot } from "../../components/PulsingDot";
import { ProgressRing } from "../../components/ProgressRing";
import { TimeEntryStatusBadge } from "../../components/TimeEntryStatusBadge";
import { useTheme } from "../../theme/ThemeProvider";
import { listTimeEntries } from "../../api/timesheets.api";
import type { TimeEntry } from "../../api/timesheets.api";
import { listMissions } from "../../api/missions.api";
import type { Mission } from "../../api/missions.api";
import { formatDuration } from "../../utils/duration";
import { formatMissionTimeRange, todayKey } from "../../utils/missionFormat";
import { useWeeklyTimesheetSummary } from "../../hooks/useWeeklyTimesheetSummary";
import { formatHoursMinutes } from "../../utils/timesheetSummary";
import { useClockStatus, elapsedLabel, REFERENCE_WORKDAY_MINUTES } from "../../hooks/useClockStatus";
import type { HomeStackParamList } from "../../navigation/HomeStack";
import { frenchDateFormat } from "../../utils/frenchDate";

const dayFmt = frenchDateFormat({ weekday: "short", day: "numeric", month: "short" });
const timeFmt = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });

// Écran "Pointage" dédié — reprend l'anneau/bouton du widget d'accueil (même
// logique, voir useClockStatus) mais y ajoute le chantier en cours (mission
// IN_PROGRESS réelle de l'utilisateur, pas une donnée inventée) et
// l'historique complet de la semaine. Validation par un responsable : écran
// séparé (TimesheetValidationScreen), jamais mélangée ici.
export function TimesheetScreen() {
  const { colors, spacing, radius, type } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const [items, setItems] = useState<TimeEntry[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [refreshing, setRefreshing] = useState(false);
  const [currentMission, setCurrentMission] = useState<Mission | null>(null);
  const { summary, reload: reloadSummary } = useWeeklyTimesheetSummary();
  const clock = useClockStatus();

  const load = useCallback(async () => {
    try {
      setState("loading");
      const res = await listTimeEntries();
      setItems(res.items);
      setState("ready");
    } catch {
      setState("error");
    }
  }, []);

  const loadCurrentMission = useCallback(async () => {
    try {
      const res = await listMissions({ from: todayKey(), to: todayKey() });
      setCurrentMission(res.items.find((m) => m.status === "IN_PROGRESS") ?? null);
    } catch {
      setCurrentMission(null);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
      void loadCurrentMission();
    }, [load, loadCurrentMission])
  );

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    await loadCurrentMission();
    setRefreshing(false);
  }

  function handleClockPress() {
    void clock.handlePress(() => void reloadSummary());
  }

  const statusCard = clock.state !== "error" && (
    <Card glow={clock.effectiveClockedIn} style={{ marginBottom: spacing.lg, alignItems: "center", paddingVertical: spacing.xl }}>
      {clock.state === "loading" ? (
        <View style={{ height: 180 }} />
      ) : clock.effectiveClockedIn && clock.effectiveClockInTime ? (
        <>
          <ProgressRing size={180} strokeWidth={11} progress={clock.minutesElapsed / REFERENCE_WORKDAY_MINUTES}>
            <Text style={[type.title1, { color: colors.ink, fontVariant: ["tabular-nums"] }]}>
              {elapsedLabel(clock.minutesElapsed)}
            </Text>
            <Text style={[type.footnote, { color: colors.inkTertiary, marginTop: 4 }]}>
              depuis {timeFmt.format(new Date(clock.effectiveClockInTime))}
            </Text>
          </ProgressRing>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginTop: spacing.lg,
              backgroundColor: clock.pendingAction ? colors.warningSoft : colors.successSoft,
              borderRadius: 999,
              paddingVertical: 7,
              paddingHorizontal: 14,
            }}
          >
            <PulsingDot color={clock.pendingAction ? colors.warning : colors.success} style={{ marginRight: spacing.xs }} />
            <Text
              style={[type.footnote, { color: clock.pendingAction ? colors.warning : colors.success, fontWeight: "600" }]}
              numberOfLines={1}
            >
              {clock.pendingAction ? "En attente de synchronisation" : "En poste"}
            </Text>
          </View>
        </>
      ) : (
        <View style={{ alignItems: "center" }}>
          <Ionicons name="time-outline" size={40} color={colors.inkTertiary} />
          <Text style={[type.headline, { color: colors.ink, marginTop: spacing.sm }]}>Vous n'êtes pas en poste</Text>
        </View>
      )}

      {clock.error && (
        <Text style={[type.footnote, { color: colors.danger, marginTop: spacing.sm, textAlign: "center" }]}>{clock.error}</Text>
      )}

      {clock.showSuccess ? (
        <Animated.View
          entering={FadeInUp.duration(180)}
          style={{
            marginTop: spacing.lg,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            paddingVertical: 14,
            paddingHorizontal: spacing.lg,
            borderRadius: 14,
            backgroundColor: colors.successSoft,
          }}
        >
          <Ionicons name="checkmark-circle" size={20} color={colors.success} />
          <Text style={[type.headline, { color: colors.success, marginLeft: spacing.xs }]}>
            Pointage terminé — bon travail !
          </Text>
        </Animated.View>
      ) : (
        clock.state === "ready" && (
          <View style={{ marginTop: spacing.lg, width: "100%" }}>
            <Button
              label={clock.effectiveClockedIn ? "Pointer ma sortie" : "Pointer mon arrivée"}
              variant={clock.effectiveClockedIn ? "destructive" : "primary"}
              loading={clock.acting}
              onPress={handleClockPress}
            />
          </View>
        )
      )}

      <PressableScale onPress={() => navigation.navigate("TimesheetRetroactive")} style={{ marginTop: spacing.md }}>
        <Text style={[type.footnote, { color: colors.inkTertiary, textDecorationLine: "underline" }]}>
          J'ai oublié de pointer — pointage différé
        </Text>
      </PressableScale>
    </Card>
  );

  const currentSiteCard = currentMission && (
    <>
      <Text style={[type.overline, { color: colors.inkTertiary, marginBottom: spacing.sm }]}>CHANTIER ACTUEL</Text>
      <PressableScale onPress={() => navigation.navigate("SiteDetail", { siteId: currentMission.site.id })}>
        <Card style={{ flexDirection: "row", alignItems: "center", marginBottom: spacing.lg }}>
          <View
            style={{
              width: 50,
              height: 50,
              borderRadius: radius.md,
              backgroundColor: colors.accentSoft,
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Ionicons name="business-outline" size={22} color={colors.accent} />
          </View>
          <View style={{ marginLeft: spacing.md, flex: 1 }}>
            <Text style={[type.headline, { color: colors.ink }]} numberOfLines={1}>
              {currentMission.site.name}
            </Text>
            <Text style={[type.footnote, { color: colors.inkSecondary, marginTop: 2 }]} numberOfLines={1}>
              {currentMission.site.address}
            </Text>
            <Text style={[type.footnote, { color: colors.inkSecondary, marginTop: 1 }]}>
              {formatMissionTimeRange(currentMission.startTime, currentMission.endTime)}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.inkTertiary} />
        </Card>
      </PressableScale>
    </>
  );

  const weekSummaryCard = (
    <Card style={{ marginBottom: spacing.lg }}>
      {/* Un petit titre en capitales, la précision à côté en clair : la
          parenthèse en minuscules au milieu des capitales se lisait mal. */}
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginBottom: spacing.sm }}>
        <Text style={[type.overline, { color: colors.inkTertiary }]}>CETTE SEMAINE</Text>
        <Text style={[type.caption, { color: colors.inkTertiary }]}>Remis à zéro chaque lundi</Text>
      </View>
      <View style={{ flexDirection: "row" }}>
        <View style={{ flex: 1 }}>
          <Text style={[type.caption, { color: colors.inkTertiary }]}>Total travaillé</Text>
          <Text style={[type.title2, { color: colors.ink, marginTop: 2 }]}>{formatHoursMinutes(summary.totalMinutes)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[type.caption, { color: colors.inkTertiary }]}>Validées</Text>
          <Text style={[type.title2, { color: colors.success, marginTop: 2 }]}>{formatHoursMinutes(summary.validatedMinutes)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[type.caption, { color: colors.inkTertiary }]}>En attente</Text>
          <Text style={[type.title2, { color: colors.warning, marginTop: 2 }]}>{formatHoursMinutes(summary.pendingMinutes)}</Text>
        </View>
      </View>
    </Card>
  );

  return (
    <ScreenContainer style={{ paddingTop: spacing.md }}>
      {state === "loading" && <StateView kind="loading" />}
      {state === "error" && <StateView kind="error" onRetry={load} />}
      {state === "ready" && items.length === 0 && (
        <>
          {statusCard}
          {currentSiteCard}
          {weekSummaryCard}
          <StateView kind="empty" icon="time-outline" message="Aucun pointage pour le moment." />
        </>
      )}

      {state === "ready" && items.length > 0 && (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: spacing.xxl }}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.accent} />}
          ListHeaderComponent={
            <>
              {statusCard}
              {currentSiteCard}
              {weekSummaryCard}
              <Text style={[type.overline, { color: colors.inkTertiary, marginBottom: spacing.sm }]}>HISTORIQUE</Text>
            </>
          }
          renderItem={({ item, index }) => (
            <Animated.View entering={FadeInUp.delay(Math.min(index, 6) * 40).duration(280)}>
              <Card>
                <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
                  <View style={{ flex: 1, marginRight: spacing.sm }}>
                    <Text style={[type.headline, { color: colors.ink }]}>
                      {dayFmt.format(new Date(item.clockIn))}
                    </Text>
                    <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4 }}>
                      <Ionicons name="time-outline" size={14} color={colors.inkTertiary} />
                      <Text style={[type.footnote, { color: colors.inkSecondary, marginLeft: 4 }]}>
                        {timeFmt.format(new Date(item.clockIn))} –{" "}
                        {item.clockOut ? timeFmt.format(new Date(item.clockOut)) : "en cours"}
                        {"  ·  "}
                        {formatDuration(item.clockIn, item.clockOut)}
                      </Text>
                    </View>
                    {item.isRetroactive && (
                      <View style={{ flexDirection: "row", alignItems: "center", marginTop: 2 }}>
                        <Ionicons name="time-outline" size={12} color={colors.purple} />
                        <Text style={[type.caption, { color: colors.purple, marginLeft: 3 }]}>Pointage différé</Text>
                      </View>
                    )}
                    {item.overtimeMinutes != null && (
                      <View style={{ flexDirection: "row", alignItems: "center", marginTop: 2 }}>
                        <Ionicons name="trending-up-outline" size={12} color={colors.warning} />
                        <Text style={[type.caption, { color: colors.warning, marginLeft: 3 }]}>
                          +{formatHoursMinutes(item.overtimeMinutes)} heures supp. (validées)
                        </Text>
                      </View>
                    )}
                    {item.comment && (
                      <Text style={[type.footnote, { color: colors.inkTertiary, marginTop: 4 }]} numberOfLines={2}>
                        {item.comment}
                      </Text>
                    )}
                  </View>
                  <TimeEntryStatusBadge status={item.status} />
                </View>
              </Card>
            </Animated.View>
          )}
        />
      )}
    </ScreenContainer>
  );
}
