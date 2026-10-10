import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createMissionSchema, ROLE_LABELS, type CreateMissionInput } from "@aussitot/shared";
import { endpoints } from "@/api/endpoints";
import { ApiError } from "@/api/client";
import { useAuth } from "@/auth/AuthProvider";
import { useToday } from "@/lib/today";
import { useBreakpoint } from "@/theme/ThemeProvider";
import {
  AccessDenied,
  Button,
  DateField,
  MultiSelectField,
  Screen,
  SelectField,
  Skeleton,
  Text,
  TextField,
  TimeField,
  useToast,
} from "@/ui";

type Errors = Partial<Record<keyof CreateMissionInput | "form", string>>;

/** Création ou modification d'une mission (planificateurs). L'équipe concernée est notifiée par le serveur. */
export default function MissionFormScreen() {
  const params = useLocalSearchParams<{ id?: string; date?: string }>();
  const editingId = params.id;
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const today = useToday();
  const { isWide } = useBreakpoint();
  const { can } = useAuth();

  const [title, setTitle] = useState("");
  const [date, setDate] = useState<string | null>(params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : today);
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("12:00");
  const [siteId, setSiteId] = useState<string | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [teamLeadId, setTeamLeadId] = useState<string | null>(null);
  const [instructions, setInstructions] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [loadedId, setLoadedId] = useState<string | null>(null);

  const existing = useQuery({
    queryKey: ["mission", editingId],
    queryFn: () => endpoints.missions.get(editingId as string),
    enabled: Boolean(editingId),
  });
  const sites = useQuery({ queryKey: ["sites"], queryFn: () => endpoints.sites.list() });
  const clients = useQuery({ queryKey: ["clients", "all"], queryFn: () => endpoints.clients.list(), enabled: can("clients.read") });
  const staff = useQuery({ queryKey: ["staff"], queryFn: endpoints.users.staff });

  useEffect(() => {
    const m = existing.data;
    if (!m || loadedId === m.id) return;
    setLoadedId(m.id);
    setTitle(m.title);
    setDate(m.date);
    setStartTime(m.startTime);
    setEndTime(m.endTime);
    setSiteId(m.site?.id ?? null);
    setClientId(m.client?.id ?? null);
    setAssigneeIds(m.assignees.map((a) => a.id));
    setTeamLeadId(m.teamLead?.id ?? null);
    setInstructions(m.instructions ?? "");
  }, [existing.data, loadedId]);

  const siteOptions = useMemo(
    () =>
      (sites.data ?? [])
        .filter((s) => s.isActive)
        .map((s) => ({ value: s.id, label: s.name, description: [s.clientName, s.city].filter(Boolean).join(" · ") || undefined })),
    [sites.data],
  );
  const clientOptions = useMemo(
    () => (clients.data?.items ?? []).map((c) => ({ value: c.id, label: c.name, description: c.city ?? undefined })),
    [clients.data],
  );
  const staffOptions = useMemo(
    () => (staff.data ?? []).map((p) => ({ value: p.id, label: `${p.firstName} ${p.lastName}`, description: ROLE_LABELS[p.role] })),
    [staff.data],
  );
  const leadOptions = staffOptions.filter((o) => assigneeIds.includes(o.value));

  const save = useMutation({
    mutationFn: async (input: CreateMissionInput) =>
      editingId ? endpoints.missions.update(editingId, input) : endpoints.missions.create(input),
    onSuccess: (mission) => {
      queryClient.setQueryData(["mission", mission.id], mission);
      void queryClient.invalidateQueries({ queryKey: ["planning"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast(editingId ? "Mission modifiée : l'équipe est prévenue" : "Mission créée : l'équipe est prévenue");
      // Modification : retour à la fiche déjà ouverte ; création : la nouvelle fiche remplace le formulaire.
      if (editingId && router.canGoBack()) router.back();
      else router.replace(`/planning/${mission.id}`);
    },
    onError: (err) => {
      if (err instanceof ApiError && err.details) {
        setErrors(Object.fromEntries(Object.entries(err.details).map(([k, v]) => [k, v[0]])) as Errors);
      } else setErrors({ form: err instanceof ApiError ? err.message : "Enregistrement impossible. Réessayez." });
    },
  });

  const submit = () => {
    const input: CreateMissionInput = {
      title,
      date: date ?? "",
      startTime,
      endTime,
      siteId,
      clientId,
      assigneeIds,
      teamLeadId: teamLeadId && assigneeIds.includes(teamLeadId) ? teamLeadId : null,
      instructions: instructions || null,
    };
    const parsed = createMissionSchema.safeParse(input);
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) next[String(issue.path[0]) as keyof Errors] ??= issue.message;
      setErrors(next);
      return;
    }
    if (assigneeIds.length === 0) {
      setErrors({ assigneeIds: "Affectez au moins une personne à la mission." });
      return;
    }
    setErrors({});
    save.mutate(input);
  };

  if (!can("planning.manage")) {
    return (
      <Screen back title="Mission">
        <AccessDenied
          title="Accès réservé"
          message="La création et la modification du planning sont réservées aux responsables du planning."
        />
      </Screen>
    );
  }
  if (editingId && existing.isPending) {
    return (
      <Screen back title="Modifier la mission">
        <Skeleton height={300} radius={18} />
      </Screen>
    );
  }

  const twoCols = isWide ? { flexDirection: "row" as const, gap: 16 } : { gap: 16 };

  return (
    <Screen
      back
      title={editingId ? "Modifier la mission" : "Nouvelle mission"}
      maxWidth={760}
      footer={
        <Button
          label={editingId ? "Enregistrer" : "Créer la mission"}
          size="lg"
          fullWidth
          loading={save.isPending}
          onPress={submit}
          testID="mission-save"
        />
      }
    >
      <TextField
        label="Titre"
        value={title}
        onChangeText={setTitle}
        placeholder="ex. : Nettoyage des bureaux"
        error={errors.title}
        maxLength={160}
        testID="mission-title"
      />
      <DateField label="Date" value={date} onChange={setDate} today={today} error={errors.date} testID="mission-date" />
      <View style={twoCols}>
        <View style={{ flex: 1 }}>
          <TimeField label="Début" value={startTime} onChange={setStartTime} error={errors.startTime} testID="mission-start-time" />
        </View>
        <View style={{ flex: 1 }}>
          <TimeField label="Fin" value={endTime} onChange={setEndTime} error={errors.endTime} testID="mission-end-time" />
        </View>
      </View>
      <SelectField
        label="Lieu d'intervention"
        options={siteOptions}
        value={siteId}
        onChange={(value) => {
          setSiteId(value);
          const site = sites.data?.find((s) => s.id === value);
          if (site?.clientId && !clientId) setClientId(site.clientId);
        }}
        placeholder={sites.isPending ? "Chargement…" : "Choisir un lieu"}
        allowClear
        clearLabel="Aucun lieu"
        error={errors.siteId}
        testID="mission-site"
      />
      {can("clients.read") ? (
        <SelectField
          label="Client (facultatif)"
          options={clientOptions}
          value={clientId}
          onChange={setClientId}
          placeholder="Aucun"
          allowClear
          clearLabel="Aucun client"
          error={errors.clientId}
        />
      ) : null}
      <MultiSelectField
        label="Équipe"
        options={staffOptions}
        values={assigneeIds}
        onChange={setAssigneeIds}
        placeholder="Choisir les personnes"
        error={errors.assigneeIds}
        testID="mission-team"
      />
      {assigneeIds.length > 0 ? (
        <SelectField
          label="Chef d'équipe (facultatif)"
          options={leadOptions}
          value={teamLeadId && assigneeIds.includes(teamLeadId) ? teamLeadId : null}
          onChange={setTeamLeadId}
          placeholder="Aucun"
          allowClear
          clearLabel="Aucun chef d'équipe"
          error={errors.teamLeadId}
        />
      ) : null}
      <TextField
        label="Consignes (facultatif)"
        value={instructions}
        onChangeText={setInstructions}
        multiline
        placeholder="Accès, matériel, points d'attention…"
        error={errors.instructions}
        maxLength={4000}
      />
      {errors.form ? (
        <Text variant="subhead" tone="danger" accessibilityRole="alert">
          {errors.form}
        </Text>
      ) : null}
      <Text variant="footnote" tone="tertiary">
        Les personnes affectées reçoivent une notification. Une modification d'horaire ou de lieu les prévient aussi.
      </Text>
    </Screen>
  );
}
