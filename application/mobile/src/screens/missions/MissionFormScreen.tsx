import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Platform, ScrollView, Text, View } from "react-native";
import { Alert } from "../../utils/alert";
import { Picker } from "@react-native-picker/picker";
import { pickerStyle } from "../../components/pickerStyle";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { StateView } from "../../components/StateView";
import { TextField } from "../../components/TextField";
import { DateTimeField } from "../../components/DateTimeField";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Checkbox } from "../../components/Checkbox";
import { PressableScale } from "../../components/PressableScale";
import { EmployeePickerModal } from "../../components/EmployeePickerModal";
import { useTheme } from "../../theme/ThemeProvider";
import { useResponsive } from "../../hooks/useResponsive";
import { extractErrorMessage } from "../../api/client";
import { listSites } from "../../api/sites.api";
import type { Site } from "../../api/sites.api";
import { listUsers } from "../../api/users.api";
import type { DirectoryUser } from "../../api/users.api";
import {
  createMission,
  getAssignmentConflicts,
  getMission,
  updateMission,
  updateMissionAssignments,
} from "../../api/missions.api";
import type { AssignmentConflict } from "../../api/missions.api";
import { listStandards } from "../../api/standards.api";
import type { CleaningStandard } from "../../api/standards.api";
import type { MissionsStackParamList } from "../../navigation/MissionsStack";
import { toLocalDateKey } from "../../utils/missionFormat";
import { frenchDateFormat } from "../../utils/frenchDate";

type Route = RouteProp<{ MissionForm: { missionId?: string; initialDate?: string; initialSiteId?: string } | undefined }, "MissionForm">;

const NONE = "__none__";
const dateFmt = frenchDateFormat({ weekday: "short", day: "numeric", month: "short", year: "numeric" });
const timeFmt = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });

// 0 = dimanche ... 6 = samedi (JS Date#getDay) — même convention que le serveur.
const WEEKDAYS: { value: number; label: string }[] = [
  { value: 1, label: "Lun" },
  { value: 2, label: "Mar" },
  { value: 3, label: "Mer" },
  { value: 4, label: "Jeu" },
  { value: 5, label: "Ven" },
  { value: 6, label: "Sam" },
  { value: 0, label: "Dim" },
];

function toTimeInput(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function defaultDate(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function timeAt(hours: number, minutes: number): Date {
  const d = new Date();
  d.setHours(hours, minutes, 0, 0);
  return d;
}

export function MissionFormScreen() {
  const { colors, spacing, type } = useTheme();
  const { isDesktopWeb } = useResponsive();
  const route = useRoute<Route>();
  const navigation = useNavigation<NativeStackNavigationProp<MissionsStackParamList>>();
  const missionId = route.params?.missionId;
  const isEdit = !!missionId;
  const initialDateParam = route.params?.initialDate;
  // Ouvert depuis une fiche chantier : ce chantier est présélectionné.
  const initialSiteIdParam = route.params?.initialSiteId;

  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [sites, setSites] = useState<Site[]>([]);
  const [employees, setEmployees] = useState<DirectoryUser[]>([]);
  // Comptes au rôle Chef d'équipe — retour explicite du client : le chef
  // d'équipe d'une mission est un vrai compte désigné par son rôle (attribué
  // par la RH à la création du compte), jamais une étoile posée sur un
  // employé quelconque. Distinct de "employees" ci-dessus (rôle EMPLOYEE).
  const [teamLeads, setTeamLeads] = useState<DirectoryUser[]>([]);
  const [standards, setStandards] = useState<CleaningStandard[]>([]);

  const [siteId, setSiteId] = useState<string>("");
  const [standardId, setStandardId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState<Date>(() => (initialDateParam ? new Date(`${initialDateParam}T00:00:00`) : defaultDate()));
  const [startTime, setStartTime] = useState<Date>(timeAt(8, 0));
  const [endTime, setEndTime] = useState<Date>(timeAt(17, 0));
  const [instructions, setInstructions] = useState("");
  const [employeeIds, setEmployeeIds] = useState<string[]>([]);
  const [leadId, setLeadId] = useState<string | undefined>(undefined);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [initialAssigneeIds, setInitialAssigneeIds] = useState<string[]>([]);
  const [initialLeadId, setInitialLeadId] = useState<string | undefined>(undefined);

  // Récurrence (retour explicite du client : "pas besoin de le recréer à
  // chaque fois") — uniquement à la création, jamais en édition d'une mission
  // déjà existante (une occurrence déjà créée reste une mission indépendante).
  const [repeatEnabled, setRepeatEnabled] = useState(false);
  const [repeatDays, setRepeatDays] = useState<number[]>([]);
  const [repeatUntil, setRepeatUntil] = useState<Date>(defaultDate());

  function toggleRepeatDay(value: number) {
    setRepeatDays((prev) => (prev.includes(value) ? prev.filter((d) => d !== value) : [...prev, value]));
  }

  // Fonction nommée (plutôt qu'un effet anonyme) pour que le bouton
  // "Réessayer" de l'état d'erreur puisse réellement relancer le chargement —
  // corrigé : `onRetry` ne faisait auparavant que remettre `loadState` à
  // "loading" sans jamais redéclencher cet appel, laissant l'écran bloqué
  // indéfiniment sur le spinner après un échec réseau.
  const load = useCallback(async () => {
    try {
      setLoadState("loading");
      const [sitesRes, employeesRes, teamLeadsRes] = await Promise.all([
        listSites({ isActive: true }),
        listUsers({ role: "EMPLOYEE", isActive: true }),
        listUsers({ role: "SITE_MANAGER", isActive: true }),
      ]);
      setSites(sitesRes.items);
      setEmployees(employeesRes.items);
      setTeamLeads(teamLeadsRes.items);

      if (isEdit && missionId) {
        const mission = await getMission(missionId);
        setSiteId(mission.site.id);
        setTitle(mission.title);
        setDate(new Date(mission.date));
        setStartTime(new Date(mission.startTime));
        setEndTime(new Date(mission.endTime));
        setInstructions(mission.instructions ?? "");
        const ids = mission.assignments.map((a) => a.userId);
        const lead = mission.assignments.find((a) => a.isLead)?.userId;
        setEmployeeIds(lead ? ids.filter((id) => id !== lead) : ids);
        setLeadId(lead);
        setInitialAssigneeIds(ids);
        setInitialLeadId(lead);
      } else if (initialSiteIdParam && sitesRes.items.some((site) => site.id === initialSiteIdParam)) {
        setSiteId(initialSiteIdParam);
      } else if (sitesRes.items.length > 0) {
        setSiteId(sitesRes.items[0].id);
      }
      setLoadState("ready");
    } catch {
      setLoadState("error");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missionId, isEdit]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missionId]);

  // Les standards sont propres à un chantier — rechargés à chaque changement
  // de chantier, uniquement à la création (un standard n'est appliqué qu'à
  // la création de la mission, pas en édition).
  useEffect(() => {
    if (isEdit || !siteId) {
      setStandards([]);
      setStandardId("");
      return;
    }
    (async () => {
      try {
        setStandards(await listStandards(siteId));
      } catch {
        setStandards([]);
      }
    })();
    setStandardId("");
  }, [isEdit, siteId]);

  const selectedNames = useMemo(
    () =>
      employees
        .filter((e) => employeeIds.includes(e.id))
        .map((e) => e.firstName)
        .join(", "),
    [employees, employeeIds]
  );

  function toggleAssignee(userId: string) {
    setEmployeeIds((prev) => (prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]));
  }

  async function handleSave() {
    setError(null);

    if (!isEdit && !siteId) {
      setError("Sélectionnez un chantier.");
      return;
    }
    if (!title.trim()) {
      setError("Le titre de la mission est requis.");
      return;
    }
    if (employeeIds.length === 0) {
      setError("Affectez au moins un employé.");
      return;
    }
    if (!isEdit && repeatEnabled && repeatDays.length === 0) {
      setError("Sélectionnez au moins un jour à répéter, ou désactivez la répétition.");
      return;
    }
    if (!isEdit && repeatEnabled && toLocalDateKey(repeatUntil) < toLocalDateKey(date)) {
      setError("La date de fin de répétition doit être postérieure à la date de la mission.");
      return;
    }

    setSaving(true);
    const assigneeIds = leadId ? [...employeeIds, leadId] : employeeIds;
    const conflicts = await getAssignmentConflicts({
      assigneeIds,
      date: toLocalDateKey(date),
      startTime: toTimeInput(startTime),
      endTime: toTimeInput(endTime),
      excludeMissionId: missionId,
    }).catch(() => [] as AssignmentConflict[]);

    if (conflicts.length > 0) {
      setSaving(false);
      const names = Array.from(new Set(conflicts.map((c) => `${c.user.firstName} ${c.user.lastName}`))).join(", ");
      const details = conflicts
        .map((c) =>
          c.kind === "MISSION_OVERLAP"
            ? `${c.user.firstName} : « ${c.conflictingMission.title} » (${c.conflictingMission.site.name}, ${timeFmt.format(
                new Date(c.conflictingMission.startTime)
              )}–${timeFmt.format(new Date(c.conflictingMission.endTime))})`
            : `${c.user.firstName} : en absence approuvée sur cette période`
        )
        .join("\n");
      // Chevauchement avec une autre mission : bloquant (retour explicite du
      // client, aussi refusé par le serveur). Une absence approuvée reste un
      // avertissement que le responsable peut passer.
      if (conflicts.some((c) => c.kind === "MISSION_OVERLAP")) {
        Alert.alert(
          "Déjà sur une autre mission",
          `Une personne ne peut pas être sur deux missions en même temps. Changez l'horaire ou retirez-la :\n\n${details}`,
          [{ text: "Corriger", style: "cancel" }]
        );
        return;
      }
      Alert.alert(
        "Absence prévue",
        `${names} : absence approuvée sur cette période.\n\n${details}`,
        [
          { text: "Corriger", style: "cancel" },
          { text: "Continuer quand même", style: "destructive", onPress: () => void proceedSave() },
        ]
      );
      return;
    }

    await proceedSave();
  }

  async function proceedSave() {
    setSaving(true);
    const assigneeIds = leadId ? [...employeeIds, leadId] : employeeIds;
    try {
      if (isEdit && missionId) {
        await updateMission(missionId, {
          title,
          date: toLocalDateKey(date),
          startTime: toTimeInput(startTime),
          endTime: toTimeInput(endTime),
          instructions: instructions.trim() || null,
        });

        const assignmentsChanged =
          assigneeIds.length !== initialAssigneeIds.length ||
          !assigneeIds.every((id) => initialAssigneeIds.includes(id)) ||
          leadId !== initialLeadId;
        if (assignmentsChanged) {
          await updateMissionAssignments(missionId, { assigneeIds, leadId });
        }

        navigation.goBack();
      } else {
        const { mission: created, recurrenceCount } = await createMission({
          siteId,
          title,
          date: toLocalDateKey(date),
          startTime: toTimeInput(startTime),
          endTime: toTimeInput(endTime),
          instructions: instructions.trim() || undefined,
          assigneeIds,
          leadId,
          standardId: standardId || undefined,
          recurrence: repeatEnabled ? { daysOfWeek: repeatDays, until: toLocalDateKey(repeatUntil) } : undefined,
        });
        if (recurrenceCount > 1) {
          Alert.alert("Mission récurrente créée", `${recurrenceCount} missions ont été créées pour cette récurrence.`);
        }
        navigation.replace("MissionDetail", { missionId: created.id });
      }
    } catch (err) {
      setError(extractErrorMessage(err, "Impossible d'enregistrer la mission."));
    } finally {
      setSaving(false);
    }
  }

  if (loadState === "loading") {
    return (
      <ScreenContainer>
        <StateView kind="loading" />
      </ScreenContainer>
    );
  }

  if (loadState === "error") {
    return (
      <ScreenContainer>
        <StateView kind="error" onRetry={load} />
      </ScreenContainer>
    );
  }

  if (!isEdit && sites.length === 0) {
    return (
      <ScreenContainer>
        <StateView kind="empty" icon="business-outline" message="Aucun chantier disponible. Créez d'abord un chantier." />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer avoidKeyboard style={{ paddingTop: spacing.lg }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          { paddingBottom: spacing.xxxl },
          isDesktopWeb && { maxWidth: 640, width: "100%", alignSelf: "center" },
        ]}
      >
        {!isEdit && (
          <View style={{ marginBottom: spacing.md }}>
            <Text style={[type.subhead, { color: colors.inkSecondary, marginBottom: spacing.xxs }]}>Chantier</Text>
            <Card padded={false}>
              <Picker selectedValue={siteId} onValueChange={setSiteId} style={pickerStyle(colors)} itemStyle={{ color: colors.ink }}>
                {sites.map((site) => (
                  <Picker.Item key={site.id} label={site.name} value={site.id} />
                ))}
              </Picker>
            </Card>
          </View>
        )}

        {!isEdit && standards.length > 0 && (
          <View style={{ marginBottom: spacing.md }}>
            <Text style={[type.subhead, { color: colors.inkSecondary, marginBottom: spacing.xxs }]}>
              Standard de nettoyage (optionnel)
            </Text>
            <Card padded={false}>
              <Picker selectedValue={standardId} onValueChange={setStandardId} style={pickerStyle(colors)} itemStyle={{ color: colors.ink }}>
                <Picker.Item label="Aucun — consignes libres" value="" />
                {standards.map((standard) => (
                  <Picker.Item key={standard.id} label={standard.name} value={standard.id} />
                ))}
              </Picker>
            </Card>
          </View>
        )}

        <TextField label="Titre de la mission" placeholder="Nettoyage des bureaux" value={title} onChangeText={setTitle} />

        <DateTimeField
          label="Date"
          mode="date"
          value={date}
          onChange={setDate}
          minimumDate={isEdit ? undefined : new Date()}
          formatValue={(d) => dateFmt.format(d)}
        />

        <View style={{ flexDirection: "row", gap: spacing.md }}>
          <View style={{ flex: 1 }}>
            <DateTimeField label="Début" mode="time" value={startTime} onChange={setStartTime} formatValue={(d) => timeFmt.format(d)} />
          </View>
          <View style={{ flex: 1 }}>
            <DateTimeField label="Fin" mode="time" value={endTime} onChange={setEndTime} formatValue={(d) => timeFmt.format(d)} />
          </View>
        </View>

        {!isEdit && (
          <View style={{ marginBottom: spacing.md }}>
            <Checkbox
              label="Répéter cette mission"
              checked={repeatEnabled}
              onChange={(v) => {
                setRepeatEnabled(v);
                if (v) {
                  const d = new Date(date);
                  d.setDate(d.getDate() + 7);
                  setRepeatUntil(d);
                }
              }}
            />
            {!!repeatEnabled && (
              <View style={{ marginTop: spacing.sm }}>
                <Text style={[type.footnote, { color: colors.inkTertiary, marginBottom: spacing.xxs }]}>
                  Jours de la semaine à répéter
                </Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
                  {WEEKDAYS.map((day) => {
                    const selected = repeatDays.includes(day.value);
                    return (
                      <PressableScale key={day.value} onPress={() => toggleRepeatDay(day.value)}>
                        <View
                          style={{
                            paddingVertical: spacing.xs,
                            paddingHorizontal: spacing.sm,
                            borderRadius: 999,
                            borderWidth: 1.5,
                            borderColor: selected ? colors.accent : colors.border,
                            backgroundColor: selected ? colors.accentSoft : colors.surface,
                          }}
                        >
                          <Text style={[type.footnote, { color: selected ? colors.accent : colors.inkSecondary, fontWeight: "600" }]}>
                            {day.label}
                          </Text>
                        </View>
                      </PressableScale>
                    );
                  })}
                </View>
                <View style={{ marginTop: spacing.sm }}>
                  <DateTimeField
                    label="Jusqu'au"
                    mode="date"
                    value={repeatUntil}
                    onChange={setRepeatUntil}
                    minimumDate={date}
                    formatValue={(d) => dateFmt.format(d)}
                  />
                </View>
              </View>
            )}
          </View>
        )}

        <View style={{ marginBottom: spacing.md }}>
          <Text style={[type.subhead, { color: colors.inkSecondary, marginBottom: spacing.xxs }]}>
            Employés affectés
          </Text>
          <Card padded={false}>
            <Button
              label={employeeIds.length > 0 ? selectedNames : "Sélectionner les employés"}
              variant="secondary"
              onPress={() => setPickerOpen(true)}
            />
          </Card>
        </View>

        <View style={{ marginBottom: spacing.md }}>
          <Text style={[type.subhead, { color: colors.inkSecondary, marginBottom: spacing.xxs }]}>
            Chef d'équipe (optionnel)
          </Text>
          <Card padded={false}>
            <Picker selectedValue={leadId ?? NONE} onValueChange={(v) => setLeadId(v === NONE ? undefined : v)} style={pickerStyle(colors)} itemStyle={{ color: colors.ink }}>
              <Picker.Item label="Aucun pour cette mission" value={NONE} />
              {teamLeads.map((t) => (
                <Picker.Item key={t.id} label={`${t.firstName} ${t.lastName}`} value={t.id} />
              ))}
            </Picker>
          </Card>
          <Text style={[type.footnote, { color: colors.inkTertiary, marginTop: spacing.xxs }]}>
            La personne désignée pour encadrer les employés affectés sur cette mission.
          </Text>
        </View>

        <TextField
          label="Consignes (optionnel)"
          placeholder="Informations complémentaires pour l'équipe"
          value={instructions}
          onChangeText={setInstructions}
          multiline
          numberOfLines={4}
          style={{ minHeight: Platform.OS === "ios" ? 90 : undefined, textAlignVertical: "top" }}
        />

        {!!error && <Text style={[type.footnote, { color: colors.danger, marginBottom: spacing.md }]}>{error}</Text>}

        <Button label={isEdit ? "Enregistrer les modifications" : "Créer la mission"} onPress={handleSave} loading={saving} />
      </ScrollView>

      <EmployeePickerModal
        visible={pickerOpen}
        employees={employees}
        selectedIds={employeeIds}
        onToggle={toggleAssignee}
        onClose={() => setPickerOpen(false)}
      />
    </ScreenContainer>
  );
}
