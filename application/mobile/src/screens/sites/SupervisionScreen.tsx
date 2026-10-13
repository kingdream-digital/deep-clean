import React, { useCallback, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { StateView } from "../../components/StateView";
import { Card } from "../../components/Card";
import { PressableScale } from "../../components/PressableScale";
import { ProgressRing } from "../../components/ProgressRing";
import { useTheme } from "../../theme/ThemeProvider";
import { useAuth } from "../../auth/AuthContext";
import { useResponsive } from "../../hooks/useResponsive";
import { currentPeriod, getSupervision } from "../../api/sites.api";
import type { SiteHealth, Supervision, SupervisionSite } from "../../api/sites.api";
import { useLiveFocusEffect, isBackgroundRefresh } from "../../sync/liveSync";
import { periodLabel, shiftPeriod } from "./SiteYearPlanner";
import type { MenuStackParamList } from "../../navigation/MenuStack";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n > 1 ? many : one}`;

/**
 * Suivi de mes chantiers (retour explicite du client) : pour le superviseur,
 * tous les chantiers dont il est responsable sur un seul écran — ce qui a été
 * réalisé dans le mois, et ce qui ne va pas, chantiers à problème en tête et
 * en rouge. La RH et la direction y voient tous les chantiers.
 */
export function SupervisionScreen() {
  const { colors, spacing, radius, type } = useTheme();
  const { user } = useAuth();
  const { isDesktopWeb } = useResponsive();
  const navigation = useNavigation<NativeStackNavigationProp<MenuStackParamList>>();
  const [period, setPeriod] = useState(currentPeriod());
  const [data, setData] = useState<Supervision | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  const load = useCallback(async () => {
    const silent = isBackgroundRefresh();
    try {
      if (!silent && !data) setState("loading");
      setData(await getSupervision(period));
      setState("ready");
    } catch {
      if (!silent) setState("error");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  useLiveFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  if (state !== "ready" || !data) {
    return (
      <ScreenContainer>
        <StateView kind={state === "error" ? "error" : "loading"} onRetry={load} />
      </ScreenContainer>
    );
  }

  const t = data.totals;
  const isSupervisor = user?.role === "SUPERVISOR";
  const healthColor: Record<SiteHealth, { fg: string; bg: string; icon: keyof typeof Ionicons.glyphMap; label: string }> = {
    alert: { fg: colors.danger, bg: colors.dangerSoft, icon: "alert-circle", label: "À traiter" },
    attention: { fg: colors.warning, bg: colors.warningSoft, icon: "time", label: "À surveiller" },
    ok: { fg: colors.success, bg: colors.successSoft, icon: "checkmark-circle", label: "Tout va bien" },
  };
  const trend = t.completed - t.previousCompleted;
  const isCurrent = period === currentPeriod();

  const encouragement =
    t.sites === 0
      ? ""
      : t.sitesWithAlert === 0 && t.missed === 0 && t.openProblems === 0
        ? "Aucun problème en cours sur vos chantiers. Bravo à toute l'équipe !"
        : t.sitesWithAlert > 0
          ? `${plural(t.sitesWithAlert, "chantier demande", "chantiers demandent")} votre attention en priorité.`
          : "Quelques points à surveiller, rien d'urgent.";

  return (
    <ScreenContainer style={{ paddingTop: spacing.md }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[{ paddingBottom: spacing.xxxl }, isDesktopWeb && { maxWidth: 900, width: "100%", alignSelf: "center" }]}
      >
        {/* Mois affiché */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md }}>
          <PressableScale onPress={() => setPeriod(shiftPeriod(period, -1))} accessibilityLabel="Mois précédent" style={{ padding: spacing.xs }}>
            <Ionicons name="chevron-back" size={22} color={colors.accentText} />
          </PressableScale>
          <Text style={[type.headline, { color: colors.ink }]}>{periodLabel(period)}</Text>
          <PressableScale onPress={() => setPeriod(shiftPeriod(period, 1))} accessibilityLabel="Mois suivant" style={{ padding: spacing.xs }}>
            <Ionicons name="chevron-forward" size={22} color={colors.accentText} />
          </PressableScale>
        </View>

        {t.sites === 0 ? (
          <Card>
            <Text style={[type.callout, { color: colors.inkSecondary }]}>
              {isSupervisor
                ? "Aucun chantier ne vous est encore confié comme superviseur. Il apparaîtra ici dès qu'on vous désigne sur la fiche d'un chantier."
                : "Aucun chantier actif."}
            </Text>
          </Card>
        ) : (
          <>
            {/* Bilan du mois */}
            <Card style={{ marginBottom: spacing.md }}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <ProgressRing progress={(t.completionRate ?? 0) / 100} size={104} strokeWidth={10} color={colors.success}>
                  <Text style={[type.title2, { color: colors.ink, fontWeight: "700" }]}>{t.completionRate ?? 0} %</Text>
                  <Text style={[type.caption, { color: colors.inkTertiary }]}>réalisé</Text>
                </ProgressRing>
                <View style={{ flex: 1, marginLeft: spacing.md }}>
                  <Text style={[type.title3, { color: colors.ink, fontWeight: "700" }]}>{plural(t.completed, "intervention réalisée", "interventions réalisées")}</Text>
                  <Text style={[type.footnote, { color: colors.inkSecondary, marginTop: 2 }]}>
                    {t.target > 0 ? `sur ${t.target} prévues` : `sur ${t.scheduled} programmées`} · {plural(t.sites, "chantier")}
                  </Text>
                  {trend !== 0 && (
                    <View style={{ flexDirection: "row", alignItems: "center", marginTop: spacing.xs }}>
                      <Ionicons name={trend > 0 ? "trending-up" : "trending-down"} size={16} color={trend > 0 ? colors.success : colors.inkTertiary} />
                      <Text style={[type.footnote, { color: trend > 0 ? colors.success : colors.inkTertiary, marginLeft: 4, fontWeight: "600" }]}>
                        {trend > 0 ? "+" : ""}
                        {trend} par rapport au mois dernier{isCurrent ? " (à ce jour)" : ""}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
              {!!encouragement && (
                <Text style={[type.callout, { color: t.sitesWithAlert > 0 ? colors.danger : colors.success, marginTop: spacing.md, fontWeight: "600" }]}>{encouragement}</Text>
              )}
            </Card>

            {/* Compteurs : ce qui demande une action */}
            <View style={{ flexDirection: "row", gap: spacing.sm, marginBottom: spacing.lg }}>
              {[
                { n: t.missed, label: "non réalisées", tone: colors.danger, icon: "close-circle-outline" as const },
                { n: t.openProblems, label: "problèmes", tone: colors.warning, icon: "warning-outline" as const },
                { n: t.toValidate, label: "à valider", tone: colors.info, icon: "checkmark-done-outline" as const },
              ].map((k) => (
                <Card key={k.label} style={{ flex: 1, alignItems: "center", paddingVertical: spacing.md }}>
                  <Ionicons name={k.icon} size={20} color={k.n > 0 ? k.tone : colors.inkTertiary} />
                  <Text style={[type.title2, { color: k.n > 0 ? k.tone : colors.inkTertiary, fontWeight: "700", marginTop: 2 }]}>{k.n}</Text>
                  <Text style={[type.caption, { color: colors.inkSecondary, textAlign: "center" }]}>{k.label}</Text>
                </Card>
              ))}
            </View>

            <Text style={[type.overline, { color: colors.inkTertiary, marginBottom: spacing.sm }]}>
              {isSupervisor ? "MES CHANTIERS" : "TOUS LES CHANTIERS"} · {t.sitesOk}/{t.sites} SANS PROBLÈME
            </Text>
            {data.sites.map((site) => (
              <SiteRow key={site.id} site={site} health={healthColor[site.health]} showSupervisor={!isSupervisor} onPress={() => navigation.navigate("SiteDetail", { siteId: site.id })} />
            ))}
          </>
        )}
      </ScrollView>
    </ScreenContainer>
  );

  function SiteRow({ site, health, showSupervisor, onPress }: { site: SupervisionSite; health: { fg: string; bg: string; icon: keyof typeof Ionicons.glyphMap; label: string }; showSupervisor: boolean; onPress: () => void }) {
    const progress = site.completionRate ?? 0;
    return (
      <PressableScale onPress={onPress} accessibilityLabel={`${site.name}, ${health.label}`}>
        <Card style={{ marginBottom: spacing.sm, borderLeftWidth: 4, borderLeftColor: health.fg }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <View style={{ flex: 1 }}>
              <Text style={[type.headline, { color: colors.ink }]} numberOfLines={1}>
                {site.name}
              </Text>
              <Text style={[type.footnote, { color: colors.inkTertiary }]} numberOfLines={1}>
                {showSupervisor && site.supervisor ? `${site.supervisor.firstName} ${site.supervisor.lastName} · ` : ""}
                {site.completed}/{site.target ?? site.scheduled} réalisées
              </Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: health.bg, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 4 }}>
              <Ionicons name={health.icon} size={14} color={health.fg} />
              <Text style={[type.caption, { color: health.fg, fontWeight: "700", marginLeft: 4 }]}>{health.label}</Text>
            </View>
          </View>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.border, marginTop: spacing.sm, overflow: "hidden" }}>
            <View style={{ width: `${progress}%`, height: 6, backgroundColor: site.health === "alert" ? colors.danger : colors.success }} />
          </View>
          {site.alerts.length > 0 && (
            <View style={{ marginTop: spacing.sm, gap: 4 }}>
              {site.alerts.map((a) => (
                <View key={a.kind} style={{ flexDirection: "row", alignItems: "center" }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: a.kind === "missed" || a.kind === "problem" ? colors.danger : colors.warning, marginRight: spacing.xs }} />
                  <Text style={[type.footnote, { color: colors.inkSecondary }]}>{a.label}</Text>
                </View>
              ))}
            </View>
          )}
        </Card>
      </PressableScale>
    );
  }
}
