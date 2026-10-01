import React, { useCallback, useState } from "react";
import { FlatList, RefreshControl, Text, View } from "react-native";
import { Alert } from "../../utils/alert";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Animated, { FadeInUp } from "react-native-reanimated";
import { ScreenContainer } from "../../components/ScreenContainer";
import { StateView } from "../../components/StateView";
import { SegmentedControl } from "../../components/SegmentedControl";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { PressableScale } from "../../components/PressableScale";
import { TimeEntryStatusBadge } from "../../components/TimeEntryStatusBadge";
import { DataTable, DataTableColumn } from "../../components/DataTable";
import { useTheme } from "../../theme/ThemeProvider";
import { useResponsive } from "../../hooks/useResponsive";
import { extractErrorMessage } from "../../api/client";
import { listTimeEntries, validateTimeEntry } from "../../api/timesheets.api";
import type { TimeEntry } from "../../api/timesheets.api";
import { formatDuration } from "../../utils/duration";
import { formatHoursMinutes } from "../../utils/timesheetSummary";
import { DISTANCE_ALERT_METERS, formatDistance } from "../../utils/distance";
import type { HomeStackParamList } from "../../navigation/HomeStack";
import { frenchDateFormat } from "../../utils/frenchDate";

type Tab = "pending" | "done";

const dayFmt = frenchDateFormat({ day: "numeric", month: "short" });
const timeFmt = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });

// Vue de validation pour l'encadrement (chef d'équipe : son équipe ; RH/
// direction/admin : tout le monde) — la portée exacte est appliquée côté
// serveur, jamais dupliquée ici.
export function TimesheetValidationScreen() {
  const { colors, spacing, type } = useTheme();
  const { isDesktopWeb } = useResponsive();
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();

  const [tab, setTab] = useState<Tab>("pending");
  const [items, setItems] = useState<TimeEntry[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [refreshing, setRefreshing] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setState("loading");
      const res = await listTimeEntries({ pageSize: 100 });
      setItems(res.items.filter((e) => e.clockOut !== null));
      setState("ready");
    } catch {
      setState("error");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function handleValidate(entry: TimeEntry) {
    setActingId(entry.id);
    try {
      const updated = await validateTimeEntry(entry.id);
      setItems((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
    } catch (err) {
      Alert.alert("Validation impossible", extractErrorMessage(err));
    } finally {
      setActingId(null);
    }
  }

  const filtered = items.filter((e) => (tab === "pending" ? e.status === "PENDING" : e.status !== "PENDING"));

  const tableColumns: DataTableColumn<TimeEntry>[] = [
    {
      key: "employee",
      label: "Employé",
      flex: 2,
      render: (item) => (
        <Text style={[type.callout, { color: colors.ink, fontWeight: "600" }]} numberOfLines={1}>
          {item.user.firstName} {item.user.lastName}
        </Text>
      ),
    },
    {
      key: "date",
      label: "Date",
      render: (item) => (
        <Text style={[type.footnote, { color: colors.inkSecondary }]}>{dayFmt.format(new Date(item.clockIn))}</Text>
      ),
    },
    {
      key: "hours",
      label: "Horaire",
      render: (item) => (
        <View>
          <Text style={[type.footnote, { color: colors.inkSecondary }]}>
            {timeFmt.format(new Date(item.clockIn))} – {item.clockOut ? timeFmt.format(new Date(item.clockOut)) : "en cours"}
          </Text>
          {item.matchedMission && (
            <Text style={[type.caption, { color: colors.inkTertiary, marginTop: 2 }]}>
              Prévu {timeFmt.format(new Date(item.matchedMission.startTime))}–
              {timeFmt.format(new Date(item.matchedMission.endTime))} · {item.matchedMission.site.name}
            </Text>
          )}
        </View>
      ),
    },
    {
      key: "duration",
      label: "Durée",
      render: (item) => (
        <Text style={[type.footnote, { color: colors.inkSecondary }]}>{formatDuration(item.clockIn, item.clockOut)}</Text>
      ),
    },
    {
      key: "status",
      label: "Statut",
      render: (item) => <TimeEntryStatusBadge status={item.status} />,
    },
    {
      key: "proof",
      label: "Justificatif",
      render: (item) =>
        item.hasClockInPhoto || item.hasClockOutPhoto ? (
          <PressableScale
            onPress={() => navigation.navigate("TimeEntryDetail", { entryId: item.id })}
            style={{ flexDirection: "row", alignItems: "center" }}
          >
            <Ionicons name="camera-outline" size={16} color={colors.accent} />
            <Text style={[type.footnote, { color: colors.accent, marginLeft: 4 }]}>Voir</Text>
          </PressableScale>
        ) : (
          <Text style={[type.footnote, { color: colors.inkTertiary }]}>—</Text>
        ),
    },
    ...(tab === "pending"
      ? [
          {
            key: "actions",
            label: "",
            flex: 1.6,
            render: (item: TimeEntry) => (
              <View style={{ flexDirection: "row", gap: spacing.xs }}>
                <View style={{ flex: 1 }}>
                  <Button
                    label="Refuser"
                    variant="secondary"
                    size="md"
                    onPress={() => navigation.navigate("TimesheetReject", { entryId: item.id })}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Button label="Valider" size="md" loading={actingId === item.id} onPress={() => handleValidate(item)} />
                </View>
              </View>
            ),
          } as DataTableColumn<TimeEntry>,
        ]
      : []),
  ];

  return (
    <ScreenContainer style={{ paddingTop: spacing.md }}>
      <SegmentedControl
        value={tab}
        onChange={setTab}
        options={[
          { label: "En attente", value: "pending" },
          { label: "Traités", value: "done" },
        ]}
      />

      <View style={{ height: spacing.md }} />

      {state === "loading" && <StateView kind="loading" />}
      {state === "error" && <StateView kind="error" onRetry={load} />}
      {state === "ready" && filtered.length === 0 && (
        <StateView kind="empty" icon="time-outline" message="Rien à afficher ici pour le moment." />
      )}

      {state === "ready" && filtered.length > 0 && isDesktopWeb && (
        <DataTable columns={tableColumns} data={filtered} keyExtractor={(item) => item.id} />
      )}

      {state === "ready" && filtered.length > 0 && !isDesktopWeb && (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: spacing.xxl }}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.accent} />}
          renderItem={({ item, index }) => (
            <Animated.View entering={FadeInUp.delay(Math.min(index, 6) * 40).duration(280)}>
              <Card>
                <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
                  <View style={{ flex: 1, marginRight: spacing.sm }}>
                    <Text style={[type.headline, { color: colors.ink }]}>
                      {item.user.firstName} {item.user.lastName}
                    </Text>
                    <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4 }}>
                      <Ionicons name="calendar-outline" size={14} color={colors.inkTertiary} />
                      <Text style={[type.footnote, { color: colors.inkSecondary, marginLeft: 4 }]}>
                        {dayFmt.format(new Date(item.clockIn))} · {timeFmt.format(new Date(item.clockIn))} –{" "}
                        {item.clockOut ? timeFmt.format(new Date(item.clockOut)) : "en cours"} (
                        {formatDuration(item.clockIn, item.clockOut)})
                      </Text>
                    </View>
                    {item.matchedMission && (
                      <View style={{ flexDirection: "row", alignItems: "center", marginTop: 2 }}>
                        <Ionicons name="business-outline" size={12} color={colors.inkTertiary} />
                        <Text style={[type.caption, { color: colors.inkTertiary, marginLeft: 3 }]}>
                          Prévu {timeFmt.format(new Date(item.matchedMission.startTime))}–
                          {timeFmt.format(new Date(item.matchedMission.endTime))} sur {item.matchedMission.site.name}
                        </Text>
                      </View>
                    )}
                    {(() => {
                      const farDistance = [item.clockInDistanceMeters, item.clockOutDistanceMeters]
                        .filter((d): d is number => d != null && d > DISTANCE_ALERT_METERS)
                        .sort((a, b) => b - a)[0];
                      return farDistance != null ? (
                        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 2 }}>
                          <Ionicons name="warning-outline" size={12} color={colors.warning} />
                          <Text style={[type.caption, { color: colors.warning, marginLeft: 3 }]}>
                            Pointé à {formatDistance(farDistance)} du chantier prévu
                          </Text>
                        </View>
                      ) : null;
                    })()}
                    {item.isRetroactive && (
                      <View style={{ flexDirection: "row", alignItems: "center", marginTop: 2 }}>
                        <Ionicons name="time-outline" size={12} color={colors.purple} />
                        <Text style={[type.caption, { color: colors.purple, marginLeft: 3 }]}>Pointage différé (saisi après coup)</Text>
                      </View>
                    )}
                    {item.overtimeMinutes != null && (
                      <View style={{ flexDirection: "row", alignItems: "center", marginTop: 2 }}>
                        <Ionicons name="trending-up-outline" size={12} color={colors.warning} />
                        <Text style={[type.caption, { color: colors.warning, marginLeft: 3 }]}>
                          +{formatHoursMinutes(item.overtimeMinutes)} heures supp. au-delà de la mission
                        </Text>
                      </View>
                    )}
                    {item.comment && (
                      <Text style={[type.footnote, { color: colors.inkTertiary, marginTop: 4 }]} numberOfLines={2}>
                        {item.comment}
                      </Text>
                    )}
                    {(item.hasClockInPhoto || item.hasClockOutPhoto) && (
                      <PressableScale
                        onPress={() => navigation.navigate("TimeEntryDetail", { entryId: item.id })}
                        style={{ flexDirection: "row", alignItems: "center", marginTop: 6 }}
                      >
                        <Ionicons name="camera-outline" size={14} color={colors.accent} />
                        <Text style={[type.footnote, { color: colors.accent, marginLeft: 4 }]}>
                          Voir le justificatif (photo + position)
                        </Text>
                      </PressableScale>
                    )}
                  </View>
                  <TimeEntryStatusBadge status={item.status} />
                </View>

                {tab === "pending" && (
                  <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
                    <View style={{ flex: 1 }}>
                      <Button
                        label="Refuser"
                        variant="destructive"
                        size="md"
                        onPress={() => navigation.navigate("TimesheetReject", { entryId: item.id })}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Button
                        label="Valider"
                        size="md"
                        loading={actingId === item.id}
                        onPress={() => handleValidate(item)}
                      />
                    </View>
                  </View>
                )}
              </Card>
            </Animated.View>
          )}
        />
      )}
    </ScreenContainer>
  );
}
