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
  listMissions,
  updateMission,
  updateMissionAssignments,
} from "../../api/missions.api";
import type { AssignmentConflict, Mission } from "../../api/missions.api";
import { listAbsences } from "../../api/absences.api";
import type { Availability } from "../../components/EmployeePickerModal";
import { listStandards } from "../../api/standards.api";
import type { CleaningStandard } from "../../api/standards.api";
import type { MissionsStackParamList } from "../../navigation/MissionsStack";
import { toLocalDateKey } from "../../utils/missionFormat";
import { frenchDateFormat } from "../../utils/frenchDate";

type Route = RouteProp<
  { MissionForm: { missionId?: string; initialDate?: string; initialSiteId?: string; initialAssigneeId?: string } | undefined },
  "MissionForm"
>;

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
  // Ouvert depuis une case du planning par personne : cette personne est
  // déjà affectée (employé) ou désignée chef d'équipe (compte chef d'équipe).
  const initialAssigneeIdParam = route.params?.initialAssigneeId;

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
      if (!missionId && initialAssigneeIdParam) {
        if (employeesRes.items.some((u) => u.id === initialAssigneeIdParam)) setEmployeeIds([initialAssigneeIdParam]);
        else if (teamLeadsRes.items.some((u) => u.id === initialAssigneeIdParam)) setLeadId(initialAssigneeIdParam);
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

  // Disponibilité de chaque personne pour le jour et l'horaire choisis
  // (retour explicite du client) : où elle est déjà affectée et à quelle
  // heure, pour ne jamais prévoir quelqu'un qui est déjà ailleurs.
  const [weekMissions, setWeekMissions] = useState<Mission[]>([]);
  const [absentIds, setAbsentIds] = useState<Set<string>>(new Set());
  const dayKey = toLocalDateKey(date);
  // Semaine (lundi → dimanche) de la date choisie : sert au compteur
  // « heures restantes » face aux heures du contrat.
  const [weekStartKey, weekEndKey] = useMemo(() => {
    const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate() - ((date.getDay() + 6) % 7));
    const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
    return [toLocalDateKey(monday), toLocalDateKey(sunday)];
  }, [date]);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [missionsRes, absencesRes] = await Promise.all([
        listMissions({ from: weekStartKey, to: weekEndKey, pageSize: 100 }).catch(() => null),
        listAbsences({ status: "APPROVED", from: dayKey, to: dayKey }).catch(() => null),
      ]);
      if (cancelled) return;
      setWeekMissions((missionsRes?.items ?? []).filter((m) => m.status !== "CANCELLED" && m.id !== missionId));
      setAbsentIds(new Set((absencesRes?.items ?? []).map((a) => a.userId)));
    })();
    return () => {
      cancelled = true;
    };
  }, [dayKey, weekStartKey, weekEndKey, missionId]);
  const dayMissions = useMemo(
    () => weekMissions.filter((m) => toLocalDateKey(new Date(m.startTime)) === dayKey),
    [weekMissions, dayKey]
  );

  const availability = useMemo(() => {
    const minutesOf = (d: Date) => d.getHours() * 60 + d.getMinutes();
    const wantedStart = minutesOf(startTime);
    const wantedEnd = minutesOf(endTime);
    const result: Record<string, Availability> = {};
    for (const id of absentIds) result[id] = { blocking: true, label: "Absent ce jour-là (congé ou absence approuvée)" };
    for (const mission of dayMissions) {
      const start = new Date(mission.startTime);
      const end = new Date(mission.endTime);
      const overlaps = minutesOf(start) < wantedEnd && minutesOf(end) > wantedStart;
      const where = `${mission.site.name}, ${timeFmt.format(start)}–${timeFmt.format(end)}`;
      for (const assignment of mission.assignments) {
        const current = result[assignment.userId];
        if (current?.blocking) continue;
        result[assignment.userId] = overlaps
          ? { blocking: true, label: `Déjà prise : ${where}` }
          : { blocking: false, label: current ? `${current.label} · ${where}` : `Aussi ce jour-là : ${where}` };
      }
    }
    // Compteur de la semaine (si la RH a renseigné les heures du contrat) :
    // ce qui reste à planifier une fois cette mission ajoutée.
    const missionMinutes = Math.max(0, wantedEnd - wantedStart);
    const plannedByUser = new Map<string, number>();
    for (const mission of weekMissions) {
      const minutes = (new Date(mission.endTime).getTime() - new Date(mission.startTime).getTime()) / 60000;
      for (const a of mission.assignments) plannedByUser.set(a.userId, (plannedByUser.get(a.userId) ?? 0) + minutes);
    }
    const fmt = (minutes: number) => {
      const h = Math.floor(minutes / 60);
      const m = Math.round(minutes % 60);
      return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, "0")}`;
    };
    for (const person of [...employees, ...teamLeads]) {
      if (person.weeklyHours == null) continue;
      const remaining = person.weeklyHours * 60 - (plannedByUser.get(person.id) ?? 0);
      const after = remaining - missionMinutes;
      const hours =
        remaining <= 0
          ? { text: `Semaine déjà complète (${fmt(person.weeklyHours * 60)})`, over: true }
          : after < 0
            ? { text: `Reste ${fmt(remaining)} cette semaine : cette mission dépasserait de ${fmt(-after)}`, over: true }
            : { text: `Reste ${fmt(remaining)} cette semaine sur ${fmt(person.weeklyHours * 60)}`, over: false };
      result[person.id] = { ...(result[person.id] ?? { blocking: false, label: "" }), hours };
    }
    return result;
  }, [dayMissions, weekMissions, absentIds, startTime, endTime, employees, teamLeads]);

  const unavailableSelected = useMemo(
    () =>
      [...employees, ...teamLeads]
        .filter((u) => (employeeIds.includes(u.id) || u.id === leadId) && availability[u.id]?.blocking)
        .map((u) => `${u.firstName} ${u.lastName} — ${availability[u.id]!.label}`),
    [employees, teamLeads, employeeIds, leadId, availability]
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
          {unavailableSelected.map((line) => (
            <Text key={line} style={[type.footnote, { color: colors.danger, marginTop: spacing.xxs }]}>
              {line}
            </Text>
          ))}
        </View>

        <View style={{ marginBottom: spacing.md }}>
          <Text style={[type.subhead, { color: colors.inkSecondary, marginBottom: spacing.xxs }]}>
            Chef d'équipe (optionnel)
          </Text>
          <Card padded={false}>
            <Picker selectedValue={leadId ?? NONE} onValueChange={(v) => setLeadId(v === NONE ? undefined : v)} style={pickerStyle(colors)} itemStyle={{ color: colors.ink }}>
              <Picker.Item label="Aucun pour cette mission" value={NONE} />
              {teamLeads.map((t) => (
                <Picker.Item
                  key={t.id}
                  label={
                    availability[t.id]?.blocking
                      ? `${t.firstName} ${t.lastName} — ${availability[t.id]!.label}`
                      : `${t.firstName} ${t.lastName}`
                  }
                  value={t.id}
                />
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
        availability={availability}
        onToggle={toggleAssignee}
        onClose={() => setPickerOpen(false)}
      />
    </ScreenContainer>
  );
}
