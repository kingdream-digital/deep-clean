import React, { useCallback, useState } from "react";
import { FlatList, RefreshControl, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Animated, { FadeInUp } from "react-native-reanimated";
import { ScreenContainer } from "../../components/ScreenContainer";
import { StateView } from "../../components/StateView";
import { SegmentedControl } from "../../components/SegmentedControl";
import { Card } from "../../components/Card";
import { PressableScale } from "../../components/PressableScale";
import { ProblemStatusBadge } from "../../components/ProblemStatusBadge";
import { useTheme } from "../../theme/ThemeProvider";
import { useAuth } from "../../auth/AuthContext";
import { useResponsive } from "../../hooks/useResponsive";
import { listProblems } from "../../api/problems.api";
import type { Problem } from "../../api/problems.api";
import type { HomeStackParamList } from "../../navigation/HomeStack";
import { timeAgo } from "../../utils/timeAgo";
import { useLiveFocusEffect, isBackgroundRefresh } from "../../sync/liveSync";

type Tab = "open" | "closed";

// Vue transverse (hors contexte d'une mission précise) : la portée exacte —
// tous les chantiers pour la RH/direction/admin, ses propres chantiers pour
// un chef d'équipe — est entièrement déterminée côté serveur.
export function ProblemsListScreen() {
  const { colors, spacing, radius, type: typeScale } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const { user } = useAuth();
  const { isDesktopWeb } = useResponsive();

  const [tab, setTab] = useState<Tab>("open");
  const [items, setItems] = useState<Problem[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const silent = isBackgroundRefresh();
    try {
      if (!silent) setState("loading");
      const res = await listProblems();
      setItems(res.items);
      setState("ready");
    } catch {
      if (!silent) setState("error");
    }
  }, []);

  useLiveFocusEffect(
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
      {/* Même grand titre que les autres listes sur ordinateur (Chantiers,
          Missions, Comptes) — seule cette liste n'avait que le petit titre
          de la barre du haut. */}
      {!!isDesktopWeb && (
        <View style={{ marginBottom: spacing.lg }}>
          <Text style={[typeScale.title1, { color: colors.ink }]}>
            {user?.role === "EMPLOYEE" ? "Signalements" : "Problèmes"}
          </Text>
          {state === "ready" && (
            <Text style={[typeScale.subhead, { color: colors.inkSecondary, marginTop: spacing.xxs }]}>
              {filtered.length} {filtered.length > 1 ? "signalements" : "signalement"}{" "}
              {tab === "open" ? (filtered.length > 1 ? "ouverts" : "ouvert") : filtered.length > 1 ? "résolus" : "résolu"}
            </Text>
          )}
        </View>
      )}
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
                {/* Le problème lui-même d'abord, en titre ; où il a été
                    signalé ensuite, sur une ligne. L'ordre inverse faisait
                    passer l'adresse sur trois lignes avant un titre coupé
                    (« Plus de recharges de savon pour les … »). */}
                <Card>
                  <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
                    <View
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: radius.md,
                        backgroundColor: item.type === "MISSING_MATERIAL" ? colors.warningSoft : colors.dangerSoft,
                        alignItems: "center",
                        justifyContent: "center",
                        marginRight: spacing.md,
                      }}
                    >
                      <Ionicons
                        name={item.type === "MISSING_MATERIAL" ? "cube-outline" : "warning-outline"}
                        size={18}
                        color={item.type === "MISSING_MATERIAL" ? colors.warning : colors.danger}
                      />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[typeScale.headline, { color: colors.ink }]} numberOfLines={2}>
                        {item.description}
                      </Text>
                      <Text style={[typeScale.footnote, { color: colors.inkSecondary, marginTop: 3 }]} numberOfLines={1}>
                        {item.site.name}
                        {item.mission ? ` · ${item.mission.title}` : ""}
                      </Text>
                      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.sm }}>
                        <ProblemStatusBadge status={item.status} />
                        <Text style={[typeScale.caption, { color: colors.inkTertiary, flexShrink: 1, marginLeft: spacing.sm }]} numberOfLines={1}>
                          {item.reportedBy.id === user?.id ? "Vous" : `${item.reportedBy.firstName} ${item.reportedBy.lastName}`} · {timeAgo(item.createdAt)}
                        </Text>
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.inkTertiary} style={{ marginLeft: spacing.xs }} />
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
