import React, { useCallback, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { StateView } from "../../components/StateView";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { PressableScale } from "../../components/PressableScale";
import { useTheme } from "../../theme/ThemeProvider";
import { useAuth } from "../../auth/AuthContext";
import { useResponsive } from "../../hooks/useResponsive";
import { Alert } from "../../utils/alert";
import { shareFile } from "../../utils/shareFile";
import { extractErrorMessage } from "../../api/client";
import { currentPeriod } from "../../api/sites.api";
import { downloadPayrollPack, getAccountingOverview } from "../../api/accounting.api";
import type { AccountingOverview } from "../../api/accounting.api";
import { exportTimeEntriesExcel, exportTimeEntriesPdf } from "../../api/timesheets.api";
import { useLiveFocusEffect, isBackgroundRefresh } from "../../sync/liveSync";
import { periodLabel, shiftPeriod } from "../sites/SiteYearPlanner";
import type { MenuStackParamList } from "../../navigation/MenuStack";

const XLSX = { mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", uti: "org.openxmlformats.spreadsheetml.sheet" };
const hoursFmt = (h: number) => `${h.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} h`;

function monthRange(period: string) {
  const [y, m] = period.split("-").map(Number) as [number, number];
  const last = new Date(y, m, 0).getDate();
  return { from: `${period}-01`, to: `${period}-${String(last).padStart(2, "0")}` };
}

/**
 * Espace comptable (retour explicite du client) : tout ce qu'il faut pour
 * les fiches de paie du mois — le dossier de paie en un fichier, les
 * pointages détaillés, les salariés et leurs documents, les absences et les
 * factures. Aussi accessible à la RH et à la direction.
 */
export function AccountingHomeScreen() {
  const { colors, spacing, radius, type } = useTheme();
  const { user } = useAuth();
  const { isDesktopWeb } = useResponsive();
  const navigation = useNavigation<NativeStackNavigationProp<MenuStackParamList>>();
  // Par défaut, le mois précédent : c'est celui dont on fait la paie.
  const [period, setPeriod] = useState(shiftPeriod(currentPeriod(), -1));
  const [overview, setOverview] = useState<AccountingOverview | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [busy, setBusy] = useState<"pack" | "xlsx" | "pdf" | null>(null);

  const load = useCallback(async () => {
    const silent = isBackgroundRefresh();
    try {
      if (!silent && !overview) setState("loading");
      setOverview(await getAccountingOverview(period));
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

  async function download(kind: "pack" | "xlsx" | "pdf") {
    setBusy(kind);
    try {
      if (kind === "pack") {
        await shareFile(`dossier-paie-${period}.xlsx`, await downloadPayrollPack(period), XLSX);
      } else if (kind === "xlsx") {
        await shareFile(`pointages-${period}.xlsx`, await exportTimeEntriesExcel(monthRange(period)), XLSX);
      } else {
        await shareFile(`pointages-${period}.pdf`, await exportTimeEntriesPdf(monthRange(period)), { mimeType: "application/pdf", uti: "com.adobe.pdf" });
      }
    } catch (err) {
      Alert.alert("Téléchargement impossible", extractErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  if (state !== "ready" || !overview) {
    return (
      <ScreenContainer>
        <StateView kind={state === "error" ? "error" : "loading"} onRetry={load} />
      </ScreenContainer>
    );
  }

  const links: { icon: keyof typeof Ionicons.glyphMap; title: string; subtitle: string; screen: "StaffHoursList" | "UsersList" | "AbsencesManagement" | "InvoicesList" }[] = [
    { icon: "time-outline", title: "Heures par personne", subtitle: "Détail du mois, nuits, dimanches, fériés, repos compensateur", screen: "StaffHoursList" },
    { icon: "folder-open-outline", title: "Salariés et documents", subtitle: "Dossiers, contrats, dépôt des bulletins de paie", screen: "UsersList" },
    { icon: "calendar-outline", title: "Absences et congés", subtitle: "Maladie, congés payés, sans solde, accidents", screen: "AbsencesManagement" },
    { icon: "receipt-outline", title: "Factures", subtitle: "Factures émises, PDF", screen: "InvoicesList" },
  ];

  return (
    <ScreenContainer style={{ paddingTop: spacing.md }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[{ paddingBottom: spacing.xxxl }, isDesktopWeb && { maxWidth: 820, width: "100%", alignSelf: "center" }]}
      >
        <Text style={[type.title2, { color: colors.ink, fontWeight: "700" }]}>Espace comptable</Text>
        <Text style={[type.footnote, { color: colors.inkSecondary, marginBottom: spacing.md }]}>
          {user?.role === "ACCOUNTANT" ? "Consultation des informations de paie de Deep Clean." : "Tout ce dont le comptable a besoin pour la paie."}
        </Text>

        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md }}>
          <PressableScale onPress={() => setPeriod(shiftPeriod(period, -1))} accessibilityLabel="Mois précédent" style={{ padding: spacing.xs }}>
            <Ionicons name="chevron-back" size={22} color={colors.accentText} />
          </PressableScale>
          <Text style={[type.headline, { color: colors.ink }]}>Paie de {periodLabel(period).toLowerCase()}</Text>
          <PressableScale onPress={() => setPeriod(shiftPeriod(period, 1))} accessibilityLabel="Mois suivant" style={{ padding: spacing.xs }}>
            <Ionicons name="chevron-forward" size={22} color={colors.accentText} />
          </PressableScale>
        </View>

        {overview.pendingEntries > 0 && (
          <Card style={{ marginBottom: spacing.md, backgroundColor: colors.warningSoft }}>
            <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
              <Ionicons name="time-outline" size={20} color={colors.warning} />
              <Text style={[type.callout, { color: colors.ink, marginLeft: spacing.sm, flex: 1 }]}>
                {hoursFmt(overview.pendingHours)} ({overview.pendingEntries} pointage{overview.pendingEntries > 1 ? "s" : ""}) encore en attente de validation par l'encadrement. Elles figurent à part dans le dossier de paie.
              </Text>
            </View>
          </Card>
        )}

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.md }}>
          {[
            { label: "Salariés", value: String(overview.staffCount), icon: "people-outline" as const },
            { label: "Heures validées", value: hoursFmt(overview.validatedHours), icon: "checkmark-done-outline" as const },
            { label: "Absences", value: String(overview.absenceCount), icon: "calendar-outline" as const },
            { label: "Documents déposés", value: String(overview.documentsThisMonth), icon: "document-text-outline" as const },
          ].map((k) => (
            <Card key={k.label} style={{ flexGrow: 1, flexBasis: "45%", paddingVertical: spacing.md }}>
              <Ionicons name={k.icon} size={18} color={colors.accentText} />
              <Text style={[type.title3, { color: colors.ink, fontWeight: "700", marginTop: 4 }]}>{k.value}</Text>
              <Text style={[type.caption, { color: colors.inkSecondary }]}>{k.label}</Text>
            </Card>
          ))}
        </View>

        {overview.absenceDaysByType.length > 0 && (
          <Card style={{ marginBottom: spacing.md }}>
            <Text style={[type.subhead, { color: colors.inkSecondary, marginBottom: spacing.xs }]}>Absences du mois (jours ouvrables)</Text>
            {overview.absenceDaysByType.map((a) => (
              <View key={a.type} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 }}>
                <Text style={[type.callout, { color: colors.ink }]}>{a.label}</Text>
                <Text style={[type.callout, { color: colors.ink, fontWeight: "600" }]}>{a.days} j</Text>
              </View>
            ))}
          </Card>
        )}

        <Card style={{ marginBottom: spacing.lg }}>
          <Text style={[type.headline, { color: colors.ink }]}>Dossier de paie</Text>
          <Text style={[type.footnote, { color: colors.inkSecondary, marginTop: 2, marginBottom: spacing.md }]}>
            Un fichier Excel : heures de chaque salarié (normales, nuit, dimanche, férié, majorées), repos compensateur, absences et soldes de congés.
          </Text>
          <Button label="Télécharger le dossier de paie" icon="download-outline" onPress={() => void download("pack")} loading={busy === "pack"} />
          <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm }}>
            <View style={{ flex: 1 }}>
              <Button label="Pointages (Excel)" variant="secondary" size="md" onPress={() => void download("xlsx")} loading={busy === "xlsx"} />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="Pointages (PDF)" variant="secondary" size="md" onPress={() => void download("pdf")} loading={busy === "pdf"} />
            </View>
          </View>
        </Card>

        {links.map((l) => (
          <PressableScale key={l.screen} onPress={() => navigation.navigate(l.screen as never)} accessibilityLabel={l.title}>
            <Card style={{ marginBottom: spacing.sm }}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <View style={{ width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name={l.icon} size={20} color={colors.accentText} />
                </View>
                <View style={{ flex: 1, marginLeft: spacing.md }}>
                  <Text style={[type.headline, { color: colors.ink }]}>{l.title}</Text>
                  <Text style={[type.footnote, { color: colors.inkSecondary }]}>{l.subtitle}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.inkTertiary} />
              </View>
            </Card>
          </PressableScale>
        ))}
      </ScrollView>
    </ScreenContainer>
  );
}
