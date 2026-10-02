import React, { useCallback, useState } from "react";
import { Alert, Linking, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import Animated, { FadeInUp } from "react-native-reanimated";
import { ScreenContainer } from "../../components/ScreenContainer";
import { StateView } from "../../components/StateView";
import { Card } from "../../components/Card";
import { TimeEntryStatusBadge } from "../../components/TimeEntryStatusBadge";
import { Button } from "../../components/Button";
import { TextField } from "../../components/TextField";
import { DateTimeField } from "../../components/DateTimeField";
import { useAuth } from "../../auth/AuthContext";
import { extractErrorMessage } from "../../api/client";
import { useTheme } from "../../theme/ThemeProvider";
import { createTimeEntryForUser, getReconciliationDetail } from "../../api/timesheets.api";
import type { ReconciliationDetail, ReconciliationMissionEntry } from "../../api/timesheets.api";
import { formatHoursMinutes } from "../../utils/timesheetSummary";
import type { MenuStackParamList } from "../../navigation/MenuStack";
import { frenchDateFormat } from "../../utils/frenchDate";

const dayFmt = frenchDateFormat({ weekday: "short", day: "numeric", month: "short" });
const timeFmt = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });
const GAP_TOLERANCE_MINUTES = 15;
// Rôles qui peuvent saisir le pointage d'un collaborateur (mêmes droits que la
// validation des heures, revérifiés côté serveur).
const ENTRY_FOR_USER_ROLES = ["SITE_MANAGER", "SUPERVISOR", "HR", "DIRECTOR", "ADMIN"];

type Route = RouteProp<MenuStackParamList, "ReconciliationDetail">;

function GapBadge({ gapMinutes }: { gapMinutes: number }) {
  const { colors, spacing, radius, type } = useTheme();
  let label = "Conforme";
  let tone = colors.success;
  if (gapMinutes > GAP_TOLERANCE_MINUTES) {
    label = `+${formatHoursMinutes(gapMinutes)} (heures supp.)`;
    tone = colors.warning;
  } else if (gapMinutes < -GAP_TOLERANCE_MINUTES) {
    label = `-${formatHoursMinutes(-gapMinutes)} manquantes`;
    tone = colors.danger;
  }
  return (
    <View style={{ backgroundColor: tone + "1A", borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 3, alignSelf: "flex-start" }}>
      <Text style={[type.caption, { color: tone }]}>{label}</Text>
    </View>
  );
}

function EntryRow({ entry }: { entry: ReconciliationMissionEntry["matchedEntries"][number] }) {
  const { colors, spacing, type } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.xs }}>
      <View style={{ flex: 1 }}>
        <Text style={[type.footnote, { color: colors.ink }]}>
          {timeFmt.format(new Date(entry.clockIn))} – {entry.clockOut ? timeFmt.format(new Date(entry.clockOut)) : "en cours"}
        </Text>
        {!!entry.validatedBy && (
          <Text style={[type.caption, { color: colors.inkTertiary, marginTop: 1 }]}>
            {entry.status === "REJECTED" ? "Refusé" : "Validé"} par {entry.validatedBy.firstName} {entry.validatedBy.lastName}
          </Text>
        )}
      </View>
      <TimeEntryStatusBadge status={entry.status} />
    </View>
  );
}

// Saisie, par le responsable, des heures d'une mission que la personne a
// oublié de pointer, après l'avoir appelée. Horaires de la mission
// pré-remplis, modifiables ; motif obligatoire.
function MissingEntryForm({
  userId,
  mission,
  onDone,
  onCancel,
}: {
  userId: string;
  mission: ReconciliationMissionEntry["mission"];
  onDone: () => void;
  onCancel: () => void;
}) {
  const { colors, spacing, type } = useTheme();
  const [start, setStart] = useState(() => new Date(mission.startTime));
  const [end, setEnd] = useState(() => new Date(mission.endTime));
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setError(null);
    if (!comment.trim()) {
      setError("Indiquez le motif, par exemple « Confirmé par téléphone, oubli de pointer ».");
      return;
    }
    if (end <= start) {
      setError("L'heure de fin doit être après l'heure de début.");
      return;
    }
    setSaving(true);
    try {
      await createTimeEntryForUser(userId, {
        missionId: mission.id,
        clockIn: start.toISOString(),
        clockOut: end.toISOString(),
        comment: comment.trim(),
      });
      onDone();
    } catch (err) {
      setError(extractErrorMessage(err, "Enregistrement impossible."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={{ marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border }}>
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <DateTimeField label="Arrivée" mode="time" value={start} onChange={setStart} formatValue={(d) => timeFmt.format(d)} />
        </View>
        <View style={{ flex: 1 }}>
          <DateTimeField label="Départ" mode="time" value={end} onChange={setEnd} formatValue={(d) => timeFmt.format(d)} />
        </View>
      </View>
      <TextField
        label="Motif"
        placeholder="Ex. Confirmé par téléphone, oubli de pointer"
        value={comment}
        onChangeText={setComment}
      />
      {!!error && <Text style={[type.footnote, { color: colors.danger, marginBottom: spacing.sm }]}>{error}</Text>}
      <Text style={[type.caption, { color: colors.inkTertiary, marginBottom: spacing.sm }]}>
        Le pointage est enregistré validé à votre nom, et la personne est prévenue.
      </Text>
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <Button label="Annuler" variant="secondary" size="md" onPress={onCancel} />
        </View>
        <View style={{ flex: 1 }}>
          <Button label="Enregistrer" size="md" loading={saving} onPress={handleSave} />
        </View>
      </View>
    </View>
  );
}

// Détail du rapprochement pointage <-> mission pour une personne : pour
// chaque mission planifiée, les pointages rattachés (recoupement horaire),
// l'écart calculé et qui a validé — pour que la RH comprenne d'où vient un
// écart signalé sur ReconciliationScreen sans rouvrir chaque mission une par une.
export function ReconciliationDetailScreen() {
  const { colors, spacing, type } = useTheme();
  const { params } = useRoute<Route>();
  const { user } = useAuth();
  const canEnterForUser = !!user && user.id !== params.userId && ENTRY_FOR_USER_ROLES.includes(user.role);
  const [editingMissionId, setEditingMissionId] = useState<string | null>(null);

  const [detail, setDetail] = useState<ReconciliationDetail | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  const load = useCallback(async () => {
    try {
      setState("loading");
      setDetail(await getReconciliationDetail(params.userId, params.from, params.to));
      setState("ready");
    } catch {
      setState("error");
    }
  }, [params.userId, params.from, params.to]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  async function callUser(phone: string) {
    const url = `tel:${phone.replace(/\s/g, "")}`;
    const supported = await Linking.canOpenURL(url).catch(() => false);
    if (!supported) {
      // Navigateur d'ordinateur : pas d'application téléphone, on affiche le numéro.
      Alert.alert(`${detail?.user.firstName ?? ""} ${detail?.user.lastName ?? ""}`.trim(), `Téléphone : ${phone}`);
      return;
    }
    await Linking.openURL(url);
  }

  if (state === "loading" && !detail) {
    return (
      <ScreenContainer>
        <StateView kind="loading" />
      </ScreenContainer>
    );
  }
  if (state === "error" || !detail) {
    return (
      <ScreenContainer>
        <StateView kind="error" onRetry={load} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={{ paddingTop: spacing.lg, paddingBottom: spacing.xxl }} showsVerticalScrollIndicator={false}>
        {canEnterForUser && (
          <Card style={{ marginBottom: spacing.sm }}>
            <Text style={[type.headline, { color: colors.ink }]}>
              {detail.user.firstName} {detail.user.lastName}
            </Text>
            <Text style={[type.footnote, { color: colors.inkSecondary, marginTop: 2 }]}>
              {detail.user.phone
                ? `${detail.user.phone} · appelez pour vérifier les heures avant de les saisir`
                : "Aucun numéro enregistré. La RH peut l'ajouter sur sa fiche."}
            </Text>
            {!!detail.user.phone && (
              <View style={{ marginTop: spacing.md }}>
                <Button label="Appeler" icon="call-outline" size="md" onPress={() => void callUser(detail.user.phone!)} />
              </View>
            )}
          </Card>
        )}

        <Card style={{ marginBottom: spacing.lg }}>
          <View style={{ flexDirection: "row" }}>
            <View style={{ flex: 1 }}>
              <Text style={[type.title2, { color: colors.ink }]}>{formatHoursMinutes(detail.totals.workedMinutes)}</Text>
              <Text style={[type.caption, { color: colors.inkTertiary, marginTop: 2 }]}>Pointées</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[type.title2, { color: colors.ink }]}>{formatHoursMinutes(detail.totals.scheduledMinutes)}</Text>
              <Text style={[type.caption, { color: colors.inkTertiary, marginTop: 2 }]}>Prévues (missions)</Text>
            </View>
          </View>
        </Card>

        {detail.missions.length === 0 && detail.unmatchedEntries.length === 0 && (
          <StateView kind="empty" icon="calendar-outline" message="Aucune mission ni pointage sur cette période." />
        )}

        {detail.missions.map((m, index) => (
          <Animated.View key={m.mission.id} entering={FadeInUp.delay(Math.min(index, 6) * 30).duration(240)}>
            <Card style={{ marginBottom: spacing.sm }}>
              <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
                <View style={{ flex: 1, marginRight: spacing.sm }}>
                  <Text style={[type.headline, { color: colors.ink }]}>{m.mission.title}</Text>
                  <Text style={[type.footnote, { color: colors.inkSecondary, marginTop: 2 }]}>
                    {m.mission.site.name} · {dayFmt.format(new Date(m.mission.date))} · {timeFmt.format(new Date(m.mission.startTime))}–
                    {timeFmt.format(new Date(m.mission.endTime))} ({formatHoursMinutes(m.scheduledMinutes)})
                  </Text>
                </View>
                <GapBadge gapMinutes={m.gapMinutes} />
              </View>

              {m.matchedEntries.length === 0 ? (
                <View style={{ flexDirection: "row", alignItems: "center", marginTop: spacing.sm }}>
                  <Ionicons name="alert-circle-outline" size={14} color={colors.danger} />
                  <Text style={[type.footnote, { color: colors.danger, marginLeft: 4 }]}>Aucun pointage rattaché à cette mission.</Text>
                </View>
              ) : (
                m.matchedEntries.map((e) => <EntryRow key={e.id} entry={e} />)
              )}

              {canEnterForUser &&
                m.matchedEntries.length === 0 &&
                new Date(m.mission.endTime).getTime() <= Date.now() &&
                (editingMissionId === m.mission.id ? (
                  <MissingEntryForm
                    userId={params.userId}
                    mission={m.mission}
                    onCancel={() => setEditingMissionId(null)}
                    onDone={() => {
                      setEditingMissionId(null);
                      void load();
                    }}
                  />
                ) : (
                  <View style={{ marginTop: spacing.md }}>
                    <Button
                      label="Saisir le pointage"
                      icon="time-outline"
                      variant="secondary"
                      size="md"
                      onPress={() => setEditingMissionId(m.mission.id)}
                    />
                  </View>
                ))}
            </Card>
          </Animated.View>
        ))}

        {detail.unmatchedEntries.length > 0 && (
          <View style={{ marginTop: spacing.md }}>
            <Text style={[type.overline, { color: colors.inkTertiary, marginBottom: spacing.sm }]}>
              POINTAGES SANS MISSION CORRESPONDANTE
            </Text>
            <Card>
              {detail.unmatchedEntries.map((e, i) => (
                <View key={e.id} style={{ marginTop: i === 0 ? 0 : spacing.sm, paddingTop: i === 0 ? 0 : spacing.sm, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.border }}>
                  <EntryRow entry={e} />
                </View>
              ))}
            </Card>
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
