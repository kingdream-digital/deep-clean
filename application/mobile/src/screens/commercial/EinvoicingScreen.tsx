import React, { useCallback, useState } from "react";
import { Linking, RefreshControl, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Animated, { FadeIn } from "react-native-reanimated";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { PressableScale } from "../../components/PressableScale";
import { StateView } from "../../components/StateView";
import { einvoicingState, reformProgress, stateColors } from "../../components/SuperPdpCard";
import { ProgressBar } from "../../components/ProgressBar";
import { useTheme } from "../../theme/ThemeProvider";
import { extractErrorMessage } from "../../api/client";
import { daysUntil, getEinvoicingOverview, listEinvoices, syncEinvoices, testEinvoicingConnection } from "../../api/einvoicing.api";
import type { EinvoiceRow, EinvoiceView, EinvoicingOverview } from "../../api/einvoicing.api";
import type { MenuStackParamList } from "../../navigation/MenuStack";
import { useLiveFocusEffect, isBackgroundRefresh } from "../../sync/liveSync";
import { frenchDateFormat } from "../../utils/frenchDate";
import { timeAgo } from "../../utils/timeAgo";
import { Alert } from "../../utils/alert";

// Espace Super PDP : tout ce qui concerne la facture électronique réuni en un
// seul endroit — état de la connexion, mise en service pas à pas, calendrier
// de la réforme et suivi des factures transmises. L'envoi d'une facture
// reste sur sa fiche (carte « Facture électronique »), où l'on voit ce
// qu'on envoie ; ici on pilote et on surveille.

const SUPERPDP_URL = "https://www.superpdp.tech";

const deadlineFmt = frenchDateFormat({ day: "numeric", month: "long", year: "numeric" });
const shortDateFmt = frenchDateFormat({ day: "numeric", month: "short" });
const currencyFmt = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });

const VIEWS: { view: EinvoiceView; label: string; icon: React.ComponentProps<typeof Ionicons>["name"]; empty: string }[] = [
  { view: "toSend", label: "À transmettre", icon: "paper-plane-outline", empty: "Aucune facture validée en attente de transmission." },
  { view: "inProgress", label: "En cours", icon: "sync-outline", empty: "Aucune facture en cours d'acheminement." },
  { view: "attention", label: "À vérifier", icon: "alert-circle-outline", empty: "Aucun rejet, refus ou litige. Tout va bien." },
  { view: "done", label: "Abouties", icon: "checkmark-done-outline", empty: "Aucune facture approuvée ou encaissée pour l'instant." },
];

function SectionTitle({ children }: { children: React.ReactNode }) {
  const { colors, spacing, type } = useTheme();
  return <Text style={[type.overline, { color: colors.inkTertiary, marginTop: spacing.xl, marginBottom: spacing.sm }]}>{children}</Text>;
}

function StepRow({
  index,
  done,
  title,
  children,
  last,
}: {
  index: number;
  done: boolean;
  title: string;
  children?: React.ReactNode;
  last?: boolean;
}) {
  const { colors, spacing, type } = useTheme();
  return (
    <View style={{ flexDirection: "row", paddingVertical: spacing.md, borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.border }}>
      <View
        style={{
          width: 26,
          height: 26,
          borderRadius: 13,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: done ? colors.success : colors.surfaceAlt,
          marginRight: spacing.md,
        }}
      >
        {done ? <Ionicons name="checkmark" size={15} color="#FFFFFF" /> : <Text style={[type.caption, { color: colors.inkSecondary, fontWeight: "700" }]}>{index}</Text>}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[type.subhead, { color: colors.ink, fontWeight: "600" }]}>{title}</Text>
        {children}
      </View>
    </View>
  );
}

function Milestone({ date, title, done }: { date: string; title: string; done: boolean }) {
  const { colors, spacing, type } = useTheme();
  const days = daysUntil(date);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: spacing.xs }}>
      <Ionicons name={done ? "checkmark-circle" : "time-outline"} size={20} color={done ? colors.success : colors.warning} />
      <View style={{ flex: 1, marginLeft: spacing.sm }}>
        <Text style={[type.subhead, { color: colors.ink, fontWeight: "600" }]}>{title}</Text>
        <Text style={[type.footnote, { color: colors.inkSecondary }]}>{deadlineFmt.format(new Date(`${date}T12:00:00`))}</Text>
      </View>
      <Text style={[type.caption, { color: done ? colors.success : colors.warning, fontWeight: "700" }]}>
        {done ? "En vigueur" : `J-${days}`}
      </Text>
    </View>
  );
}

function InvoiceRow({ row, view, onPress }: { row: EinvoiceRow; view: EinvoiceView; onPress: () => void }) {
  const { colors, spacing, type } = useTheme();
  const ready = view === "toSend" && row.blockers.length === 0;
  const statusColor = view === "attention" ? colors.danger : view === "done" ? colors.success : view === "inProgress" ? colors.info : ready ? colors.success : colors.warning;
  const statusText =
    view === "toSend"
      ? ready
        ? "Prête à transmettre"
        : `À compléter : ${row.blockers[0]}${row.blockers.length > 1 ? ` (+${row.blockers.length - 1})` : ""}`
      : row.pdpStatusLabel ?? "Déposée sur la plateforme";

  return (
    <PressableScale onPress={onPress}>
      <View style={{ paddingVertical: spacing.md, paddingHorizontal: spacing.lg }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Text style={[type.footnote, { color: colors.inkTertiary, flex: 1 }]}>{row.invoiceNumber}</Text>
          <Text style={[type.subhead, { color: colors.ink, fontWeight: "700" }]}>{currencyFmt.format(row.totalTtc)}</Text>
        </View>
        <Text style={[type.headline, { color: colors.ink, marginTop: 2 }]} numberOfLines={1}>
          {row.clientName}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", marginTop: spacing.xs }}>
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: statusColor }} />
          <Text style={[type.footnote, { color: statusColor, marginLeft: 6, flex: 1, fontWeight: "600" }]} numberOfLines={2}>
            {statusText}
          </Text>
          <Text style={[type.caption, { color: colors.inkTertiary, marginLeft: spacing.xs }]}>
            {shortDateFmt.format(new Date(view === "toSend" ? row.issueDate : row.pdpSentAt ?? row.issueDate))}
          </Text>
        </View>
        {view === "attention" && !!row.pdpError && row.pdpError !== row.pdpStatusLabel && (
          <Text style={[type.footnote, { color: colors.inkSecondary, marginTop: 4 }]} numberOfLines={3}>
            {row.pdpError}
          </Text>
        )}
      </View>
    </PressableScale>
  );
}

export function EinvoicingScreen() {
  const { colors, spacing, radius, type } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<MenuStackParamList>>();

  const [overview, setOverview] = useState<EinvoicingOverview | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [refreshing, setRefreshing] = useState(false);
  const [view, setView] = useState<EinvoiceView>("toSend");
  const [rows, setRows] = useState<EinvoiceRow[] | null>(null);
  const [rowsState, setRowsState] = useState<"loading" | "ready" | "error">("loading");
  const [syncing, setSyncing] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const loadOverview = useCallback(async () => {
    const silent = isBackgroundRefresh();
    try {
      if (!silent) setState((s) => (s === "ready" ? s : "loading"));
      setOverview(await getEinvoicingOverview());
      setState("ready");
    } catch {
      if (!silent) setState("error");
    }
  }, []);

  const loadRows = useCallback(async (activeView: EinvoiceView) => {
    const silent = isBackgroundRefresh();
    try {
      if (!silent) setRowsState("loading");
      setRows((await listEinvoices(activeView)).items);
      setRowsState("ready");
    } catch {
      if (!silent) setRowsState("error");
    }
  }, []);

  useLiveFocusEffect(
    useCallback(() => {
      void loadOverview();
    }, [loadOverview])
  );
  useLiveFocusEffect(
    useCallback(() => {
      void loadRows(view);
    }, [view, loadRows])
  );

  async function handleRefresh() {
    setRefreshing(true);
    await Promise.all([loadOverview(), loadRows(view)]);
    setRefreshing(false);
  }

  async function handleSync() {
    setSyncing(true);
    try {
      const r = await syncEinvoices();
      await Promise.all([loadOverview(), loadRows(view)]);
      Alert.alert(
        "Statuts actualisés",
        r.checked === 0
          ? "Aucune facture en cours de suivi."
          : `${r.checked} facture${r.checked > 1 ? "s" : ""} vérifiée${r.checked > 1 ? "s" : ""}, ${r.changed} statut${r.changed > 1 ? "s" : ""} mis à jour.${r.failed > 0 ? ` ${r.failed} n'ont pas pu être vérifiées, nouvel essai automatique dans 30 minutes.` : ""}`
      );
    } catch (err) {
      Alert.alert("Super PDP", extractErrorMessage(err));
    } finally {
      setSyncing(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await testEinvoicingConnection();
      setTestResult({ ok: true, message: `Connexion réussie à ${r.host}.` });
    } catch (err) {
      setTestResult({ ok: false, message: extractErrorMessage(err) });
    } finally {
      setTesting(false);
    }
  }

  function openPortal() {
    void Linking.openURL(SUPERPDP_URL).catch(() => Alert.alert("Super PDP", `Ouvrez ${SUPERPDP_URL} dans votre navigateur.`));
  }

  if (state === "loading" && !overview) {
    return (
      <ScreenContainer>
        <StateView kind="loading" />
      </ScreenContainer>
    );
  }
  if (state === "error" && !overview) {
    return (
      <ScreenContainer>
        <StateView kind="error" onRetry={loadOverview} />
      </ScreenContainer>
    );
  }
  if (!overview) return null;

  const status = einvoicingState(overview);
  const statusTint = stateColors(status.tone, colors);
  const configured = overview.connection.configured;
  const companyReady = overview.company.missing.length === 0;
  const setupDone = configured && companyReady && testResult?.ok === true;
  const receptionDone = daysUntil(overview.deadlines.reception) <= 0;
  const emissionDone = daysUntil(overview.deadlines.emission) <= 0;
  const activeView = VIEWS.find((v) => v.view === view)!;

  const trackingSection = (
    <>
        {/* Suivi des factures : 4 compteurs qui servent aussi de filtre. */}
        <SectionTitle>SUIVI DES FACTURES</SectionTitle>
        <View style={{ flexDirection: "row", flexWrap: "wrap", marginHorizontal: -spacing.xxs }}>
          {VIEWS.map((v) => {
            const selected = v.view === view;
            const count = overview.counts[v.view];
            const tone = v.view === "attention" ? colors.danger : v.view === "done" ? colors.success : v.view === "inProgress" ? colors.info : colors.accentText;
            return (
              <View key={v.view} style={{ width: "50%", padding: spacing.xxs }}>
                <PressableScale onPress={() => setView(v.view)} accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={`${v.label} : ${count}`}>
                  <View
                    style={{
                      borderRadius: radius.lg,
                      padding: spacing.md,
                      backgroundColor: selected ? colors.accentSoft : colors.surface,
                      borderWidth: selected ? 1.5 : 1,
                      borderColor: selected ? colors.accent : colors.border,
                    }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                      <Ionicons name={v.icon} size={18} color={tone} />
                      <Text style={[type.statNumber, { color: count > 0 ? tone : colors.inkTertiary }]}>{count}</Text>
                    </View>
                    <Text style={[type.footnote, { color: selected ? colors.ink : colors.inkSecondary, marginTop: spacing.xs, fontWeight: selected ? "700" : "500" }]}>{v.label}</Text>
                  </View>
                </PressableScale>
              </View>
            );
          })}
        </View>

        <Card padded={false} style={{ marginTop: spacing.sm }}>
          {rowsState === "loading" && !rows && <StateView kind="loading" />}
          {rowsState === "error" && <StateView kind="error" onRetry={() => loadRows(view)} />}
          {rowsState !== "error" && rows && rows.length === 0 && (
            <View style={{ alignItems: "center", padding: spacing.xl }}>
              <Ionicons name={activeView.icon} size={26} color={colors.inkTertiary} />
              <Text style={[type.footnote, { color: colors.inkSecondary, marginTop: spacing.xs, textAlign: "center" }]}>{activeView.empty}</Text>
            </View>
          )}
          {rowsState !== "error" &&
            rows?.map((row, i) => (
              <View key={row.id} style={{ borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.border }}>
                <InvoiceRow row={row} view={view} onPress={() => navigation.navigate("InvoiceDetail", { invoiceId: row.id })} />
              </View>
            ))}
        </Card>
        {view === "toSend" && rows && rows.length > 0 && (
          <Text style={[type.caption, { color: colors.inkTertiary, marginTop: spacing.xs }]}>
            Ouvrez une facture pour la transmettre : la carte « Facture électronique » de sa fiche fait l'envoi.
          </Text>
        )}

    </>
  );

  const setupSection = (
    <>
        {/* Mise en service : chaque étape dit ce qui est fait et ce qui manque. */}
        <SectionTitle>MISE EN SERVICE</SectionTitle>
        <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
          <StepRow index={1} done={configured} title="Compte Super PDP relié">
            <Text style={[type.footnote, { color: colors.inkSecondary, marginTop: 2 }]}>
              {configured
                ? `Identifiants présents sur le serveur · ${overview.connection.host}`
                : "Créer un compte sur superpdp.tech, puis une application « client credentials ». Son identifiant et son secret se renseignent sur le serveur (SUPERPDP_CLIENT_ID, SUPERPDP_CLIENT_SECRET), jamais dans l'application."}
            </Text>
          </StepRow>
          <StepRow index={2} done={companyReady} title="Identité légale de l'entreprise">
            {companyReady ? (
              <Text style={[type.footnote, { color: colors.inkSecondary, marginTop: 2 }]}>{overview.company.name} · SIREN, adresse et TVA renseignés</Text>
            ) : (
              overview.company.missing.map((m) => (
                <Text key={m} style={[type.footnote, { color: colors.warning, marginTop: 2 }]}>
                  • {m.charAt(0).toUpperCase() + m.slice(1)}
                </Text>
              ))
            )}
          </StepRow>
          <StepRow index={3} done={testResult?.ok === true} title="Connexion vérifiée" last>
            {testResult && (
              <Text style={[type.footnote, { color: testResult.ok ? colors.success : colors.danger, marginTop: 2 }]}>{testResult.message}</Text>
            )}
            <View style={{ marginTop: spacing.sm, alignSelf: "flex-start" }}>
              <Button label="Tester la connexion" variant="secondary" size="md" icon="pulse-outline" loading={testing} disabled={!configured} onPress={handleTest} />
            </View>
          </StepRow>
        </Card>
        {setupDone && (
          <Text style={[type.caption, { color: colors.success, marginTop: spacing.xs }]}>Tout est prêt : les factures validées peuvent partir en facture électronique.</Text>
        )}

    </>
  );

  return (
    <ScreenContainer>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: spacing.md, paddingBottom: spacing.xxxl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        {/* En-tête : identité de l'espace et état en un mot. */}
        <Animated.View entering={FadeIn.duration(250)}>
          <LinearGradient colors={colors.accentGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: radius.xl, padding: spacing.lg }}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <View style={{ width: 52, height: 52, borderRadius: radius.md, backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="shield-checkmark" size={28} color="#FFFFFF" />
              </View>
              <View style={{ flex: 1, marginLeft: spacing.md }}>
                <Text style={[type.title2, { color: "#FFFFFF" }]}>Super PDP</Text>
                <Text style={[type.footnote, { color: "rgba(255,255,255,0.85)" }]}>Plateforme agréée de facture électronique</Text>
              </View>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", marginTop: spacing.md }}>
              <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: "#FFFFFF", borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 }}>
                <Ionicons name={status.icon} size={13} color={statusTint.fg} />
                <Text style={[type.caption, { color: statusTint.fg, marginLeft: 4, fontWeight: "700" }]}>{status.label}</Text>
              </View>
              <Text style={[type.caption, { color: "rgba(255,255,255,0.85)", marginLeft: spacing.sm, flex: 1 }]} numberOfLines={1}>
                {configured ? (overview.lastSyncAt ? `Statuts vérifiés ${timeAgo(overview.lastSyncAt)}` : overview.connection.host) : "À configurer sur le serveur"}
              </Text>
            </View>
          </LinearGradient>
        </Animated.View>

        <View style={{ flexDirection: "row", marginTop: spacing.md }}>
          <View style={{ flex: 1, marginRight: spacing.xs }}>
            <Button label="Actualiser" variant="secondary" size="md" icon="refresh-outline" loading={syncing} disabled={!configured} onPress={handleSync} />
          </View>
          <View style={{ flex: 1, marginLeft: spacing.xs }}>
            <Button label="Site Super PDP" variant="secondary" size="md" icon="open-outline" onPress={openPortal} />
          </View>
        </View>

        {/* Tant que ce n'est pas activé, la mise en service passe en premier :
            c'est la seule chose à faire. */}
        {configured && companyReady ? (
          <>
            {trackingSection}
            {setupSection}
          </>
        ) : (
          <>
            {setupSection}
            {trackingSection}
          </>
        )}

        {/* Calendrier légal : où en est-on de la réforme. */}
        <SectionTitle>CALENDRIER DE LA RÉFORME</SectionTitle>
        <Card>
          <Milestone date={overview.deadlines.reception} title="Réception des factures électroniques" done={receptionDone} />
          <Milestone date={overview.deadlines.emission} title="Émission obligatoire (PME)" done={emissionDone} />
          <View style={{ marginTop: spacing.sm }}>
            <ProgressBar ratio={reformProgress(overview)} color={colors.accent} />
          </View>
          <Text style={[type.footnote, { color: colors.inkSecondary, marginTop: spacing.md }]}>
            Les factures partent au format Factur-X (PDF lisible + données structurées EN 16931), avec les mentions de la réforme : SIREN du client, adresse d'intervention,
            catégorie « prestations de services ». Les statuts officiels sont relus automatiquement toutes les 30 minutes ; un refus ou un litige prévient la direction et
            la RH.
          </Text>
        </Card>
      </ScrollView>
    </ScreenContainer>
  );
}
