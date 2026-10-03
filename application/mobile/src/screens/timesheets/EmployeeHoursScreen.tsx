import React, { useCallback, useState } from "react";
import { FlatList, Text, View } from "react-native";
import { Alert } from "../../utils/alert";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import Animated, { FadeInUp } from "react-native-reanimated";
import { ScreenContainer } from "../../components/ScreenContainer";
import { StateView } from "../../components/StateView";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { PressableScale } from "../../components/PressableScale";
import { TimeEntryStatusBadge } from "../../components/TimeEntryStatusBadge";
import { useTheme } from "../../theme/ThemeProvider";
import { extractErrorMessage } from "../../api/client";
import { listTimeEntries, exportTimeEntriesCsv, exportTimeEntriesExcel, exportTimeEntriesPdf } from "../../api/timesheets.api";
import type { TimeEntry } from "../../api/timesheets.api";
import { computeWeekSummary, formatHoursMinutes } from "../../utils/timesheetSummary";
import { formatDuration } from "../../utils/duration";
import { toLocalDateKey } from "../../utils/missionFormat";
import { shareCsv } from "../../utils/exportCsv";
import { shareFile } from "../../utils/shareFile";
import type { MenuStackParamList } from "../../navigation/MenuStack";
import { frenchDateFormat } from "../../utils/frenchDate";
import { useLiveFocusEffect, isBackgroundRefresh } from "../../sync/liveSync";

const dayFmt = frenchDateFormat({ day: "numeric", month: "short" });
const timeFmt = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });
const monthFmt = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" });

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}
function addMonths(d: Date, amount: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + amount, 1);
}
function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

type Route = RouteProp<MenuStackParamList, "EmployeeHours">;

// Aussi ouvert par chacun sur ses propres heures (Mes heures → dossier d'un
// mois) : le serveur limite alors la liste et l'export à ses pointages.
//
// Dossier d'heures d'une personne, mois par mois — pour que la RH puisse
// retrouver rapidement les heures d'un employé et exporter le mois en CSV
// pour préparer la fiche de paye (voir timesheets.service.ts côté serveur
// pour le format exact du fichier).
export function EmployeeHoursScreen() {
  const { colors, spacing, type } = useTheme();
  const { params } = useRoute<Route>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const navigation = useNavigation<any>();

  const [month, setMonth] = useState(() => {
    if (params.initialMonth) {
      const [y, m] = params.initialMonth.split("-").map(Number);
      if (y && m) return new Date(y, m - 1, 1);
    }
    return startOfMonth(new Date());
  });
  const [items, setItems] = useState<TimeEntry[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    const silent = isBackgroundRefresh();
    try {
      if (!silent) setState("loading");
      const res = await listTimeEntries({
        userId: params.userId,
        from: toLocalDateKey(startOfMonth(month)),
        to: toLocalDateKey(endOfMonth(month)),
        // Le serveur plafonne pageSize à 100 (voir timesheets.validation.ts) — un
        // dépassement faisait échouer cet écran à chaque ouverture (bug corrigé).
        // 100 reste largement suffisant pour un mois de pointages d'une personne.
        pageSize: 100,
      });
      setItems(res.items);
      setState("ready");
    } catch {
      if (!silent) setState("error");
    }
  }, [params.userId, month]);

  useLiveFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  async function runExport(format: "csv" | "xlsx" | "pdf") {
    setExporting(true);
    try {
      const period = { userId: params.userId, from: toLocalDateKey(startOfMonth(month)), to: toLocalDateKey(endOfMonth(month)) };
      const baseName = `pointages_${params.fullName.replace(/\s+/g, "_")}_${toLocalDateKey(month).slice(0, 7)}`;
      if (format === "csv") {
        const csv = await exportTimeEntriesCsv(period);
        await shareCsv(`${baseName}.csv`, csv);
      } else if (format === "xlsx") {
        const bytes = await exportTimeEntriesExcel(period);
        await shareFile(`${baseName}.xlsx`, bytes, {
          mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          uti: "org.openxmlformats.spreadsheetml.sheet",
        });
      } else {
        const bytes = await exportTimeEntriesPdf(period);
        await shareFile(`${baseName}.pdf`, bytes, { mimeType: "application/pdf", uti: "com.adobe.pdf" });
      }
    } catch (err) {
      Alert.alert("Export impossible", extractErrorMessage(err));
    } finally {
      setExporting(false);
    }
  }

  function handleExport() {
    Alert.alert("Télécharger le mois", "Choisissez un format", [
      { text: "Excel (.xlsx)", onPress: () => runExport("xlsx") },
      { text: "PDF (récapitulatif)", onPress: () => runExport("pdf") },
      { text: "CSV", onPress: () => runExport("csv") },
      { text: "Annuler", style: "cancel" },
    ]);
  }

  const summary = computeWeekSummary(items);

  return (
    <ScreenContainer style={{ paddingTop: spacing.md }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md }}>
        <PressableScale onPress={() => setMonth((m) => addMonths(m, -1))} style={{ padding: spacing.xs }}>
          <Ionicons name="chevron-back" size={22} color={colors.accent} />
        </PressableScale>
        <Text style={[type.headline, { color: colors.ink }]}>{capitalize(monthFmt.format(month))}</Text>
        <PressableScale onPress={() => setMonth((m) => addMonths(m, 1))} style={{ padding: spacing.xs }}>
          <Ionicons name="chevron-forward" size={22} color={colors.accent} />
        </PressableScale>
      </View>

      <Card>
        <View style={{ flexDirection: "row" }}>
          <View style={{ flex: 1 }}>
            <Text style={[type.title2, { color: colors.ink }]}>{formatHoursMinutes(summary.totalMinutes)}</Text>
            <Text style={[type.caption, { color: colors.inkTertiary, marginTop: 2 }]}>Total travaillé</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[type.title2, { color: colors.success }]}>{formatHoursMinutes(summary.validatedMinutes)}</Text>
            <Text style={[type.caption, { color: colors.inkTertiary, marginTop: 2 }]}>Validées</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[type.title2, { color: colors.neutral }]}>{formatHoursMinutes(summary.pendingMinutes)}</Text>
            <Text style={[type.caption, { color: colors.inkTertiary, marginTop: 2 }]}>En attente</Text>
          </View>
        </View>
      </Card>

      <View style={{ marginTop: spacing.md, marginBottom: spacing.lg }}>
        <Button
          label="Télécharger le fichier du mois"
          variant="secondary"
          icon="download-outline"
          loading={exporting}
          disabled={items.length === 0}
          onPress={handleExport}
        />
      </View>

      {state === "loading" && <StateView kind="loading" />}
      {state === "error" && <StateView kind="error" onRetry={load} />}
      {state === "ready" && items.length === 0 && (
        <StateView kind="empty" icon="time-outline" message="Aucun pointage sur ce mois." />
      )}

      {state === "ready" && items.length > 0 && (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: spacing.xxl }}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          renderItem={({ item, index }) => (
            <Animated.View entering={FadeInUp.delay(Math.min(index, 6) * 30).duration(240)}>
              <PressableScale onPress={() => navigation.navigate("TimeEntryDetail", { entryId: item.id })} accessibilityLabel="Voir le détail du pointage">
              <Card>
                <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
                  <View style={{ flex: 1, marginRight: spacing.sm }}>
                    <Text style={[type.headline, { color: colors.ink }]}>
                      {dayFmt.format(new Date(item.clockIn))} · {timeFmt.format(new Date(item.clockIn))} –{" "}
                      {item.clockOut ? timeFmt.format(new Date(item.clockOut)) : "en cours"}
                    </Text>
                    <Text style={[type.footnote, { color: colors.inkSecondary, marginTop: 2 }]}>
                      {formatDuration(item.clockIn, item.clockOut)}
                      {item.isRetroactive ? " · Différé" : ""}
                    </Text>
                  </View>
                  <TimeEntryStatusBadge status={item.status} />
                </View>
              </Card>
              </PressableScale>
            </Animated.View>
          )}
        />
      )}
    </ScreenContainer>
  );
}
