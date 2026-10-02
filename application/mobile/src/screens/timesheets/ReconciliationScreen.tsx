import React, { useCallback, useState } from "react";
import { FlatList, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Animated, { FadeInUp } from "react-native-reanimated";
import { ScreenContainer } from "../../components/ScreenContainer";
import { StateView } from "../../components/StateView";
import { Card } from "../../components/Card";
import { PressableScale } from "../../components/PressableScale";
import { useTheme } from "../../theme/ThemeProvider";
import { getReconciliation } from "../../api/timesheets.api";
import type { ReconciliationRow } from "../../api/timesheets.api";
import { formatHoursMinutes } from "../../utils/timesheetSummary";
import { addDays, mondayOf, toLocalDateKey, formatWeekRange } from "../../utils/missionFormat";
import type { MenuStackParamList } from "../../navigation/MenuStack";

// Menu "Pointage vs mission" pour l'encadrement : pour chaque personne de la
// semaine, compare les heures pointées aux missions planifiées et signale
// d'un coup d'œil qui a un écart à examiner (vert = tout est cohérent et
// traité, rouge = un pointage en attente/refusé ou moins d'heures pointées
// que prévu). Toute la logique de calcul reste côté serveur — voir
// timesheets.service.ts `getReconciliation`.
export function ReconciliationScreen() {
  const { colors, spacing, radius, type } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<MenuStackParamList>>();

  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const [items, setItems] = useState<ReconciliationRow[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  const weekEnd = addDays(weekStart, 6);

  const load = useCallback(async () => {
    try {
      setState("loading");
      const res = await getReconciliation(toLocalDateKey(weekStart), toLocalDateKey(addDays(weekStart, 6)));
      setItems(res);
      setState("ready");
    } catch {
      setState("error");
    }
  }, [weekStart]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const anomalyCount = items.filter((r) => r.status === "ANOMALY").length;

  return (
    <ScreenContainer style={{ paddingTop: spacing.md }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm }}>
        <PressableScale onPress={() => setWeekStart((d) => addDays(d, -7))} style={{ padding: spacing.xs }}>
          <Ionicons name="chevron-back" size={22} color={colors.accent} />
        </PressableScale>
        <Text style={[type.headline, { color: colors.ink }]}>{formatWeekRange(weekStart, weekEnd)}</Text>
        <PressableScale onPress={() => setWeekStart((d) => addDays(d, 7))} style={{ padding: spacing.xs }}>
          <Ionicons name="chevron-forward" size={22} color={colors.accent} />
        </PressableScale>
      </View>

      {state === "ready" && items.length > 0 && (
        <Text style={[type.footnote, { color: anomalyCount > 0 ? colors.danger : colors.success, marginBottom: spacing.md }]}>
          {anomalyCount > 0
            ? `${anomalyCount} personne${anomalyCount > 1 ? "s" : ""} à vérifier sur cette semaine`
            : "Tout est cohérent sur cette semaine"}
        </Text>
      )}

      {state === "loading" && <StateView kind="loading" />}
      {state === "error" && <StateView kind="error" onRetry={load} />}
      {state === "ready" && items.length === 0 && (
        <StateView kind="empty" icon="checkmark-done-outline" message="Aucune mission ni pointage sur cette semaine." />
      )}

      {state === "ready" && items.length > 0 && (
        <FlatList
          data={items}
          keyExtractor={(item) => item.user.id}
          contentContainerStyle={{ paddingBottom: spacing.xxl }}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          renderItem={({ item, index }) => {
            const isAnomaly = item.status === "ANOMALY";
            const tone = isAnomaly ? colors.danger : colors.success;
            return (
              <Animated.View entering={FadeInUp.delay(Math.min(index, 6) * 30).duration(240)}>
                <PressableScale
                  onPress={() =>
                    navigation.navigate("ReconciliationDetail", {
                      userId: item.user.id,
                      fullName: `${item.user.firstName} ${item.user.lastName}`,
                      from: toLocalDateKey(weekStart),
                      to: toLocalDateKey(weekEnd),
                    })
                  }
                >
                  <Card style={{ flexDirection: "row", alignItems: "center" }}>
                    <View
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: radius.pill,
                        backgroundColor: tone,
                        marginRight: spacing.md,
                      }}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={[type.headline, { color: colors.ink }]}>
                        {item.user.firstName} {item.user.lastName}
                      </Text>
                      <Text style={[type.footnote, { color: colors.inkTertiary, marginTop: 2 }]}>
                        {formatHoursMinutes(item.workedMinutes)} pointées · {formatHoursMinutes(item.scheduledMinutes)} prévues
                        {item.missionsCount > 0 ? ` · ${item.missionsCount} mission${item.missionsCount > 1 ? "s" : ""}` : ""}
                      </Text>
                      {!!isAnomaly && (
                        <Text style={[type.caption, { color: colors.danger, marginTop: 3 }]}>
                          {item.rejectedCount > 0
                            ? "Pointage refusé à examiner"
                            : item.pendingCount > 0
                              ? "En attente de validation"
                              : "Moins d'heures pointées que prévu"}
                        </Text>
                      )}
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.inkTertiary} />
                  </Card>
                </PressableScale>
              </Animated.View>
            );
          }}
        />
      )}
    </ScreenContainer>
  );
}
