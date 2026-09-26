import React, { useCallback, useState } from "react";
import { FlatList, RefreshControl, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Animated, { FadeInUp } from "react-native-reanimated";
import { ScreenContainer } from "../../components/ScreenContainer";
import { StateView } from "../../components/StateView";
import { SegmentedControl } from "../../components/SegmentedControl";
import { Card } from "../../components/Card";
import { PressableScale } from "../../components/PressableScale";
import { ProblemStatusBadge } from "../../components/ProblemStatusBadge";
import { useTheme } from "../../theme/ThemeProvider";
import { listProblems } from "../../api/problems.api";
import type { Problem } from "../../api/problems.api";
import type { HomeStackParamList } from "../../navigation/HomeStack";

type Tab = "open" | "closed";

// Vue transverse (hors contexte d'une mission précise) : la portée exacte —
// tous les chantiers pour la RH/direction/admin, ses propres chantiers pour
// un chef d'équipe — est entièrement déterminée côté serveur.
export function ProblemsListScreen() {
  const { colors, spacing, type: typeScale } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();

  const [tab, setTab] = useState<Tab>("open");
  const [items, setItems] = useState<Problem[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setState("loading");
      const res = await listProblems();
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

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const filtered = items.filter((p) =>
    tab === "open" ? p.status === "NEW" || p.status === "IN_PROGRESS" : p.status === "RESOLVED" || p.status === "VALIDATED"
  );

  return (
    <ScreenContainer style={{ paddingTop: spacing.md }}>
      <SegmentedControl
        value={tab}
        onChange={setTab}
        options={[
          { label: "Ouverts", value: "open" },
          { label: "Résolus", value: "closed" },
        ]}
      />

      <View style={{ height: spacing.md }} />

      {state === "loading" && <StateView kind="loading" />}
      {state === "error" && <StateView kind="error" onRetry={load} />}
      {state === "ready" && filtered.length === 0 && (
        <StateView kind="empty" icon="warning-outline" message="Aucun signalement ici pour le moment." />
      )}

      {state === "ready" && filtered.length > 0 && (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: spacing.xxl }}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.accent} />}
          renderItem={({ item, index }) => (
            <Animated.View entering={FadeInUp.delay(Math.min(index, 6) * 45).duration(300)}>
              <PressableScale onPress={() => navigation.navigate("ProblemDetail", { problemId: item.id })}>
                <Card>
                  <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
                    <View style={{ flex: 1, marginRight: spacing.sm }}>
                      <View style={{ flexDirection: "row", alignItems: "center" }}>
                        <Ionicons
                          name={item.type === "MISSING_MATERIAL" ? "cube-outline" : "warning-outline"}
                          size={14}
                          color={colors.inkTertiary}
                        />
                        <Text style={[typeScale.footnote, { color: colors.inkTertiary, marginLeft: 4 }]}>
                          {item.site.name}
                          {item.mission ? ` · ${item.mission.title}` : ""}
                        </Text>
                      </View>
                      <Text style={[typeScale.headline, { color: colors.ink, marginTop: spacing.xxs }]} numberOfLines={2}>
                        {item.description}
                      </Text>
                    </View>
                    <ProblemStatusBadge status={item.status} />
                  </View>
                </Card>
              </PressableScale>
            </Animated.View>
          )}
        />
      )}
    </ScreenContainer>
  );
}
