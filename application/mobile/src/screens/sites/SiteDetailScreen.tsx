import React, { useCallback, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { StateView } from "../../components/StateView";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { PressableScale } from "../../components/PressableScale";
import { useTheme } from "../../theme/ThemeProvider";
import { useAuth } from "../../auth/AuthContext";
import { getSite } from "../../api/sites.api";
import type { Site } from "../../api/sites.api";
import { listMissions } from "../../api/missions.api";
import type { Mission } from "../../api/missions.api";
import { listProblems } from "../../api/problems.api";
import type { Problem } from "../../api/problems.api";
import { formatMissionDay, formatMissionTimeRange, todayKey } from "../../utils/missionFormat";
import type { HomeStackParamList } from "../../navigation/HomeStack";

type Route = RouteProp<{ SiteDetail: { siteId: string } }, "SiteDetail">;

const MANAGE_ROLES = ["SUPERVISOR", "HR", "DIRECTOR", "ADMIN"];

// Fiche chantier — reprend la structure de la maquette validée (bannière,
// chef d'équipe, standards, consignes, prochaines missions, signalements)
// avec des données réelles à chaque section : aucune photo par chantier
// n'existe dans le modèle de données, la bannière reste donc une icône
// générique plutôt qu'une photo inventée.
export function SiteDetailScreen() {
  const { colors, spacing, type } = useTheme();
  const { user } = useAuth();
  const route = useRoute<Route>();
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const { siteId } = route.params;

  const [site, setSite] = useState<Site | null>(null);
  const [upcomingMissions, setUpcomingMissions] = useState<Mission[]>([]);
  const [openProblems, setOpenProblems] = useState<Problem[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  const load = useCallback(async () => {
    try {
      setState("loading");
      const [siteRes, missionsRes, problemsRes] = await Promise.all([
        getSite(siteId),
        listMissions({ siteId, from: todayKey(), pageSize: 5 }),
        listProblems({ siteId }),
      ]);
      setSite(siteRes);
      setUpcomingMissions(missionsRes.items.filter((m) => m.status !== "CANCELLED").slice(0, 5));
      setOpenProblems(problemsRes.items.filter((p) => p.status !== "VALIDATED").slice(0, 3));
      setState("ready");
    } catch {
      setState("error");
    }
  }, [siteId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  if (state === "loading") {
    return (
      <ScreenContainer>
        <StateView kind="loading" />
      </ScreenContainer>
    );
  }
  if (state === "error" || !site) {
    return (
      <ScreenContainer>
        <StateView kind="error" onRetry={load} />
      </ScreenContainer>
    );
  }

  const canManage = user ? MANAGE_ROLES.includes(user.role) : false;

  return (
    <ScreenContainer style={{ paddingHorizontal: 0 }}>
      <View style={{ height: 140 }}>
        <LinearGradient
          colors={colors.accentGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
        >
          <Ionicons name="business-outline" size={44} color="rgba(255,255,255,0.85)" />
        </LinearGradient>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        style={{ paddingHorizontal: spacing.lg }}
        contentContainerStyle={{ paddingTop: spacing.lg, paddingBottom: spacing.xxxl }}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
          <Text style={[type.title1, { color: colors.ink, flex: 1, marginRight: spacing.sm }]}>{site.name}</Text>
          <View
            style={{
              paddingHorizontal: spacing.sm,
              paddingVertical: 4,
              borderRadius: 999,
              backgroundColor: site.isActive ? colors.successSoft : colors.neutralSoft,
            }}
          >
            <Text style={[type.caption, { color: site.isActive ? colors.success : colors.neutral, fontWeight: "600" }]}>
              {site.isActive ? "Actif" : "Inactif"}
            </Text>
          </View>
        </View>
        <Text style={[type.subhead, { color: colors.inkSecondary, marginTop: 4 }]}>{site.address}</Text>

        <Text style={[type.overline, { color: colors.inkTertiary, marginTop: spacing.xl, marginBottom: spacing.sm }]}>
          CHEF D'ÉQUIPE
        </Text>
        {site.manager ? (
          <PressableScale onPress={() => navigation.navigate("UserDetail", { userId: site.manager!.id })}>
            <Card style={{ flexDirection: "row", alignItems: "center" }}>
              <View
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 999,
                  backgroundColor: colors.purpleSoft,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={[type.footnote, { color: colors.purple, fontWeight: "700" }]}>
                  {site.manager.firstName[0]}
                  {site.manager.lastName[0]}
                </Text>
              </View>
              <View style={{ marginLeft: spacing.sm, flex: 1 }}>
                <Text style={[type.callout, { color: colors.ink, fontWeight: "600" }]}>
                  {site.manager.firstName} {site.manager.lastName}
                </Text>
                <Text style={[type.caption, { color: colors.inkTertiary }]}>Chef d'équipe</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.inkTertiary} />
            </Card>
          </PressableScale>
        ) : (
          <Card>
            <Text style={[type.callout, { color: colors.inkSecondary }]}>Aucun chef d'équipe assigné</Text>
          </Card>
        )}

        {/* Superviseur du chantier — retour explicite du client : interlocuteur
            fixe, distinct du chef d'équipe ci-dessus qui peut varier d'une
            mission à l'autre (voir MissionDetailScreen "Chef d'équipe"). */}
        <Text style={[type.overline, { color: colors.inkTertiary, marginTop: spacing.lg, marginBottom: spacing.sm }]}>
          SUPERVISEUR DU CHANTIER
        </Text>
        {site.supervisor ? (
          <PressableScale onPress={() => navigation.navigate("UserDetail", { userId: site.supervisor!.id })}>
            <Card style={{ flexDirection: "row", alignItems: "center" }}>
              <View
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 999,
                  backgroundColor: colors.accentSoft,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={[type.footnote, { color: colors.accent, fontWeight: "700" }]}>
                  {site.supervisor.firstName[0]}
                  {site.supervisor.lastName[0]}
                </Text>
              </View>
              <View style={{ marginLeft: spacing.sm, flex: 1 }}>
                <Text style={[type.callout, { color: colors.ink, fontWeight: "600" }]}>
                  {site.supervisor.firstName} {site.supervisor.lastName}
                </Text>
                <Text style={[type.caption, { color: colors.inkTertiary }]}>Superviseur</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.inkTertiary} />
            </Card>
          </PressableScale>
        ) : (
          <Card>
            <Text style={[type.callout, { color: colors.inkSecondary }]}>Aucun superviseur assigné</Text>
          </Card>
        )}

        <Text style={[type.overline, { color: colors.inkTertiary, marginTop: spacing.lg, marginBottom: spacing.sm }]}>
          STANDARD DE NETTOYAGE
        </Text>
        <PressableScale onPress={() => navigation.navigate("StandardsList", { siteId: site.id, siteName: site.name })}>
          <Card style={{ flexDirection: "row", alignItems: "center" }}>
            <View
              style={{
                width: 34,
                height: 34,
                borderRadius: 11,
                backgroundColor: colors.dangerSoft,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="document-text-outline" size={16} color={colors.danger} />
            </View>
            <View style={{ marginLeft: spacing.sm, flex: 1 }}>
              <Text style={[type.callout, { color: colors.ink, fontWeight: "600" }]}>Standards de nettoyage</Text>
              <Text style={[type.caption, { color: colors.inkTertiary }]}>Consulter les standards de ce chantier</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.inkTertiary} />
          </Card>
        </PressableScale>

        {site.description ? (
          <>
            <Text style={[type.overline, { color: colors.inkTertiary, marginTop: spacing.lg, marginBottom: spacing.sm }]}>
              CONSIGNES
            </Text>
            <Card>
              <Text style={[type.callout, { color: colors.ink, lineHeight: 20 }]}>{site.description}</Text>
            </Card>
          </>
        ) : null}

        <Text style={[type.overline, { color: colors.inkTertiary, marginTop: spacing.lg, marginBottom: spacing.sm }]}>
          PROCHAINES MISSIONS
        </Text>
        {upcomingMissions.length === 0 ? (
          <Card>
            <Text style={[type.callout, { color: colors.inkSecondary }]}>Aucune mission à venir sur ce chantier.</Text>
          </Card>
        ) : (
          <Card padded={false}>
            {upcomingMissions.map((mission, index) => (
              <PressableScale key={mission.id} onPress={() => navigation.navigate("MissionDetail", { missionId: mission.id })}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: spacing.md,
                    borderTopWidth: index === 0 ? 0 : 1,
                    borderTopColor: colors.border,
                  }}
                >
                  <View style={{ flex: 1, marginRight: spacing.sm }}>
                    <Text style={[type.callout, { color: colors.ink, fontWeight: "600" }]} numberOfLines={1}>
                      {formatMissionDay(mission.date)}
                    </Text>
                    <Text style={[type.footnote, { color: colors.inkSecondary, marginTop: 1 }]} numberOfLines={1}>
                      {formatMissionTimeRange(mission.startTime, mission.endTime)} · {mission.title}
                    </Text>
                  </View>
                  <MissionStatusPill status={mission.status} />
                </View>
              </PressableScale>
            ))}
          </Card>
        )}

        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.lg, marginBottom: spacing.sm }}>
          <Text style={[type.overline, { color: colors.inkTertiary }]}>SIGNALEMENTS</Text>
          <PressableScale onPress={() => navigation.navigate("ProblemsList")}>
            <Text style={[type.footnote, { color: colors.accent, fontWeight: "600" }]}>Voir tout</Text>
          </PressableScale>
        </View>
        {openProblems.length === 0 ? (
          <Card>
            <Text style={[type.callout, { color: colors.inkSecondary }]}>Aucun signalement en cours sur ce chantier.</Text>
          </Card>
        ) : (
          <View style={{ gap: spacing.sm }}>
            {openProblems.map((problem) => (
              <PressableScale key={problem.id} onPress={() => navigation.navigate("ProblemDetail", { problemId: problem.id })}>
                <Card style={{ flexDirection: "row", alignItems: "center" }}>
                  <View
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 11,
                      backgroundColor: colors.warningSoft,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Ionicons name="alert-circle-outline" size={16} color={colors.warning} />
                  </View>
                  <View style={{ marginLeft: spacing.sm, flex: 1 }}>
                    <Text style={[type.callout, { color: colors.ink, fontWeight: "600" }]} numberOfLines={1}>
                      {problem.description}
                    </Text>
                    <Text style={[type.caption, { color: colors.inkTertiary, marginTop: 1 }]}>
                      Signalé {formatMissionDay(problem.createdAt)}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.inkTertiary} />
                </Card>
              </PressableScale>
            ))}
          </View>
        )}

        {canManage && (
          <View style={{ marginTop: spacing.xl }}>
            <Button label="Modifier le chantier" variant="secondary" onPress={() => navigation.navigate("SiteForm", { siteId: site.id })} />
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

function MissionStatusPill({ status }: { status: Mission["status"] }) {
  const { colors, type } = useTheme();
  const tone: Record<Mission["status"], { bg: string; fg: string; label: string }> = {
    SCHEDULED: { bg: colors.neutralSoft, fg: colors.neutral, label: "À venir" },
    IN_PROGRESS: { bg: colors.successSoft, fg: colors.success, label: "En cours" },
    COMPLETED: { bg: colors.accentSoft, fg: colors.accent, label: "Terminée" },
    CANCELLED: { bg: colors.dangerSoft, fg: colors.danger, label: "Annulée" },
  };
  const t = tone[status];
  return (
    <View style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: t.bg, flexShrink: 0 }}>
      <Text style={[type.caption, { color: t.fg, fontWeight: "600" }]}>{t.label}</Text>
    </View>
  );
}
