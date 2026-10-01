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
import { AbsenceStatusBadge } from "../../components/AbsenceStatusBadge";
import { useTheme } from "../../theme/ThemeProvider";
import { useAuth } from "../../auth/AuthContext";
import { Alert } from "../../utils/alert";
import { cancelAbsence, listAbsences } from "../../api/absences.api";
import type { Absence } from "../../api/absences.api";
import { getLeaveBalance } from "../../api/leave.api";
import type { LeaveBalance } from "../../api/leave.api";
import { extractErrorMessage } from "../../api/client";
import type { HomeStackParamList } from "../../navigation/HomeStack";
import { formatDays, formatDaysWithUnit } from "../../utils/leaveDays";
import { formatAbsencePeriod } from "../../utils/frenchDate";


const TYPE_LABELS: Record<Absence["type"], string> = {
  PAID_LEAVE: "Congé payé",
  SICK_LEAVE: "Maladie",
  UNPAID_LEAVE: "Sans solde",
  OTHER: "Autre",
};

// Jours calendaires tels qu'enregistrés (voir formatAbsencePeriod) : lue à
// l'heure de Paris, la date de fin tombait jusqu'ici le lendemain.
function formatRange(start: string, end: string): string {
  return formatAbsencePeriod(start, end);
}

export function MyAbsencesScreen() {
  const { colors, spacing, type } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const { user } = useAuth();

  const [items, setItems] = useState<Absence[]>([]);
  const [balance, setBalance] = useState<LeaveBalance | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setState("loading");
      const [res, balanceRes] = await Promise.all([
        listAbsences({}),
        // Solde purement informatif ici — jamais bloquant si l'appel échoue
        // (compte tout juste créé, etc.).
        user ? getLeaveBalance(user.id).catch(() => null) : Promise.resolve(null),
      ]);
      setItems(res.items);
      setBalance(balanceRes);
      setState("ready");
    } catch {
      setState("error");
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  function handleCancel(absence: Absence) {
    Alert.alert("Annuler cette demande ?", undefined, [
      { text: "Retour", style: "cancel" },
      {
        text: "Annuler la demande",
        style: "destructive",
        onPress: async () => {
          setCancellingId(absence.id);
          try {
            await cancelAbsence(absence.id);
            await load();
          } catch (err) {
            Alert.alert("Annulation impossible", extractErrorMessage(err));
          } finally {
            setCancellingId(null);
          }
        },
      },
    ]);
  }

  // Un employé peut annuler sa propre demande en attente, ou déjà approuvée
  // tant qu'elle n'a pas commencé — même règle que le serveur (voir
  // absences.service.ts::cancelAbsence), pour ne jamais proposer un bouton
  // qui échouerait ensuite.
  function canCancel(absence: Absence): boolean {
    if (absence.status === "PENDING") return true;
    if (absence.status === "APPROVED") return new Date(absence.startDate) > new Date();
    return false;
  }

  return (
    <ScreenContainer style={{ paddingTop: spacing.md }}>
      {balance && (
        <Card style={{ marginBottom: spacing.lg }}>
          <Text style={[type.overline, { color: colors.inkTertiary, marginBottom: spacing.sm }]}>
            CONGÉS {balance.year}
          </Text>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <LeaveBalanceStat label="Acquis" value={balance.acquired} color={colors.ink} />
            <LeaveBalanceStat label="Pris" value={balance.taken} color={colors.inkSecondary} />
            <LeaveBalanceStat label="En attente" value={balance.pending} color={colors.warning} />
            <LeaveBalanceStat label="Restant" value={balance.remaining} color={colors.accent} />
          </View>
        </Card>
      )}

      <View style={{ marginBottom: spacing.lg }}>
        <Button label="Demander une absence" icon="add-circle-outline" onPress={() => navigation.navigate("AbsenceForm")} />
      </View>

      {state === "loading" && <StateView kind="loading" />}
      {state === "error" && <StateView kind="error" onRetry={load} />}
      {state === "ready" && items.length === 0 && (
        <StateView kind="empty" icon="calendar-outline" message="Aucune demande d'absence pour le moment." />
      )}

      {state === "ready" && items.length > 0 && (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: spacing.xxl }}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          renderItem={({ item }) => (
            <Card>
              <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
                <View style={{ flex: 1, marginRight: spacing.sm }}>
                  <Text style={[type.headline, { color: colors.ink }]}>{TYPE_LABELS[item.type]}</Text>
                  <Text style={[type.footnote, { color: colors.inkSecondary, marginTop: 2 }]}>
                    {formatRange(item.startDate, item.endDate)} · {formatDaysWithUnit(item.daysCount)}
                  </Text>
                  {item.reason && (
                    <Text style={[type.footnote, { color: colors.inkTertiary, marginTop: 4 }]}>{item.reason}</Text>
                  )}
                  {item.status === "REJECTED" && item.decisionNote && (
                    <View style={{ flexDirection: "row", alignItems: "flex-start", marginTop: spacing.sm }}>
                      <Ionicons name="information-circle-outline" size={14} color={colors.danger} style={{ marginTop: 1 }} />
                      <Text style={[type.footnote, { color: colors.danger, marginLeft: 4, flex: 1 }]}>{item.decisionNote}</Text>
                    </View>
                  )}
                </View>
                <AbsenceStatusBadge status={item.status} />
              </View>
              {canCancel(item) && (
                <PressableScale onPress={() => handleCancel(item)} disabled={cancellingId === item.id} style={{ marginTop: spacing.sm, alignSelf: "flex-start" }}>
                  <Text style={[type.footnote, { color: colors.danger, fontWeight: "600" }]}>
                    {cancellingId === item.id ? "Annulation..." : "Annuler cette demande"}
                  </Text>
                </PressableScale>
              )}
            </Card>
          )}
        />
      )}
    </ScreenContainer>
  );
}

function LeaveBalanceStat({ label, value, color }: { label: string; value: number; color: string }) {
  const { spacing, type } = useTheme();
  return (
    <View style={{ alignItems: "center", flex: 1 }}>
      <Text style={[type.title2, { color, fontWeight: "700" }]}>{formatDays(value)}</Text>
      <Text style={[type.caption, { color, opacity: 0.8, marginTop: spacing.xxs }]}>{label}</Text>
    </View>
  );
}
