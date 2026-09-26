import React, { useCallback, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import NetInfo from "@react-native-community/netinfo";
import Animated, { FadeInUp } from "react-native-reanimated";
import { ScreenContainer } from "../../components/ScreenContainer";
import { StateView } from "../../components/StateView";
import { SegmentedControl } from "../../components/SegmentedControl";
import { MissionCard } from "../../components/MissionCard";
import { OfflineBanner } from "../../components/OfflineBanner";
import { PressableScale } from "../../components/PressableScale";
import { StatusBadge } from "../../components/StatusBadge";
import { DataTable, DataTableColumn } from "../../components/DataTable";
import { useTheme } from "../../theme/ThemeProvider";
import { useAuth } from "../../auth/AuthContext";
import { useResponsive } from "../../hooks/useResponsive";
import { listMissions } from "../../api/missions.api";
import type { Mission } from "../../api/missions.api";
import type { MissionsStackParamList } from "../../navigation/MissionsStack";
import { todayKey, formatMissionDay, formatMissionTimeRange } from "../../utils/missionFormat";
import { readCache, writeCache } from "../../offline/cache";
import { OnboardingTarget } from "../../onboarding/OnboardingTarget";

type Tab = "upcoming" | "completed" | "cancelled";

// Créer une mission est réservé aux rôles qui gèrent le planning — le chef
// d'équipe n'en fait plus partie (retour explicite du client).
const CAN_MANAGE_ROLES = ["SUPERVISOR", "HR", "DIRECTOR", "ADMIN"];

const TABLE_COLUMNS: DataTableColumn<Mission>[] = [
  {
    key: "title",
    label: "Mission",
    flex: 2,
    render: (item) => <MissionTitleCell item={item} />,
  },
  {
    key: "date",
    label: "Date",
    render: (item) => <MissionFootnoteCell text={formatMissionDay(item.date)} />,
  },
  {
    key: "time",
    label: "Horaire",
    render: (item) => <MissionFootnoteCell text={formatMissionTimeRange(item.startTime, item.endTime)} />,
  },
  {
    key: "team",
    label: "Équipe",
    render: (item) => <MissionFootnoteCell text={String(item.assignments.length)} />,
  },
  {
    key: "status",
    label: "Statut",
    render: (item) => <StatusBadge status={item.status} />,
  },
];

export function MissionsListScreen() {
  const { colors, spacing, radius } = useTheme();
  const { user } = useAuth();
  const { isDesktopWeb } = useResponsive();
  const navigation = useNavigation<NativeStackNavigationProp<MissionsStackParamList>>();

  const [tab, setTab] = useState<Tab>("upcoming");
  const [items, setItems] = useState<Mission[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [refreshing, setRefreshing] = useState(false);
  const [offlineCachedAt, setOfflineCachedAt] = useState<string | null>(null);

  const canManage = user ? CAN_MANAGE_ROLES.includes(user.role) : false;

  const load = useCallback(async (activeTab: Tab) => {
    const cacheKey = `missions.${activeTab}`;
    try {
      setState("loading");
      let fetched: Mission[];
      if (activeTab === "upcoming") {
        const res = await listMissions({ from: todayKey() });
        fetched = res.items.filter((m) => m.status === "SCHEDULED" || m.status === "IN_PROGRESS");
      } else if (activeTab === "completed") {
        const res = await listMissions({ status: "COMPLETED" });
        fetched = res.items.slice().reverse();
      } else {
        const res = await listMissions({ status: "CANCELLED" });
        fetched = res.items.slice().reverse();
      }
      setItems(fetched);
      setOfflineCachedAt(null);
      setState("ready");
      void writeCache(cacheKey, fetched);
    } catch {
      const net = await NetInfo.fetch();
      const cached = net.isConnected === false ? await readCache<Mission[]>(cacheKey) : null;
      if (cached) {
        setItems(cached.data);
        setOfflineCachedAt(cached.cachedAt);
        setState("ready");
      } else {
        setState("error");
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load(tab);
    }, [tab, load])
  );

  async function handleRefresh() {
    setRefreshing(true);
    await load(tab);
    setRefreshing(false);
  }

  return (
    <ScreenContainer style={{ paddingTop: spacing.md }}>
      {isDesktopWeb && (
        <View style={[styles.desktopHeader, { marginBottom: spacing.md }]}>
          <View>
            <Text style={{ fontSize: 28, fontWeight: "700", color: colors.ink }}>Missions</Text>
            <Text style={{ fontSize: 15, color: colors.inkSecondary, marginTop: 2 }}>
              {items.length} {items.length > 1 ? "missions" : "mission"}
            </Text>
          </View>
          {canManage && (
            <View style={{ width: 200 }}>
              <PressableScale onPress={() => navigation.navigate("MissionForm", undefined)}>
                <View style={[styles.desktopCreateBtn, { backgroundColor: colors.accent, borderRadius: 12 }]}>
                  <Ionicons name="add" size={18} color={colors.onAccent} />
                  <Text style={{ color: colors.onAccent, fontWeight: "600", marginLeft: 6, fontSize: 15 }}>
                    Nouvelle mission
                  </Text>
                </View>
              </PressableScale>
            </View>
          )}
        </View>
      )}

      <OnboardingTarget id="missions.filters">
        <SegmentedControl
          value={tab}
          onChange={setTab}
          options={[
            { label: "À venir", value: "upcoming" },
            { label: "Terminées", value: "completed" },
            { label: "Annulées", value: "cancelled" },
          ]}
        />
      </OnboardingTarget>

      <View style={{ height: spacing.md }} />

      {state === "loading" && <StateView kind="loading" />}
      {state === "error" && <StateView kind="error" onRetry={() => load(tab)} />}
      {state === "ready" && items.length === 0 && (
        <StateView
          kind="empty"
          icon="briefcase-outline"
          message={tab === "upcoming" ? "Aucune mission à venir." : "Aucune mission ici pour le moment."}
        />
      )}

      {state === "ready" && items.length > 0 && (
        <>
          {offlineCachedAt && <OfflineBanner cachedAt={offlineCachedAt} />}

          {isDesktopWeb ? (
            <DataTable
              columns={TABLE_COLUMNS}
              data={items}
              keyExtractor={(item) => item.id}
              onRowPress={(item) => navigation.navigate("MissionDetail", { missionId: item.id })}
            />
          ) : (
            <FlatList
              data={items}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ paddingBottom: spacing.xxxl }}
              ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.accent} />}
              renderItem={({ item, index }) => (
                <Animated.View entering={FadeInUp.delay(Math.min(index, 6) * 45).duration(300)}>
                  <MissionCard mission={item} onPress={() => navigation.navigate("MissionDetail", { missionId: item.id })} />
                </Animated.View>
              )}
            />
          )}
        </>
      )}

      {!isDesktopWeb && canManage && (
        <Animated.View entering={FadeInUp.duration(280)} style={styles.fab}>
          <PressableScale
            pressedScale={0.9}
            onPress={() => navigation.navigate("MissionForm", undefined)}
            accessibilityRole="button"
            accessibilityLabel="Nouvelle mission"
            style={[styles.fabInner, { backgroundColor: colors.accent, borderRadius: radius.pill, shadowColor: colors.shadow }]}
          >
            <Ionicons name="add" size={26} color={colors.onAccent} />
          </PressableScale>
        </Animated.View>
      )}
    </ScreenContainer>
  );
}

function MissionTitleCell({ item }: { item: Mission }) {
  const { colors, type } = useTheme();
  return (
    <View>
      <Text style={[type.callout, { color: colors.ink, fontWeight: "600" }]} numberOfLines={1}>
        {item.title}
      </Text>
      <Text style={[type.caption, { color: colors.inkTertiary }]} numberOfLines={1}>
        {item.site.name}
      </Text>
    </View>
  );
}

function MissionFootnoteCell({ text }: { text: string }) {
  const { colors, type } = useTheme();
  return (
    <Text style={[type.footnote, { color: colors.inkSecondary }]} numberOfLines={1}>
      {text}
    </Text>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    right: 20,
    bottom: 24,
  },
  fabInner: {
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  desktopHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  desktopCreateBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 11 },
});
