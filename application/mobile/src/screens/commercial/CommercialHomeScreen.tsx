import React, { useCallback, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { PressableScale } from "../../components/PressableScale";
import { StateView } from "../../components/StateView";
import { useTheme } from "../../theme/ThemeProvider";
import { useAuth } from "../../auth/AuthContext";
import { getCommercialDashboard } from "../../api/commercialDashboard.api";
import type { CommercialDashboard } from "../../api/commercialDashboard.api";
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

function StatTile({ value, label, color }: { value: string | number; label: string; color?: string }) {
  const { colors, type } = useTheme();
  return (
    <View style={{ flex: 1, minWidth: "30%" }}>
      <Text style={[type.title2, { color: color ?? colors.ink }]}>{value}</Text>
      <Text style={[type.caption, { color: colors.inkTertiary, marginTop: 2 }]} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

function DashboardSection({ title, children }: { title: string; children: React.ReactNode }) {
  const { colors, spacing, type } = useTheme();
  return (
    <View style={{ marginTop: spacing.lg }}>
      <Text style={[type.overline, { color: colors.inkTertiary, marginBottom: spacing.sm }]}>{title}</Text>
      <Card>{children}</Card>
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

  return (
    <ScreenContainer>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: spacing.lg, paddingBottom: spacing.xxl }}>
        <Text style={[type.largeTitle, { color: colors.ink, marginBottom: spacing.xs }]}>Commercial</Text>
        <Text style={[type.footnote, { color: colors.inkSecondary, marginBottom: spacing.lg }]}>
          Le client final ne reçoit que des devis/factures par email — il n'a jamais accès à DeepClean.
        </Text>

        {state === "loading" && <StateView kind="loading" />}
        {state === "error" && <StateView kind="error" onRetry={load} />}

        {state === "ready" && dashboard && (
          <>
            <DashboardSection title={user?.role === "SUPERVISOR" ? "MES PROSPECTS & DEVIS" : "COMMERCIAL"}>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.md }}>
                <StatTile value={dashboard.commercial.activeProspects} label="Prospects en cours" />
                <StatTile value={dashboard.commercial.quotesInProgress} label="Devis en cours" color={colors.accent} />
                <StatTile value={dashboard.commercial.quotesToFollowUp} label="Devis à relancer" color={colors.warning} />
                <StatTile value={dashboard.commercial.quotesAccepted} label="Devis acceptés" color={colors.success} />
                <StatTile value={dashboard.commercial.quotesRejected} label="Devis refusés" color={colors.danger} />
              </View>
            </DashboardSection>

            <DashboardSection title={`CHANTIERS · ${periodFmt.format(new Date(`${dashboard.sites.period}-01`))}`}>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.md }}>
                <StatTile value={dashboard.sites.activeSites} label={user?.role === "SUPERVISOR" ? "Mes chantiers actifs" : "Chantiers actifs"} />
                <StatTile value={dashboard.sites.plannedVisits} label="Prestations prévues" />
                <StatTile value={dashboard.sites.completedVisits} label="Réalisées" color={colors.success} />
                <StatTile value={dashboard.sites.remainingVisits} label="Restantes" color={colors.warning} />
              </View>

              {dashboard.sites.sitesNeedingAttention.length > 0 && (
                <View style={{ marginTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md }}>
                  {dashboard.sites.sitesNeedingAttention.map((site) => (
                    <PressableScale key={site.siteId} onPress={() => navigation.navigate("SiteDetail", { siteId: site.siteId })}>
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          backgroundColor: colors.warningSoft,
                          borderRadius: radius.md,
                          padding: spacing.sm,
                          marginBottom: spacing.xs,
                        }}
                      >
                        <Ionicons name="alert-circle" size={16} color={colors.warning} />
                        <Text style={[type.footnote, { color: colors.warning, marginLeft: spacing.sm, flex: 1, fontWeight: "600" }]} numberOfLines={1}>
                          {site.siteName}
                        </Text>
                        <Text style={[type.footnote, { color: colors.warning, fontWeight: "700" }]}>{site.remainingVisits}</Text>
                      </View>
                    </PressableScale>
                  ))}
                </View>
              )}
            </DashboardSection>

            {dashboard.invoicing && (
              <DashboardSection title="FACTURATION">
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.md }}>
                  <StatTile value={dashboard.invoicing.toPrepare} label="À préparer" />
                  <StatTile value={dashboard.invoicing.validated} label="Validées" color={colors.info} />
                  <StatTile value={dashboard.invoicing.sent} label="Envoyées" color={colors.accent} />
                  <StatTile value={dashboard.invoicing.paid} label="Payées" color={colors.success} />
                </View>
                <View style={{ marginTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md }}>
                  <Text style={[type.footnote, { color: colors.inkSecondary }]}>
                    CA prévisionnel mensuel (devis acceptés) : {currencyFmt.format(dashboard.invoicing.projectedMonthlyRevenueHt)} HT
                  </Text>
                </View>
              </DashboardSection>
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
