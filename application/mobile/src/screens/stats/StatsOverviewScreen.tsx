import React, { useCallback, useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { ScreenContainer } from "../../components/ScreenContainer";
import { StateView } from "../../components/StateView";
import { KpiGrid } from "../../components/KpiGrid";
import { Card } from "../../components/Card";
import { useTheme } from "../../theme/ThemeProvider";
import { getStatsOverview, getStatsTrends } from "../../api/stats.api";
import type { StatsOverview, StatsTrends } from "../../api/stats.api";
import type { KpiTile } from "../dashboard/useDashboardData";

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
        Missions terminées par semaine — taux de validation moyen :{" "}
        {Math.round(weeks.reduce((sum, w) => sum + w.validationRatePercent, 0) / Math.max(1, weeks.length))}%
      </Text>
    </Card>
  );
}

function formatShortDate(iso?: string): string {
  if (!iso) return "";
  const [, month, day] = iso.split("-");
  return `${day}/${month}`;
}

function ListRow({ label, value }: { label: string; value: string }) {
  const { colors, spacing, type } = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.md,
      }}
    >
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
  const [overview, setOverview] = useState<StatsOverview | null>(null);
  const [trends, setTrends] = useState<StatsTrends | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setState("loading");
      const data = await getStatsOverview();
      setOverview(data);
      setState("ready");
    } catch {
      setState("error");
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
    { key: "sites", label: `Chantiers actifs sur ${overview.sites.total}`, value: String(overview.sites.active), tone: "purple" },
    { key: "employees", label: `Employés actifs sur ${overview.employees.total}`, value: String(overview.employees.active), tone: "info" },
  ];
  const missions: KpiTile[] = [
    { key: "upcoming", label: "À venir (7 jours)", value: String(overview.missions.upcoming7Days), tone: "accent" },
    { key: "inProgress", label: "En cours", value: String(overview.missions.inProgress), tone: "warning" },
    { key: "completed", label: "Terminées", value: String(overview.missions.completed), tone: "success" },
    { key: "cancelled", label: "Annulées", value: String(overview.missions.cancelled), tone: "danger" },
  ];
  const problems: KpiTile[] = [
    { key: "open", label: "Ouverts", value: String(overview.problems.open), tone: "danger" },
    { key: "missing", label: "Matériel manquant", value: String(overview.problems.missingMaterial), tone: "warning" },
    { key: "resolved", label: "Traités", value: String(overview.problems.resolved), tone: "accent" },
    { key: "validated", label: "Validés", value: String(overview.problems.validated), tone: "success" },
  ];
  const validations: KpiTile[] = [
    {
      key: "rate",
      label: `${overview.validations.validatedMissions} / ${overview.validations.completedMissions} missions validées`,
      value: `${overview.validations.validationRatePercent}%`,
      tone: "success",
    },
  ];

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
        <KpiGrid tiles={validations} />

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
                  style={{ borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.border }}
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
                  style={{ borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.border }}
                >
                  <ListRow label={e.name} value={`${e.completedMissions} mission${e.completedMissions > 1 ? "s" : ""}`} />
                </View>
              ))}
            </Card>
          </>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
