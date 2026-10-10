import React, { useCallback, useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Animated, { FadeInUp } from "react-native-reanimated";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { PressableScale } from "../../components/PressableScale";
import { StateView } from "../../components/StateView";
import { KpiGrid } from "../../components/KpiGrid";
import { ProgressBar } from "../../components/ProgressBar";
import { SuperPdpCard } from "../../components/SuperPdpCard";
import { useTheme } from "../../theme/ThemeProvider";
import { useResponsive } from "../../hooks/useResponsive";
import { useAuth } from "../../auth/AuthContext";
import { getCommercialDashboard } from "../../api/commercialDashboard.api";
import type { CommercialDashboard } from "../../api/commercialDashboard.api";
import { getEinvoicingOverview } from "../../api/einvoicing.api";
import type { EinvoicingOverview } from "../../api/einvoicing.api";
import type { KpiTile } from "../dashboard/useDashboardData";
import type { MenuStackParamList } from "../../navigation/MenuStack";
import { useLiveFocusEffect, isBackgroundRefresh } from "../../sync/liveSync";

type Nav = NativeStackNavigationProp<MenuStackParamList>;
type IconName = React.ComponentProps<typeof Ionicons>["name"];

// Facturation (et donc facture électronique) réservée à RH/Direction/Admin
// (cahier des charges §1-3) — le Superviseur n'y figure pas, contrairement
// aux prospects/clients/devis. Le serveur l'impose de toute façon.
const INVOICE_ACCESS_ROLES = ["HR", "DIRECTOR", "ADMIN"];

const currencyFmt = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const periodFmt = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" });

// Espace commercial organisé autour de ce qu'on y fait le plus : créer un
// devis ou une facture (actions rapides en tête), puis suivre devis et
// factures (deux grandes cartes), la facture électronique (Super PDP) et
// enfin la prospection et les chantiers. Le client final, lui, ne reçoit que
// des devis/factures par email : il n'a jamais accès à Deep Clean.

function SectionTitle({ icon, tint, children }: { icon: IconName; tint: string; children: React.ReactNode }) {
  const { colors, spacing, type } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", marginTop: spacing.xl, marginBottom: spacing.sm }}>
      <Ionicons name={icon} size={13} color={tint} style={{ marginRight: 6 }} />
      <Text style={[type.overline, { color: colors.inkTertiary }]}>{children}</Text>
    </View>
  );
}

function QuickAction({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  const { colors, spacing, radius, type } = useTheme();
  return (
    <PressableScale onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={{ flex: 1 }}>
      <View
        style={{
          alignItems: "center",
          paddingVertical: spacing.md,
          paddingHorizontal: spacing.xxs,
          borderRadius: radius.lg,
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.accentFill, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name={icon} size={20} color={colors.onAccent} />
        </View>
        <Text style={[type.caption, { color: colors.ink, marginTop: spacing.xs, textAlign: "center", fontWeight: "600" }]} numberOfLines={2}>
          {label}
        </Text>
      </View>
    </PressableScale>
  );
}

// Petite pastille chiffrée (« À relancer 2 ») sous le grand chiffre d'une carte.
function Chip({ label, value, fg, bg }: { label: string; value: number; fg: string; bg: string }) {
  const { spacing, radius, type } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: bg, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5, marginRight: spacing.xs, marginTop: spacing.xs }}>
      <Text style={[type.caption, { color: fg, fontWeight: "700" }]}>{value}</Text>
      <Text style={[type.caption, { color: fg, marginLeft: 4 }]}>{label}</Text>
    </View>
  );
}

// Grande carte d'un domaine (Devis, Factures) : un chiffre principal, ses
// pastilles de détail et, si besoin, une alerte — toute la carte ouvre la liste.
function DomainCard({
  icon,
  title,
  value,
  caption,
  onPress,
  alert,
  children,
}: {
  icon: IconName;
  title: string;
  value: string;
  caption: string;
  onPress: () => void;
  alert?: string | null;
  children?: React.ReactNode;
}) {
  const { colors, spacing, radius, type } = useTheme();
  return (
    <PressableScale onPress={onPress} accessibilityRole="button" accessibilityLabel={`${title} : ${value} ${caption}`}>
      <Card>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <View style={{ width: 36, height: 36, borderRadius: radius.sm, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center" }}>
            <Ionicons name={icon} size={18} color={colors.accentText} />
          </View>
          <Text style={[type.headline, { color: colors.ink, marginLeft: spacing.sm, flex: 1 }]}>{title}</Text>
          <Text style={[type.footnote, { color: colors.accentText, fontWeight: "600" }]}>Tout voir</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.accentText} />
        </View>
        <View style={{ flexDirection: "row", alignItems: "baseline", marginTop: spacing.md }}>
          <Text style={[type.largeTitle, { color: colors.ink }]}>{value}</Text>
          <Text style={[type.subhead, { color: colors.inkSecondary, marginLeft: spacing.xs }]}>{caption}</Text>
        </View>
        {children}
        {!!alert && (
          <View style={{ flexDirection: "row", alignItems: "center", marginTop: spacing.md, padding: spacing.sm, borderRadius: radius.sm, backgroundColor: colors.warningSoft }}>
            <Ionicons name="alarm-outline" size={15} color={colors.warning} />
            <Text style={[type.footnote, { color: colors.warning, marginLeft: 6, fontWeight: "600", flex: 1 }]}>{alert}</Text>
          </View>
        )}
      </Card>
    </PressableScale>
  );
}

// Barre segmentée façon « répartition » : une seule bande arrondie divisée
// au prorata de chaque valeur — lecture d'ensemble immédiate. (`count` et non
// `value` : le plugin Reanimated prend `x.value` dans un style pour une
// valeur animée.)
function DistributionBar({ segments }: { segments: { count: number; color: string }[] }) {
  const { colors, radius, spacing } = useTheme();
  const total = segments.reduce((sum, s) => sum + s.count, 0);
  return (
    <View style={{ flexDirection: "row", height: 8, borderRadius: radius.pill, overflow: "hidden", backgroundColor: colors.surfaceAlt, marginTop: spacing.md }}>
      {total > 0 &&
        segments
          .filter((s) => s.count > 0)
          .map((s, i) => <View key={i} style={{ flex: s.count, backgroundColor: s.color }} />)}
    </View>
  );
}

function ListRow({ icon, label, detail, onPress, first }: { icon: IconName; label: string; detail: string; onPress: () => void; first?: boolean }) {
  const { colors, spacing, radius, type } = useTheme();
  return (
    <PressableScale onPress={onPress}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingVertical: spacing.md,
          paddingHorizontal: spacing.lg,
          borderTopWidth: first ? 0 : 1,
          borderTopColor: colors.border,
        }}
      >
        <View style={{ width: 36, height: 36, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name={icon} size={18} color={colors.inkSecondary} />
        </View>
        <View style={{ marginLeft: spacing.md, flex: 1 }}>
          <Text style={[type.headline, { color: colors.ink }]}>{label}</Text>
          <Text style={[type.footnote, { color: colors.inkTertiary, marginTop: 1 }]} numberOfLines={1}>
            {detail}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.inkTertiary} />
      </View>
    </PressableScale>
  );
}

export function CommercialHomeScreen() {
  const { colors, spacing, radius, type } = useTheme();
  const { isDesktopWeb } = useResponsive();
  const { user } = useAuth();
  const navigation = useNavigation<Nav>();
  const canInvoice = !!user && INVOICE_ACCESS_ROLES.includes(user.role);
  const isSupervisor = user?.role === "SUPERVISOR";

  const [dashboard, setDashboard] = useState<CommercialDashboard | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [einvoicing, setEinvoicing] = useState<EinvoicingOverview | null>(null);
  const [einvoicingFailed, setEinvoicingFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const silent = isBackgroundRefresh();
    // La carte Super PDP se charge à part : une panne de ce côté ne doit
    // jamais masquer les devis et factures.
    const einvoicingTask = canInvoice
      ? getEinvoicingOverview()
          .then((o) => {
            setEinvoicing(o);
            setEinvoicingFailed(false);
          })
          .catch(() => setEinvoicingFailed(true))
      : Promise.resolve();
    try {
      if (!silent) setState((s) => (s === "ready" ? s : "loading"));
      setDashboard(await getCommercialDashboard());
      setState("ready");
    } catch {
      if (!silent) setState("error");
    }
    await einvoicingTask;
  }, [canInvoice]);

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

  const c = dashboard?.commercial;
  const inv = dashboard?.invoicing ?? null;
  const decided = c ? c.quotesAccepted + c.quotesRejected : 0;
  const acceptanceRate = c && decided > 0 ? Math.round((c.quotesAccepted / decided) * 100) : null;

  const sitesTiles: KpiTile[] | null = dashboard
    ? [
        { key: "active", label: isSupervisor ? "Mes chantiers actifs" : "Chantiers actifs", value: String(dashboard.sites.activeSites), tone: "neutral", icon: "business-outline" },
        { key: "scheduled", label: "Programmées", value: String(dashboard.sites.scheduledVisits), tone: "info", icon: "calendar-outline" },
        { key: "completed", label: "Réalisées", value: String(dashboard.sites.completedVisits), tone: "success", icon: "checkmark-circle-outline" },
        { key: "toSchedule", label: "À programmer", value: String(dashboard.sites.toScheduleVisits), tone: "warning", icon: "time-outline" },
      ]
    : null;
  const completionRatio = dashboard && dashboard.sites.plannedVisits > 0 ? dashboard.sites.completedVisits / dashboard.sites.plannedVisits : 0;

  const quoteCard = c && (
    <DomainCard
      icon="document-text-outline"
      title={isSupervisor ? "Mes devis" : "Devis"}
      value={String(c.quotesInProgress)}
      caption="en cours"
      onPress={() => navigation.navigate("QuotesList")}
      alert={c.quotesToFollowUp > 0 ? `${c.quotesToFollowUp} devis à relancer` : null}
    >
      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        <Chip label={c.quotesAccepted > 1 ? "acceptés" : "accepté"} value={c.quotesAccepted} fg={colors.success} bg={colors.successSoft} />
        <Chip label={c.quotesRejected > 1 ? "refusés" : "refusé"} value={c.quotesRejected} fg={colors.danger} bg={colors.dangerSoft} />
      </View>
      {acceptanceRate !== null && (
        <Text style={[type.footnote, { color: colors.inkSecondary, marginTop: spacing.sm }]}>
          Taux d'acceptation <Text style={{ color: colors.ink, fontWeight: "700" }}>{acceptanceRate} %</Text>
        </Text>
      )}
    </DomainCard>
  );

  const invoiceCard = inv && (
    <DomainCard
      icon="receipt-outline"
      title="Factures"
      value={String(inv.toPrepare + inv.validated)}
      caption="à préparer ou envoyer"
      onPress={() => navigation.navigate("InvoicesList")}
    >
      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        <Chip label={inv.sent > 1 ? "envoyées" : "envoyée"} value={inv.sent} fg={colors.accentText} bg={colors.accentSoft} />
        <Chip label={inv.paid > 1 ? "payées" : "payée"} value={inv.paid} fg={colors.success} bg={colors.successSoft} />
      </View>
      <DistributionBar
        segments={[
          { count: inv.toPrepare, color: colors.neutral },
          { count: inv.validated, color: colors.info },
          { count: inv.sent, color: colors.accent },
          { count: inv.paid, color: colors.success },
        ]}
      />
      <View style={{ flexDirection: "row", alignItems: "center", marginTop: spacing.md }}>
        <Ionicons name="trending-up-outline" size={15} color={colors.success} />
        <Text style={[type.footnote, { color: colors.inkSecondary, marginLeft: 6, flex: 1 }]}>CA prévisionnel mensuel</Text>
        <Text style={[type.subhead, { color: colors.ink, fontWeight: "700" }]}>{currencyFmt.format(inv.projectedMonthlyRevenueHt)} HT</Text>
      </View>
    </DomainCard>
  );

  return (
    <ScreenContainer>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: spacing.lg, paddingBottom: spacing.xxl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        <Text style={[type.largeTitle, { color: colors.ink }]}>Commercial</Text>
        <Text style={[type.footnote, { color: colors.inkSecondary, marginTop: spacing.xxs }]}>
          {canInvoice ? "Devis, factures et facture électronique" : "Vos prospects, clients et devis"}
        </Text>

        {/* Actions rapides : créer en un geste, sans passer par une liste. */}
        <View style={{ flexDirection: "row", gap: spacing.xs, marginTop: spacing.lg }}>
          <QuickAction icon="document-text" label="Nouveau devis" onPress={() => navigation.navigate("QuoteForm", undefined)} />
          {canInvoice && <QuickAction icon="receipt" label="Nouvelle facture" onPress={() => navigation.navigate("InvoiceForm", undefined)} />}
          <QuickAction icon="person-add" label="Nouveau prospect" onPress={() => navigation.navigate("ProspectForm", undefined)} />
          <QuickAction icon="briefcase" label="Nouveau client" onPress={() => navigation.navigate("ClientForm", undefined)} />
        </View>

        {state === "loading" && !dashboard && <StateView kind="loading" />}
        {state === "error" && !dashboard && <StateView kind="error" onRetry={load} />}

        {dashboard && (
          <Animated.View entering={FadeInUp.duration(280)}>
            <SectionTitle icon="layers-outline" tint={colors.accent}>
              {canInvoice ? "DEVIS & FACTURES" : "DEVIS"}
            </SectionTitle>
            {isDesktopWeb && invoiceCard ? (
              <View style={{ flexDirection: "row", gap: spacing.md }}>
                <View style={{ flex: 1 }}>{quoteCard}</View>
                <View style={{ flex: 1 }}>{invoiceCard}</View>
              </View>
            ) : (
              <View style={{ gap: spacing.sm }}>
                {quoteCard}
                {invoiceCard}
              </View>
            )}

            {canInvoice && (
              <>
                <SectionTitle icon="shield-checkmark-outline" tint={colors.accent}>
                  FACTURE ÉLECTRONIQUE
                </SectionTitle>
                <SuperPdpCard overview={einvoicing} failed={einvoicingFailed} onOpen={() => navigation.navigate("Einvoicing")} />
              </>
            )}

            <SectionTitle icon="people-outline" tint={colors.info}>
              PROSPECTION
            </SectionTitle>
            <Card padded={false}>
              <ListRow
                first
                icon="person-add-outline"
                label="Prospects"
                detail={`${dashboard.commercial.activeProspects} en cours · suivi et relances`}
                onPress={() => navigation.navigate("ProspectsList")}
              />
              <ListRow icon="briefcase-outline" label="Clients" detail="Coordonnées, historique commercial" onPress={() => navigation.navigate("ClientsList")} />
            </Card>

            {sitesTiles && (
              <>
                <SectionTitle icon="business-outline" tint={colors.warning}>
                  {`CHANTIERS · ${periodFmt.format(new Date(`${dashboard.sites.period}-01T12:00:00`)).toUpperCase()}`}
                </SectionTitle>
                <KpiGrid tiles={sitesTiles} />
                {dashboard.sites.plannedVisits > 0 && (
                  <Card style={{ marginTop: spacing.sm }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: spacing.sm }}>
                      <Text style={[type.footnote, { color: colors.inkSecondary }]}>
                        Objectif du mois · {dashboard.sites.completedVisits} / {dashboard.sites.plannedVisits} prestations
                      </Text>
                      <Text style={[type.footnote, { color: colors.ink, fontWeight: "700" }]}>{Math.round(completionRatio * 100)} %</Text>
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
                          <Text style={[type.footnote, { color: colors.warning, fontWeight: "700" }]}>{site.toScheduleVisits} à programmer</Text>
                          <Ionicons name="chevron-forward" size={16} color={colors.inkTertiary} style={{ marginLeft: 6 }} />
                        </View>
                      </PressableScale>
                    ))}
                  </Card>
                )}
              </>
            )}
          </Animated.View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
