import React, { useCallback, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NavigationProp, ParamListBase } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { PressableScale } from "../../components/PressableScale";
import { ScreenContainer } from "../../components/ScreenContainer";
import { StateView } from "../../components/StateView";
import { KpiGrid } from "../../components/KpiGrid";
import { Card } from "../../components/Card";
import { Avatar } from "../../components/Avatar";
import { useTheme } from "../../theme/ThemeProvider";
import { getStatsOverview, getStatsTrends } from "../../api/stats.api";
import type { StatsOverview, StatsTrends } from "../../api/stats.api";
import type { KpiTile } from "../dashboard/useDashboardData";
import { useLiveFocusEffect, isBackgroundRefresh } from "../../sync/liveSync";

const CHART_HEIGHT = 64;

function WeeklyTrendChart({ weeks }: { weeks: StatsTrends["weeklyMissionTrends"] }) {
  const { colors, spacing, type } = useTheme();
  const maxCompleted = Math.max(1, ...weeks.map((w) => w.completed));

  return (
    <Card>
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: spacing.sm, height: CHART_HEIGHT }}>
        {weeks.map((w) => {
          const barHeight = Math.max(3, Math.round((w.completed / maxCompleted) * CHART_HEIGHT));
          return (
            <View key={w.weekStart} style={{ flex: 1, alignItems: "center" }}>
              <View
                style={{
                  width: "100%",
                  height: barHeight,
                  borderRadius: 4,
                  backgroundColor: w.completed > 0 ? colors.accent : colors.border,
                }}
              />
            </View>
          );
        })}
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: spacing.sm }}>
        <Text style={[type.caption, { color: colors.inkTertiary }]}>
          {formatShortDate(weeks[0]?.weekStart)}
        </Text>
        <Text style={[type.caption, { color: colors.inkTertiary }]}>
          {formatShortDate(weeks[weeks.length - 1]?.weekStart)}
        </Text>
      </View>
      <Text style={[type.footnote, { color: colors.inkSecondary, marginTop: spacing.sm }]}>
        Missions terminées par semaine · taux de validation sur la période :{" "}
        {periodValidationRate(weeks)}%
      </Text>
    </Card>
  );
}

// Taux sur l'ensemble des 8 semaines (validées / terminées). L'ancienne
// moyenne des taux hebdomadaires comptait les semaines sans aucune mission
// comme 0 % : une seule semaine à 33 % affichait « 4 % ».
function periodValidationRate(weeks: Array<{ completed: number; validated: number }>): number {
  const completed = weeks.reduce((sum, w) => sum + w.completed, 0);
  const validated = weeks.reduce((sum, w) => sum + w.validated, 0);
  return completed > 0 ? Math.round((validated / completed) * 100) : 0;
}

function formatShortDate(iso?: string): string {
  if (!iso) return "";
  const [, month, day] = iso.split("-");
  return `${day}/${month}`;
}

function ListRow({ label, value, leading }: { label: string; value: string; leading?: React.ReactNode }) {
  const { colors, spacing, type } = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.md,
        gap: spacing.sm,
      }}
    >
      {leading}
      <Text style={[type.body, { color: colors.ink, flex: 1 }]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[type.body, { color: colors.inkSecondary, fontWeight: "600" }]}>{value}</Text>
    </View>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  const { colors, spacing, type } = useTheme();
  return (
    <Text style={[type.overline, { color: colors.inkTertiary, marginTop: spacing.xl, marginBottom: spacing.sm }]}>
      {children}
    </Text>
  );
}

export function StatsOverviewScreen() {
  const { spacing, colors, type } = useTheme();
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const [overview, setOverview] = useState<StatsOverview | null>(null);
  const [trends, setTrends] = useState<StatsTrends | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const silent = isBackgroundRefresh();
    try {
      if (!silent) setState("loading");
      const data = await getStatsOverview();
      setOverview(data);
      setState("ready");
    } catch {
      if (!silent) setState("error");
      return;
    }
    // Les tendances sont un complément au tableau de bord, jamais une
    // exigence bloquante : un échec ici ne doit pas priver la direction des
    // compteurs de base déjà chargés avec succès.
    try {
      const trendsData = await getStatsTrends();
      setTrends(trendsData);
    } catch {
      setTrends(null);
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

  if (state === "loading") {
    return (
      <ScreenContainer>
        <StateView kind="loading" />
      </ScreenContainer>
    );
  }

  if (state === "error" || !overview) {
    return (
      <ScreenContainer>
        <StateView kind="error" onRetry={load} />
      </ScreenContainer>
    );
  }

  const activite: KpiTile[] = [
    { key: "sites", label: `Chantiers actifs sur ${overview.sites.total}`, value: String(overview.sites.active), tone: "purple", icon: "business-outline" },
    { key: "employees", label: `Employés actifs sur ${overview.employees.total}`, value: String(overview.employees.active), tone: "info", icon: "people-outline" },
  ];
  const missions: KpiTile[] = [
    { key: "upcoming", label: "À venir (7 jours)", value: String(overview.missions.upcoming7Days), tone: "accent", icon: "calendar-outline" },
    { key: "inProgress", label: "En cours", value: String(overview.missions.inProgress), tone: "warning", icon: "play" },
    { key: "completed", label: "Terminées", value: String(overview.missions.completed), tone: "success", icon: "checkmark-circle-outline" },
    { key: "cancelled", label: "Annulées", value: String(overview.missions.cancelled), tone: "danger", icon: "close-circle-outline" },
  ];
  const problems: KpiTile[] = [
    { key: "open", label: "Ouverts", value: String(overview.problems.open), tone: "danger", icon: "warning-outline" },
    { key: "missing", label: "Matériel manquant", value: String(overview.problems.missingMaterial), tone: "warning", icon: "cube-outline" },
    { key: "resolved", label: "Traités", value: String(overview.problems.resolved), tone: "accent", icon: "build-outline" },
    { key: "validated", label: "Validés", value: String(overview.problems.validated), tone: "success", icon: "checkmark-done-outline" },
  ];
  const toValidate = Math.max(0, overview.validations.completedMissions - overview.validations.validatedMissions);

  return (
    <ScreenContainer>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: spacing.lg, paddingBottom: spacing.xxxl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        <SectionTitle>ACTIVITÉ</SectionTitle>
        <KpiGrid tiles={activite} />

        <SectionTitle>MISSIONS</SectionTitle>
        <KpiGrid tiles={missions} />

        <SectionTitle>SIGNALEMENTS</SectionTitle>
        <KpiGrid tiles={problems} />

        <SectionTitle>VALIDATIONS</SectionTitle>
        {/* Raccourci direct vers les missions à valider (retour explicite du
            client) : le chiffre seul ne disait pas quoi faire ensuite. */}
        <PressableScale
          onPress={() =>
            navigation.navigate("Missions", { screen: "MissionsList", params: { initialTab: toValidate > 0 ? "toValidate" : "validated" } })
          }
          accessibilityRole="button"
          accessibilityLabel={toValidate > 0 ? `${toValidate} missions à valider` : "Voir les missions validées"}
        >
          <Card style={{ flexDirection: "row", alignItems: "center" }}>
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: toValidate > 0 ? colors.warningSoft : colors.successSoft,
              }}
            >
              <Ionicons
                name={toValidate > 0 ? "hourglass-outline" : "shield-checkmark-outline"}
                size={22}
                color={toValidate > 0 ? colors.warning : colors.success}
              />
            </View>
            <View style={{ flex: 1, marginLeft: spacing.md }}>
              <Text style={[type.title2, { color: toValidate > 0 ? colors.warning : colors.success }]}>
                {toValidate > 0 ? `${toValidate} à valider` : "Tout est validé"}
              </Text>
              <Text style={[type.footnote, { color: colors.inkSecondary, marginTop: 2 }]}>
                {`Sur ${overview.validations.completedMissions} mission${overview.validations.completedMissions > 1 ? "s" : ""} terminée${overview.validations.completedMissions > 1 ? "s" : ""}, ${overview.validations.validatedMissions} déjà validée${overview.validations.validatedMissions > 1 ? "s" : ""} par un responsable`}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.inkTertiary} />
          </Card>
        </PressableScale>

        {trends && trends.weeklyMissionTrends.length > 0 && (
          <>
            <SectionTitle>TENDANCE (8 SEMAINES)</SectionTitle>
            <WeeklyTrendChart weeks={trends.weeklyMissionTrends} />
          </>
        )}

        {trends && trends.topProblemSites.length > 0 && (
          <>
            <SectionTitle>CHANTIERS À SURVEILLER (30 JOURS)</SectionTitle>
            <Card padded={false}>
              {trends.topProblemSites.map((s, i) => (
                <View
                  key={s.siteId}
                  style={{ borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth, borderTopColor: colors.border }}
                >
                  <ListRow label={s.siteName} value={`${s.problemCount} signalement${s.problemCount > 1 ? "s" : ""}`} />
                </View>
              ))}
            </Card>
          </>
        )}

        {trends && trends.employeeLoad.items.length > 0 && (
          <>
            <SectionTitle>CHARGE PAR EMPLOYÉ ({trends.employeeLoad.windowDays} JOURS)</SectionTitle>
            <Card padded={false}>
              {trends.employeeLoad.items.slice(0, 10).map((e, i) => (
                <View
                  key={e.userId}
                  style={{ borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth, borderTopColor: colors.border }}
                >
                  <ListRow
                    leading={<Avatar user={{ id: e.userId, firstName: e.firstName, lastName: e.lastName, hasAvatar: e.hasAvatar }} size={32} />}
                    label={e.name}
                    value={`${e.completedMissions} mission${e.completedMissions > 1 ? "s" : ""}`}
                  />
                </View>
              ))}
            </Card>
          </>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
