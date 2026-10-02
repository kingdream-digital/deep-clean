import React, { useEffect, useCallback, useMemo, useState } from "react";
import { RefreshControl, SectionList, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
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
import {
  todayKey,
  formatMissionDay,
  formatMissionTimeRange,
  groupMissionsByDate,
  isMissionOverdue,
  relativeDayLabel,
  isMissionValidated,
} from "../../utils/missionFormat";
import { readCache, writeCache } from "../../offline/cache";
import { OnboardingTarget } from "../../onboarding/OnboardingTarget";
import { useLiveFocusEffect, isBackgroundRefresh } from "../../sync/liveSync";

// « Terminées » est scindé en deux (retour explicite du client : terminée et
// validée prêtaient à confusion) : « À valider » = travail fini en attente du
// contrôle d'un responsable, « Validées » = contrôlées.
export type MissionsTab = "upcoming" | "toValidate" | "validated" | "cancelled";
type Tab = MissionsTab;

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
    render: (item) => <StatusBadge status={item.status} overdue={isMissionOverdue(item)} validated={isMissionValidated(item)} />,
  },
];

export function MissionsListScreen() {
  const { colors, spacing, radius } = useTheme();
  const { user } = useAuth();
  const { isDesktopWeb } = useResponsive();
  const navigation = useNavigation<NativeStackNavigationProp<MissionsStackParamList>>();

  const route = useRoute<RouteProp<MissionsStackParamList, "MissionsList">>();
  const requestedTab = route.params?.initialTab;
  const [tab, setTab] = useState<Tab>(requestedTab ?? "upcoming");
  // Raccourci reçu alors que l'écran était déjà monté (onglet Missions déjà
  // ouvert) : on bascule, puis on efface le paramètre pour ne pas y revenir
  // de force à chaque retour sur l'écran.
  useEffect(() => {
    if (!requestedTab) return;
    setTab(requestedTab);
    navigation.setParams({ initialTab: undefined });
  }, [requestedTab, navigation]);
  const [items, setItems] = useState<Mission[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [refreshing, setRefreshing] = useState(false);
  const [offlineCachedAt, setOfflineCachedAt] = useState<string | null>(null);

  const canManage = user ? CAN_MANAGE_ROLES.includes(user.role) : false;

  // Regroupées par jour ("Aujourd'hui", "Demain", ...) plutôt qu'une simple
  // liste plate — retour explicite du client : rendre la vue "missions
  // prévues" plus lisible et moins austère. Ordre chronologique pour "à
  // venir", le plus récent d'abord pour "terminées"/"annulées" (même logique
  // que le `reverse()` déjà appliqué à `items` dans `load`).
  const sections = useMemo(() => {
    const groups = groupMissionsByDate(items);
    const ordered = tab === "upcoming" ? groups : [...groups].reverse();
    return ordered.map((g) => ({ key: g.key, label: g.label, data: g.missions }));
  }, [items, tab]);

  const load = useCallback(async (activeTab: Tab) => {
    const silent = isBackgroundRefresh();
    const cacheKey = `missions.${activeTab}`;
    try {
      if (!silent) setState("loading");
      let fetched: Mission[];
      if (activeTab === "upcoming") {
        const res = await listMissions({ from: todayKey() });
        fetched = res.items.filter((m) => m.status === "SCHEDULED" || m.status === "IN_PROGRESS");
      } else if (activeTab === "toValidate" || activeTab === "validated") {
        // Plus récentes d'abord, côté serveur : avec un tri croissant puis
        // `reverse()`, au-delà d'une page les missions les plus récentes
        // n'apparaissaient jamais.
        const res = await listMissions({ status: "COMPLETED", validated: activeTab === "validated", sort: "desc", pageSize: 100 });
        fetched = res.items;
      } else {
        const res = await listMissions({ status: "CANCELLED", sort: "desc", pageSize: 100 });
        fetched = res.items;
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
        if (!silent) setState("error");
      }
    }
  }, []);

  useLiveFocusEffect(
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
      {!!isDesktopWeb && (
        <View style={[styles.desktopHeader, { marginBottom: spacing.md }]}>
          <View>
            <Text style={{ fontSize: 28, fontWeight: "700", color: colors.ink }}>Missions</Text>
            <Text style={{ fontSize: 15, color: colors.inkSecondary, marginTop: 2 }}>
              {items.length} {items.length > 1 ? "missions" : "mission"}
            </Text>
          </View>
          {!!canManage && (
            <View style={{ width: 200 }}>
              <PressableScale onPress={() => navigation.navigate("MissionForm", undefined)}>
                <View style={[styles.desktopCreateBtn, { backgroundColor: colors.accentFill, borderRadius: 12 }]}>
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
            { label: "À valider", value: "toValidate" },
            { label: "Validées", value: "validated" },
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
          message={
            tab === "upcoming"
              ? "Aucune mission à venir."
              : tab === "toValidate"
                ? "Aucune mission en attente de validation."
                : "Aucune mission ici pour le moment."
          }
        />
      )}

      {state === "ready" && items.length > 0 && (
        <>
          {!!offlineCachedAt && <OfflineBanner cachedAt={offlineCachedAt} />}

          {isDesktopWeb ? (
            <DataTable
              columns={TABLE_COLUMNS}
              data={items}
              keyExtractor={(item) => item.id}
              onRowPress={(item) => navigation.navigate("MissionDetail", { missionId: item.id })}
            />
          ) : (
            <SectionList
              sections={sections}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ paddingBottom: spacing.xxxl }}
              stickySectionHeadersEnabled={false}
              ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
              SectionSeparatorComponent={() => <View style={{ height: spacing.xs }} />}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.accent} />}
              renderSectionHeader={({ section }) => (
                <MissionSectionHeader label={section.label} count={section.data.length} dateIso={section.data[0]?.date ?? section.key} />
              )}
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
            style={[styles.fabInner, { backgroundColor: colors.accentFill, borderRadius: radius.pill, shadowColor: colors.shadow }]}
          >
            <Ionicons name="add" size={26} color={colors.onAccent} />
          </PressableScale>
        </Animated.View>
      )}
    </ScreenContainer>
  );
}

function MissionSectionHeader({ label, count, dateIso }: { label: string; count: number; dateIso: string }) {
  const { colors, spacing, type } = useTheme();
  const relative = relativeDayLabel(dateIso);
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "baseline",
        justifyContent: "space-between",
        paddingTop: spacing.sm,
        paddingBottom: spacing.xs,
      }}
    >
      <Text style={[type.subhead, { color: relative ? colors.accent : colors.ink, fontWeight: "700" }]}>
        {relative ?? label}
      </Text>
      <Text style={[type.caption, { color: colors.inkTertiary }]}>
        {count} {count > 1 ? "missions" : "mission"}
      </Text>
    </View>
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
