import React, { useCallback, useState } from "react";
import { FlatList, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { StateView } from "../../components/StateView";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { AbsenceStatusBadge } from "../../components/AbsenceStatusBadge";
import { useTheme } from "../../theme/ThemeProvider";
import { listAbsences } from "../../api/absences.api";
import type { Absence } from "../../api/absences.api";
import type { HomeStackParamList } from "../../navigation/HomeStack";

const dateFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" });

const TYPE_LABELS: Record<Absence["type"], string> = {
  PAID_LEAVE: "Congé payé",
  SICK_LEAVE: "Maladie",
  UNPAID_LEAVE: "Sans solde",
  OTHER: "Autre",
};

function formatRange(start: string, end: string): string {
  const s = dateFmt.format(new Date(start));
  const e = dateFmt.format(new Date(end));
  return s === e ? s : `${s} → ${e}`;
}

export function MyAbsencesScreen() {
  const { colors, spacing, type } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();

  const [items, setItems] = useState<Absence[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  const load = useCallback(async () => {
    try {
      setState("loading");
      const res = await listAbsences({});
      setItems(res.items);
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

  return (
    <ScreenContainer style={{ paddingTop: spacing.md }}>
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
                    {formatRange(item.startDate, item.endDate)}
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
            </Card>
          )}
        />
      )}
    </ScreenContainer>
  );
}
