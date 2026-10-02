import React, { useCallback, useState } from "react";
import { FlatList, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { StateView } from "../../components/StateView";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { PressableScale } from "../../components/PressableScale";
import { EmployeePickerModal } from "../../components/EmployeePickerModal";
import type { Availability } from "../../components/EmployeePickerModal";
import { useTheme } from "../../theme/ThemeProvider";
import { extractErrorMessage } from "../../api/client";
import { listMissions, listMissionsToReassign, replaceMissionAssignee } from "../../api/missions.api";
import type { MissionToReassign } from "../../api/missions.api";
import { listUsers } from "../../api/users.api";
import type { DirectoryUser } from "../../api/users.api";
import { listAbsences, ABSENCE_TYPE_LABELS } from "../../api/absences.api";
import type { AbsenceType } from "../../api/absences.api";
import { computeAvailability, weekBoundsKeys } from "../../utils/availability";
import { formatMissionDay, formatMissionTimeRange, toLocalDateKey } from "../../utils/missionFormat";
import { formatAbsencePeriod } from "../../utils/frenchDate";
import { Alert } from "../../utils/alert";
import type { PlanningStackParamList } from "../../navigation/PlanningStack";

type Target = { item: MissionToReassign; fromUserId: string; fromName: string };

// Missions à réaffecter : quand une absence approuvée (arrêt maladie,
// congé…) tombe sur des missions déjà prévues, le superviseur, la RH et la
// direction — pas seulement le créateur de la mission — confient chaque
// mission à un autre employé, en voyant qui est disponible à ce créneau.
export function ReassignMissionsScreen() {
  const { colors, spacing, type } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<PlanningStackParamList>>();
  const [items, setItems] = useState<MissionToReassign[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [staff, setStaff] = useState<DirectoryUser[]>([]);
  const [target, setTarget] = useState<Target | null>(null);
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [availability, setAvailability] = useState<Record<string, Availability>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setState("loading");
      const [list, employees, leads] = await Promise.all([
        listMissionsToReassign(),
        listUsers({ role: "EMPLOYEE", isActive: true }),
        listUsers({ role: "SITE_MANAGER", isActive: true }),
      ]);
      setItems(list);
      setStaff([...employees.items, ...leads.items]);
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

  async function openPicker(item: MissionToReassign, fromUserId: string, fromName: string) {
    setTarget({ item, fromUserId, fromName });
    setChosenId(null);
    setAvailability({});
    const start = new Date(item.mission.startTime);
    const dayKey = toLocalDateKey(start);
    const [weekStart, weekEnd] = weekBoundsKeys(start, toLocalDateKey);
    const [week, absences] = await Promise.all([
      listMissions({ from: weekStart, to: weekEnd, pageSize: 100 }).catch(() => null),
      listAbsences({ status: "APPROVED", from: dayKey, to: dayKey }).catch(() => null),
    ]);
    const weekMissions = (week?.items ?? []).filter((m) => m.status !== "CANCELLED" && m.id !== item.mission.id);
    setAvailability(
      computeAvailability({
        start,
        end: new Date(item.mission.endTime),
        dayMissions: weekMissions.filter((m) => toLocalDateKey(new Date(m.startTime)) === dayKey),
        weekMissions,
        absentIds: new Set((absences?.items ?? []).map((a) => a.userId)),
        people: staff,
      })
    );
  }

  async function confirm() {
    if (!target) return;
    if (!chosenId) {
      setTarget(null);
      return;
    }
    setSaving(true);
    try {
      await replaceMissionAssignee(target.item.mission.id, target.fromUserId, chosenId);
      setTarget(null);
      await load();
    } catch (err) {
      Alert.alert("Remplacement impossible", extractErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const candidates = target
    ? staff.filter((u) => u.id !== target.fromUserId && !target.item.mission.assignments.some((a) => a.userId === u.id))
    : [];

  return (
    <ScreenContainer style={{ paddingTop: spacing.md }}>
      {state === "loading" && <StateView kind="loading" />}
      {state === "error" && <StateView kind="error" onRetry={load} />}
      {state === "ready" && items.length === 0 && (
        <StateView kind="empty" icon="checkmark-circle-outline" message="Aucune mission à réaffecter : personne d'absent sur une mission prévue." />
      )}
      {state === "ready" && items.length > 0 && (
        <FlatList
          data={items}
          keyExtractor={(i) => i.mission.id}
          contentContainerStyle={{ paddingBottom: spacing.xxl }}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          ListHeaderComponent={
            <Text style={[type.footnote, { color: colors.inkSecondary, marginBottom: spacing.md }]}>
              Ces missions sont prévues avec une personne qui sera absente. Confiez-les à un autre employé : il est prévenu
              aussitôt, et la personne absente aussi.
            </Text>
          }
          renderItem={({ item }) => (
            <Card>
              <PressableScale onPress={() => navigation.navigate("MissionDetail", { missionId: item.mission.id })}>
                <Text style={[type.headline, { color: colors.ink }]}>{item.mission.title}</Text>
                <Text style={[type.footnote, { color: colors.inkSecondary, marginTop: 2 }]}>
                  {item.mission.site.name} · {formatMissionDay(item.mission.date)} · {formatMissionTimeRange(item.mission.startTime, item.mission.endTime)}
                </Text>
              </PressableScale>
              {item.absentees.map((a) => (
                <View key={a.user.id} style={{ marginTop: spacing.md }}>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Ionicons name="medkit-outline" size={16} color={colors.danger} />
                    <Text style={[type.callout, { color: colors.danger, marginLeft: 6, flex: 1, fontWeight: "600" }]}>
                      {a.user.firstName} {a.user.lastName} · {ABSENCE_TYPE_LABELS[a.absence.type as AbsenceType] ?? "Absence"}
                    </Text>
                  </View>
                  <Text style={[type.caption, { color: colors.inkTertiary, marginTop: 2, marginLeft: 22 }]}>
                    {formatAbsencePeriod(a.absence.startDate, a.absence.endDate)}
                    {a.isLead ? " · chef d'équipe de la mission" : ""}
                  </Text>
                  <View style={{ marginTop: spacing.sm }}>
                    <Button
                      label={`Remplacer ${a.user.firstName}`}
                      icon="swap-horizontal-outline"
                      size="md"
                      onPress={() => void openPicker(item, a.user.id, a.user.firstName)}
                    />
                  </View>
                </View>
              ))}
            </Card>
          )}
        />
      )}

      <EmployeePickerModal
        visible={!!target}
        title={target ? `Remplacer ${target.fromName}` : ""}
        confirmLabel={saving ? "Remplacement…" : chosenId ? "Confier la mission" : "Fermer"}
        employees={candidates}
        selectedIds={chosenId ? [chosenId] : []}
        availability={availability}
        onToggle={(id) => setChosenId((prev) => (prev === id ? null : id))}
        onClose={() => void confirm()}
        onCancel={() => setTarget(null)}
      />
    </ScreenContainer>
  );
}
