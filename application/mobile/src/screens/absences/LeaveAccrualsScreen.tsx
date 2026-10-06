import React, { useCallback, useMemo, useState } from "react";
import { FlatList, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRoute } from "@react-navigation/native";
import { ScreenContainer } from "../../components/ScreenContainer";
import { StateView } from "../../components/StateView";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { TextField } from "../../components/TextField";
import { PressableScale } from "../../components/PressableScale";
import { useTheme } from "../../theme/ThemeProvider";
import { useAuth } from "../../auth/AuthContext";
import { extractErrorMessage } from "../../api/client";
import { listLeaveAccruals, validateLeaveAccrual, validateLeaveMonth } from "../../api/leave.api";
import type { LeaveAccrual } from "../../api/leave.api";
import { formatDays } from "../../utils/leaveDays";
import { Alert } from "../../utils/alert";
import { useLiveFocusEffect, isBackgroundRefresh } from "../../sync/liveSync";

const monthFmt = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
const dateFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });
const VALIDATOR_ROLES = ["HR", "DIRECTOR", "ADMIN"];

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1 + delta, 1)).toISOString().slice(0, 7);
}
function monthTitle(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const label = monthFmt.format(new Date(Date.UTC(y!, m! - 1, 1)));
  return label.charAt(0).toUpperCase() + label.slice(1);
}
const plural = (n: number, word: string) => `${formatDays(n)} ${word}${n >= 2 ? "s" : ""}`;

// Détail lisible du calcul d'un mois : d'où viennent les jours acquis.
function detailLines(a: LeaveAccrual): string[] {
  const d = a.details;
  const lines: string[] = [];
  if (d.consideredDays < d.monthDays) lines.push(`Contrat sur ${d.consideredDays} jours du mois sur ${d.monthDays} (prorata)`);
  if (d.workedDays > 0) lines.push(`${plural(d.workedDays, "jour")} de travail`);
  if (d.assimilatedDays > 0) lines.push(`${plural(d.assimilatedDays, "jour")} assimilé${d.assimilatedDays >= 2 ? "s" : ""} (congé payé, accident du travail, maternité…)`);
  if (d.sickDays > 0) lines.push(`${plural(d.sickDays, "jour")} d'arrêt maladie (${formatDays(d.sickRate)} j / mois)`);
  if (d.unpaidDays > 0) lines.push(`${plural(d.unpaidDays, "jour")} sans solde (aucun droit)`);
  if (d.capped) lines.push("Plafond de la période de référence atteint");
  return lines;
}

// Compteurs de congés (RH, direction, admin) : chaque mois, l'application
// calcule les congés acquis de chaque salarié selon son temps de travail et
// ses absences. La RH vérifie, corrige si besoin (avec un motif), puis valide :
// seuls les jours validés comptent dans le solde du salarié.
export function LeaveAccrualsScreen() {
  const { colors, spacing, type } = useTheme();
  const { user } = useAuth();
  const canValidate = !!user && VALIDATOR_ROLES.includes(user.role);

  const lastMonth = useMemo(() => {
    const now = new Date();
    return new Date(Date.UTC(now.getFullYear(), now.getMonth() - 1, 1)).toISOString().slice(0, 7);
  }, []);
  // Ouvert depuis une notification « Congés acquis à valider » : le mois concerné.
  const route = useRoute();
  const initialMonth = (route.params as { month?: string } | undefined)?.month;
  const [month, setMonth] = useState(initialMonth ?? lastMonth);
  const [items, setItems] = useState<LeaveAccrual[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [daysText, setDaysText] = useState("");
  const [note, setNote] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const silent = isBackgroundRefresh();
    try {
      if (!silent) setState("loading");
      setItems(await listLeaveAccruals({ month }));
      setState("ready");
    } catch {
      if (!silent) setState("error");
    }
  }, [month]);

  useLiveFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const toValidate = items.filter((a) => a.status === "PROPOSED" && a.userId !== user?.id);

  async function validate(a: LeaveAccrual, withCorrection: boolean) {
    setError(null);
    let days: number | undefined;
    if (withCorrection) {
      days = Number(daysText.replace(",", "."));
      if (!daysText.trim() || Number.isNaN(days) || days < 0) {
        setError("Indiquez un nombre de jours, par exemple 2 ou 1,5.");
        return;
      }
      if (!note.trim()) {
        setError("Indiquez le motif de la correction.");
        return;
      }
    }
    setBusyId(a.id);
    try {
      const updated = await validateLeaveAccrual(a.id, withCorrection ? { days, note: note.trim() } : {});
      setItems((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
      setEditingId(null);
      setDaysText("");
      setNote("");
    } catch (err) {
      setError(extractErrorMessage(err, "Validation impossible."));
    } finally {
      setBusyId(null);
    }
  }

  async function validateAll() {
    setBusyId("all");
    try {
      await validateLeaveMonth(month);
      await load();
    } catch (err) {
      Alert.alert("Validation impossible", extractErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  const header = (
    <>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md }}>
        <PressableScale onPress={() => setMonth((m) => shiftMonth(m, -1))} hitSlop={10} accessibilityLabel="Mois précédent">
          <Ionicons name="chevron-back" size={22} color={colors.accent} />
        </PressableScale>
        <Text style={[type.headline, { color: colors.ink }]}>{monthTitle(month)}</Text>
        <PressableScale
          onPress={() => month < lastMonth && setMonth((m) => shiftMonth(m, 1))}
          hitSlop={10}
          accessibilityLabel="Mois suivant"
          disabled={month >= lastMonth}
        >
          <Ionicons name="chevron-forward" size={22} color={month >= lastMonth ? colors.border : colors.accent} />
        </PressableScale>
      </View>
      <Card style={{ marginBottom: spacing.md }}>
        <Text style={[type.callout, { color: colors.ink }]}>
          {toValidate.length > 0
            ? `${toValidate.length} relevé${toValidate.length > 1 ? "s" : ""} à vérifier et valider`
            : items.length > 0
              ? "Tous les relevés de ce mois sont validés."
              : "Aucun relevé pour ce mois."}
        </Text>
        <Text style={[type.footnote, { color: colors.inkTertiary, marginTop: 4 }]}>
          Calcul automatique à la fin de chaque mois : 2,5 jours ouvrables par mois de travail (30 par an), 2 jours par mois
          d'arrêt maladie, rien pour le congé sans solde. Les jours ne comptent dans le solde qu'une fois validés.
        </Text>
        {canValidate && toValidate.length > 1 && (
          <View style={{ marginTop: spacing.md }}>
            <Button label={`Tout valider (${toValidate.length})`} icon="checkmark-done-outline" loading={busyId === "all"} onPress={validateAll} />
          </View>
        )}
      </Card>
      {!!error && <Text style={[type.footnote, { color: colors.danger, marginBottom: spacing.sm }]}>{error}</Text>}
    </>
  );

  return (
    <ScreenContainer style={{ paddingTop: spacing.md }}>
      {state === "loading" && (
        <>
          {header}
          <StateView kind="loading" />
        </>
      )}
      {state === "error" && <StateView kind="error" onRetry={load} />}
      {state === "ready" && (
        <FlatList
          data={items}
          keyExtractor={(a) => a.id}
          ListHeaderComponent={header}
          contentContainerStyle={{ paddingBottom: spacing.xxl }}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          renderItem={({ item: a }) => {
            const proposed = a.status === "PROPOSED";
            const editing = editingId === a.id;
            const corrected = a.days !== a.computedDays;
            return (
              <Card>
                <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[type.headline, { color: colors.ink }]}>
                      {a.user.firstName} {a.user.lastName}
                    </Text>
                    {a.user.weeklyHours != null && (
                      <Text style={[type.caption, { color: colors.inkTertiary, marginTop: 1 }]}>Contrat {formatDays(a.user.weeklyHours)} h / semaine</Text>
                    )}
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={[type.title3, { color: proposed ? colors.warning : colors.success }]}>+{formatDays(a.days)} j</Text>
                    <Text style={[type.caption, { color: proposed ? colors.warning : colors.success, fontWeight: "600" }]}>
                      {proposed ? "À valider" : "Validé"}
                    </Text>
                  </View>
                </View>
                {detailLines(a).map((l) => (
                  <Text key={l} style={[type.footnote, { color: colors.inkSecondary, marginTop: 3 }]}>
                    • {l}
                  </Text>
                ))}
                {corrected && (
                  <Text style={[type.footnote, { color: colors.purple, marginTop: 4 }]}>
                    Corrigé : calcul {formatDays(a.computedDays)} j → {formatDays(a.days)} j{a.note ? ` · ${a.note}` : ""}
                  </Text>
                )}
                {!proposed && !!a.validatedBy && (
                  <Text style={[type.caption, { color: colors.inkTertiary, marginTop: 4 }]}>
                    Validé par {a.validatedBy.firstName} {a.validatedBy.lastName}
                    {a.validatedAt ? ` le ${dateFmt.format(new Date(a.validatedAt))}` : ""}
                  </Text>
                )}

                {proposed && a.userId === user?.id && (
                  <Text style={[type.caption, { color: colors.inkTertiary, marginTop: spacing.sm }]}>
                    Votre propre relevé est validé par une autre personne (direction ou RH).
                  </Text>
                )}
                {proposed && canValidate && a.userId !== user?.id && !editing && (
                  <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
                    <View style={{ flex: 1 }}>
                      <Button
                        label="Corriger"
                        variant="secondary"
                        size="md"
                        onPress={() => {
                          setEditingId(a.id);
                          setDaysText(formatDays(a.days));
                          setNote("");
                          setError(null);
                        }}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Button label="Valider" size="md" loading={busyId === a.id} onPress={() => validate(a, false)} />
                    </View>
                  </View>
                )}
                {editing && (
                  <View style={{ marginTop: spacing.md }}>
                    <TextField label="Jours acquis retenus" placeholder="Ex. 2,5" keyboardType="decimal-pad" value={daysText} onChangeText={setDaysText} />
                    <TextField label="Motif de la correction" placeholder="Ex. Absence injustifiée du 12 au 14" value={note} onChangeText={setNote} />
                    <View style={{ flexDirection: "row", gap: spacing.sm }}>
                      <View style={{ flex: 1 }}>
                        <Button label="Annuler" variant="secondary" size="md" onPress={() => setEditingId(null)} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Button label="Corriger et valider" size="md" loading={busyId === a.id} onPress={() => validate(a, true)} />
                      </View>
                    </View>
                  </View>
                )}
              </Card>
            );
          }}
        />
      )}
    </ScreenContainer>
  );
}
