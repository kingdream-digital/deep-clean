import React, { useCallback, useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { PressableScale } from "../../components/PressableScale";
import { StateView } from "../../components/StateView";
import { KpiGrid } from "../../components/KpiGrid";
import { useTheme } from "../../theme/ThemeProvider";
import { useAuth } from "../../auth/AuthContext";
import { getCommercialDashboard } from "../../api/commercialDashboard.api";
import type { CommercialDashboard } from "../../api/commercialDashboard.api";
import type { KpiTile } from "../dashboard/useDashboardData";
import type { MenuStackParamList } from "../../navigation/MenuStack";

interface CommercialEntry {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  message: string;
  screen: "ProspectsList" | "ClientsList" | "QuotesList" | "InvoicesList";
}

// Facturation réservée à RH/Direction/Admin (cahier des charges §1-3) — le
// Superviseur n'y figure pas, contrairement aux prospects/clients/devis.
const INVOICE_ACCESS_ROLES = ["HR", "DIRECTOR", "ADMIN"];

// Point d'entrée du module commercial (cahier des charges "Module commercial
// / devis / chantiers / facturation", §5) — Prospects, Clients, Devis et
// Factures ; les chantiers commerciaux se gèrent depuis la fiche chantier
// elle-même (voir SiteDetailScreen), sans jamais automatiser la création de
// mission ou de planning (le client final n'a lui-même jamais accès à
// DeepClean, voir §4).
const ENTRIES: CommercialEntry[] = [
  { icon: "person-add-outline", label: "Prospects", message: "Prospection, suivi et relances", screen: "ProspectsList" },
  { icon: "briefcase-outline", label: "Clients", message: "Coordonnées, historique commercial", screen: "ClientsList" },
  { icon: "document-text-outline", label: "Devis", message: "Créer, envoyer, relancer, suivre l'acceptation", screen: "QuotesList" },
  { icon: "receipt-outline", label: "Factures", message: "Préparer, envoyer, suivre les paiements", screen: "InvoicesList" },
];

const currencyFmt = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const periodFmt = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" });

// Même style de titre de section que le tableau de bord Statistiques
// (StatsOverviewScreen) — cohérence visuelle entre les deux écrans plutôt
// qu'un habillage inventé pour ce seul écran.
function SectionTitle({ icon, tint, children }: { icon: keyof typeof Ionicons.glyphMap; tint: string; children: React.ReactNode }) {
  const { colors, spacing, type } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", marginTop: spacing.xl, marginBottom: spacing.sm }}>
      <Ionicons name={icon} size={13} color={tint} style={{ marginRight: 6 }} />
      <Text style={[type.overline, { color: colors.inkTertiary }]}>{children}</Text>
    </View>
  );
}

// Barre segmentée façon "répartition" (Apple Santé/Batterie) : une seule
// bande arrondie divisée au prorata de chaque valeur — lecture d'ensemble
// immédiate là où 4 chiffres isolés demandent de comparer soi-même.
function DistributionBar({ segments }: { segments: { value: number; color: string }[] }) {
  const { colors, radius } = useTheme();
  const total = segments.reduce((sum, s) => sum + s.value, 0);

  return (
    <View style={{ flexDirection: "row", height: 10, borderRadius: radius.pill, overflow: "hidden", backgroundColor: colors.surfaceAlt }}>
      {total === 0
        ? null
        : segments
            .filter((s) => s.value > 0)
            .map((s, i) => <View key={i} style={{ flex: s.value, backgroundColor: s.color }} />)}
    </View>
  );
}

// Barre de progression simple (une seule valeur / un objectif) — même
// technique que le graphique de tendance hebdomadaire du tableau de bord
// Statistiques (barres en `View` dimensionnées en %), pas de librairie de
// graphiques supplémentaire pour un seul indicateur.
function ProgressBar({ ratio, color }: { ratio: number; color: string }) {
  const { colors, radius } = useTheme();
  const pct = Math.max(0, Math.min(1, ratio));
  return (
    <View style={{ height: 8, borderRadius: radius.pill, overflow: "hidden", backgroundColor: colors.surfaceAlt }}>
      <View style={{ width: `${pct * 100}%`, height: "100%", borderRadius: radius.pill, backgroundColor: color }} />
    </View>
  );
}

function HeroStat({
  icon,
  tint,
  value,
  label,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
  value: string;
  label: string;
}) {
  const { colors, spacing, radius, type } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: radius.md,
          backgroundColor: tint + "1F",
          alignItems: "center",
          justifyContent: "center",
          marginRight: spacing.md,
        }}
      >
        <Ionicons name={icon} size={20} color={tint} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[type.title2, { color: colors.ink }]}>{value}</Text>
        <Text style={[type.footnote, { color: colors.inkSecondary, marginTop: 1 }]}>{label}</Text>
      </View>
    </View>
  );
}

export function CommercialHomeScreen() {
  const { colors, spacing, radius, type } = useTheme();
  const { user } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<MenuStackParamList>>();
  const entries = ENTRIES.filter((e) => e.screen !== "InvoicesList" || (user && INVOICE_ACCESS_ROLES.includes(user.role)));

  const [dashboard, setDashboard] = useState<CommercialDashboard | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setState("loading");
      setDashboard(await getCommercialDashboard());
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

  const commercialTiles: KpiTile[] | null = dashboard
    ? [
        { key: "prospects", label: "Prospects en cours", value: String(dashboard.commercial.activeProspects), tone: "neutral", icon: "person-add-outline" },
        { key: "inProgress", label: "Devis en cours", value: String(dashboard.commercial.quotesInProgress), tone: "accent", icon: "document-text-outline" },
        { key: "toFollowUp", label: "Devis à relancer", value: String(dashboard.commercial.quotesToFollowUp), tone: "warning", icon: "alarm-outline" },
        { key: "accepted", label: "Devis acceptés", value: String(dashboard.commercial.quotesAccepted), tone: "success", icon: "checkmark-circle-outline" },
        { key: "rejected", label: "Devis refusés", value: String(dashboard.commercial.quotesRejected), tone: "danger", icon: "close-circle-outline" },
      ]
    : null;

  const sitesTiles: KpiTile[] | null = dashboard
    ? [
        {
          key: "active",
          label: user?.role === "SUPERVISOR" ? "Mes chantiers actifs" : "Chantiers actifs",
          value: String(dashboard.sites.activeSites),
          tone: "neutral",
          icon: "business-outline",
        },
        { key: "planned", label: "Prestations prévues", value: String(dashboard.sites.plannedVisits), tone: "neutral", icon: "calendar-outline" },
        { key: "completed", label: "Réalisées", value: String(dashboard.sites.completedVisits), tone: "success", icon: "checkmark-circle-outline" },
        { key: "remaining", label: "Restantes", value: String(dashboard.sites.remainingVisits), tone: "warning", icon: "time-outline" },
      ]
    : null;

  const invoicing = dashboard?.invoicing ?? null;
  const invoicingTiles: KpiTile[] | null = invoicing
    ? [
        { key: "toPrepare", label: "À préparer", value: String(invoicing.toPrepare), tone: "neutral", icon: "create-outline" },
        { key: "validated", label: "Validées", value: String(invoicing.validated), tone: "info", icon: "shield-checkmark-outline" },
        { key: "sent", label: "Envoyées", value: String(invoicing.sent), tone: "accent", icon: "paper-plane-outline" },
        { key: "paid", label: "Payées", value: String(invoicing.paid), tone: "success", icon: "cash-outline" },
      ]
    : null;

  const completionRatio = dashboard && dashboard.sites.plannedVisits > 0 ? dashboard.sites.completedVisits / dashboard.sites.plannedVisits : 0;

  return (
    <ScreenContainer>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: spacing.lg, paddingBottom: spacing.xxl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        <Text style={[type.largeTitle, { color: colors.ink, marginBottom: spacing.xs }]}>Commercial</Text>
        <Text style={[type.footnote, { color: colors.inkSecondary, marginBottom: spacing.lg }]}>
          Le client final ne reçoit que des devis/factures par email — il n'a jamais accès à DeepClean.
        </Text>

        {state === "loading" && !dashboard && <StateView kind="loading" />}
        {state === "error" && !dashboard && <StateView kind="error" onRetry={load} />}

        {dashboard && commercialTiles && sitesTiles && (
          <>
            <SectionTitle icon="trending-up-outline" tint={colors.accent}>
              {user?.role === "SUPERVISOR" ? "MES PROSPECTS & DEVIS" : "COMMERCIAL"}
            </SectionTitle>
            <KpiGrid tiles={commercialTiles} />

            <SectionTitle icon="business-outline" tint={colors.warning}>
              {`CHANTIERS · ${periodFmt.format(new Date(`${dashboard.sites.period}-01`))}`}
            </SectionTitle>
            <KpiGrid tiles={sitesTiles} />

            {dashboard.sites.plannedVisits > 0 && (
              <Card style={{ marginTop: spacing.sm }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: spacing.sm }}>
                  <Text style={[type.footnote, { color: colors.inkSecondary }]}>Avancement du mois</Text>
                  <Text style={[type.footnote, { color: colors.ink, fontWeight: "700" }]}>{Math.round(completionRatio * 100)}%</Text>
                </View>
                <ProgressBar ratio={completionRatio} color={colors.success} />
              </Card>
            )}

            {dashboard.sites.sitesNeedingAttention.length > 0 && (
              <Card padded={false} style={{ marginTop: spacing.sm }}>
                {dashboard.sites.sitesNeedingAttention.map((site, i) => (
                  <PressableScale key={site.siteId} onPress={() => navigation.navigate("SiteDetail", { siteId: site.siteId })}>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        paddingVertical: spacing.sm,
                        paddingHorizontal: spacing.md,
                        borderTopWidth: i === 0 ? 0 : 1,
                        borderTopColor: colors.border,
                      }}
                    >
                      <View
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: radius.sm,
                          backgroundColor: colors.warningSoft,
                          alignItems: "center",
                          justifyContent: "center",
                          marginRight: spacing.sm,
                        }}
                      >
                        <Ionicons name="alert" size={14} color={colors.warning} />
                      </View>
                      <Text style={[type.footnote, { color: colors.ink, flex: 1, fontWeight: "600" }]} numberOfLines={1}>
                        {site.siteName}
                      </Text>
                      <Text style={[type.footnote, { color: colors.warning, fontWeight: "700" }]}>{site.remainingVisits} restantes</Text>
                      <Ionicons name="chevron-forward" size={16} color={colors.inkTertiary} style={{ marginLeft: 6 }} />
                    </View>
                  </PressableScale>
                ))}
              </Card>
            )}

            {invoicing && invoicingTiles && (
              <>
                <SectionTitle icon="receipt-outline" tint={colors.info}>
                  FACTURATION
                </SectionTitle>
                <KpiGrid tiles={invoicingTiles} />

                <Card style={{ marginTop: spacing.sm }}>
                  <DistributionBar
                    segments={[
                      { value: invoicing.toPrepare, color: colors.neutral },
                      { value: invoicing.validated, color: colors.info },
                      { value: invoicing.sent, color: colors.accent },
                      { value: invoicing.paid, color: colors.success },
                    ]}
                  />
                  <View style={{ height: 1, backgroundColor: colors.border, marginVertical: spacing.md }} />
                  <HeroStat
                    icon="cash-outline"
                    tint={colors.success}
                    value={`${currencyFmt.format(invoicing.projectedMonthlyRevenueHt)} HT`}
                    label="CA prévisionnel mensuel (devis acceptés)"
                  />
                </Card>
              </>
            )}
          </>
        )}

        <Text style={[type.overline, { color: colors.inkTertiary, marginTop: spacing.xl, marginBottom: spacing.sm }]}>ACCÈS RAPIDE</Text>
        <Card padded={false}>
          {entries.map((entry, index) => (
            <PressableScale key={entry.screen} onPress={() => navigation.navigate(entry.screen)}>
              <View
                style={[
                  { flexDirection: "row", alignItems: "center", paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
                  index > 0 && { borderTopWidth: 1, borderTopColor: colors.border },
                ]}
              >
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: radius.md,
                    backgroundColor: colors.accentSoft,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons name={entry.icon} size={20} color={colors.accent} />
                </View>
                <View style={{ marginLeft: spacing.md, flex: 1 }}>
                  <Text style={[type.headline, { color: colors.ink }]}>{entry.label}</Text>
                  <Text style={[type.footnote, { color: colors.inkTertiary, marginTop: 2 }]} numberOfLines={1}>
                    {entry.message}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.inkTertiary} />
              </View>
            </PressableScale>
          ))}
        </Card>
      </ScrollView>
    </ScreenContainer>
  );
}
