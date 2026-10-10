import { useState } from "react";
import { View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleCheckBig, ClipboardList, KeyRound, MapPin, Pencil, Play, Square, Users, XCircle } from "lucide-react-native";
import { formatDayLong, ROLE_LABELS, type MissionDto } from "@aussitot/shared";
import { endpoints } from "@/api/endpoints";
import { ApiError } from "@/api/client";
import { useAuth } from "@/auth/AuthProvider";
import { DirectionsButton } from "@/features/missions/MissionCard";
import { MissionStatusBadge } from "@/features/status";
import { capitalize, formatInstant } from "@/lib/format";
import { useOrgTimezone } from "@/lib/today";
import { useBreakpoint, useTheme } from "@/theme/ThemeProvider";
import { Avatar, Badge, Button, Card, ConfirmSheet, ErrorState, ListGroup, ListRow, Screen, Sheet, Skeleton, Text, TextField, useToast } from "@/ui";

/** Détail d'une mission : où, quand, avec qui, consignes, et les actions permises au rôle. */
export default function MissionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, radius } = useTheme();
  const { isWide } = useBreakpoint();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const timezone = useOrgTimezone();
  const { user, can } = useAuth();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const [instructions, setInstructions] = useState("");
  const query = useQuery({ queryKey: ["mission", id], queryFn: () => endpoints.missions.get(id), enabled: Boolean(id) });
  const mission = query.data;

  const onUpdated = (updated: MissionDto, message: string) => {
    queryClient.setQueryData(["mission", id], updated);
    void queryClient.invalidateQueries({ queryKey: ["planning"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    toast(message);
  };
  const action = useMutation({
    mutationFn: async (kind: "start" | "finish" | "validate") => endpoints.missions[kind](id),
    onSuccess: (updated, kind) => onUpdated(updated, kind === "start" ? "Mission démarrée" : kind === "finish" ? "Mission terminée" : "Mission validée"),
    onError: (err) => toast(err instanceof ApiError ? err.message : "Action impossible pour le moment.", "error"),
  });
  const cancel = useMutation({
    mutationFn: () => endpoints.missions.cancel(id, reason.trim() || undefined),
    onSuccess: (updated) => {
      setCancelOpen(false);
      onUpdated(updated, "Mission annulée : l'équipe est prévenue");
    },
  });
  const saveInstructions = useMutation({
    mutationFn: () => endpoints.missions.setInstructions(id, instructions.trim() || null),
    onSuccess: (updated) => {
      setInstructionsOpen(false);
      onUpdated(updated, updated.instructions ? "Consigne enregistrée : l'équipe est prévenue" : "Consigne retirée");
    },
  });

  if (query.isPending) {
    return (
      <Screen back="Planning" title=" ">
        <Skeleton height={140} radius={18} />
        <Skeleton height={220} radius={18} />
      </Screen>
    );
  }
  if (!mission) {
    return (
      <Screen back="Planning" title="Mission">
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      </Screen>
    );
  }

  const involved = mission.assignees.some((a) => a.id === user?.id) || mission.teamLead?.id === user?.id;
  const manage = can("planning.manage");
  const leadOfMission = user?.role === "TEAM_LEAD" && mission.teamLead?.id === user.id;
  const canField = can("missions.field") && (manage || involved);
  const canValidate = manage || leadOfMission;
  const open = mission.status === "PLANNED" || mission.status === "IN_PROGRESS";

  const primary =
    mission.status === "PLANNED" && canField ? (
      <Button label="Démarrer la mission" icon={Play} size="lg" fullWidth={!isWide} loading={action.isPending} onPress={() => action.mutate("start")} testID="mission-start" />
    ) : mission.status === "IN_PROGRESS" && canField ? (
      <Button label="Terminer la mission" icon={Square} size="lg" variant="spark" fullWidth={!isWide} loading={action.isPending} onPress={() => action.mutate("finish")} testID="mission-finish" />
    ) : mission.status === "DONE" && canValidate ? (
      <Button label="Valider la mission" icon={CircleCheckBig} size="lg" fullWidth={!isWide} loading={action.isPending} onPress={() => action.mutate("validate")} testID="mission-validate" />
    ) : null;

  const subtitle = `${capitalize(formatDayLong(mission.date))} · ${mission.startTime} – ${mission.endTime}`;

  return (
    <Screen back="Planning" title={mission.title} subtitle={subtitle} testID="mission-detail">
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <MissionStatusBadge status={mission.status} />
        {mission.startedAt ? (
          <Text variant="footnote" tone="tertiary">
            Démarrée {formatInstant(mission.startedAt, timezone)}
          </Text>
        ) : null}
        {mission.finishedAt ? (
          <Text variant="footnote" tone="tertiary">
            · Terminée {formatInstant(mission.finishedAt, timezone)}
          </Text>
        ) : null}
        {mission.validatedAt ? (
          <Text variant="footnote" tone="tertiary">
            · Validée {formatInstant(mission.validatedAt, timezone)}
          </Text>
        ) : null}
      </View>

      {primary}

      <View style={{ flexDirection: isWide ? "row" : "column", gap: 16, alignItems: "flex-start" }}>
        <View style={{ flex: isWide ? 1 : undefined, width: isWide ? undefined : "100%", gap: 16 }}>
          <Card padding={18}>
            <View style={{ gap: 12 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <MapPin size={18} color={colors.accentText} />
                <Text variant="headline">Lieu</Text>
              </View>
              {mission.site ? (
                <>
                  <View style={{ gap: 2 }}>
                    <Text variant="callout" weight="semibold">
                      {mission.site.name}
                    </Text>
                    {mission.site.address ? (
                      <Text variant="callout" tone="secondary" selectable>
                        {mission.site.address}
                      </Text>
                    ) : null}
                  </View>
                  {mission.site.accessNotes ? (
                    <View style={{ flexDirection: "row", gap: 10, padding: 12, borderRadius: radius.md, backgroundColor: colors.surfaceMuted }}>
                      <KeyRound size={16} color={colors.textSecondary} />
                      <Text variant="subhead" tone="secondary" style={{ flex: 1 }}>
                        {mission.site.accessNotes}
                      </Text>
                    </View>
                  ) : null}
                  {mission.site.address ? (
                    <View style={{ flexDirection: "row" }}>
                      <DirectionsButton address={mission.site.address} />
                    </View>
                  ) : null}
                </>
              ) : (
                <Text variant="callout" tone="tertiary">
                  Aucun lieu indiqué.
                </Text>
              )}
              {mission.client ? (
                <Text variant="subhead" tone="secondary">
                  Client :{" "}
                  {can("clients.read") ? (
                    <Text variant="subhead" tone="accent" weight="semibold" onPress={() => router.push(`/clients/${mission.client?.id}`)}>
                      {mission.client.name}
                    </Text>
                  ) : (
                    mission.client.name
                  )}
                </Text>
              ) : null}
            </View>
          </Card>

          <Card padding={18}>
            <View style={{ gap: 12 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <ClipboardList size={18} color={colors.warning} />
                <Text variant="headline" style={{ flex: 1 }}>
                  Consignes
                </Text>
                {canValidate && mission.status !== "CANCELLED" ? (
                  <Button
                    label={mission.instructions ? "Modifier" : "Ajouter"}
                    variant="ghost"
                    size="sm"
                    icon={Pencil}
                    onPress={() => {
                      setInstructions(mission.instructions ?? "");
                      setInstructionsOpen(true);
                    }}
                    testID="mission-instructions-edit"
                  />
                ) : null}
              </View>
              <Text variant="callout" tone={mission.instructions ? "primary" : "tertiary"} selectable>
                {mission.instructions ?? "Aucune consigne particulière."}
              </Text>
            </View>
          </Card>
        </View>

        <View style={{ flex: isWide ? 1 : undefined, width: isWide ? undefined : "100%", gap: 16 }}>
          <ListGroup title={`Équipe · ${mission.assignees.length}`}>
            {mission.assignees.length === 0 ? (
              <ListRow title="Personne n'est encore affecté" icon={Users} iconTone="warning" />
            ) : (
              mission.assignees.map((p) => (
                <ListRow
                  key={p.id}
                  title={`${p.firstName} ${p.lastName}${p.id === user?.id ? " (vous)" : ""}`}
                  leading={<Avatar firstName={p.firstName} lastName={p.lastName} size={36} />}
                  trailing={mission.teamLead?.id === p.id ? <Badge label="Chef d'équipe" tone="accent" dot={false} /> : undefined}
                  onPress={can("users.read") ? () => router.push(`/equipe/${p.id}`) : undefined}
                />
              ))
            )}
            {mission.teamLead && !mission.assignees.some((a) => a.id === mission.teamLead?.id) ? (
              <ListRow
                title={`${mission.teamLead.firstName} ${mission.teamLead.lastName}`}
                subtitle={ROLE_LABELS.TEAM_LEAD}
                leading={<Avatar firstName={mission.teamLead.firstName} lastName={mission.teamLead.lastName} size={36} />}
              />
            ) : null}
          </ListGroup>

          {manage && mission.status !== "CANCELLED" && mission.status !== "VALIDATED" ? (
            <ListGroup title="Gestion">
              {open ? <ListRow title="Modifier la mission" subtitle="Date, horaires, lieu, équipe" icon={Pencil} onPress={() => router.push(`/planning/nouvelle?id=${mission.id}`)} testID="mission-edit" /> : null}
              {open ? <ListRow title="Annuler la mission" subtitle="L'équipe est prévenue aussitôt" icon={XCircle} iconTone="danger" destructive onPress={() => setCancelOpen(true)} testID="mission-cancel" /> : null}
            </ListGroup>
          ) : null}
        </View>
      </View>

      <ConfirmSheet
        visible={cancelOpen}
        title="Annuler la mission ?"
        message="Les personnes affectées reçoivent une notification. La mission reste visible dans l'historique."
        confirmLabel="Annuler la mission"
        tone="danger"
        loading={cancel.isPending}
        error={cancel.error instanceof ApiError ? cancel.error.message : cancel.error ? "Annulation impossible." : null}
        onConfirm={() => cancel.mutate()}
        onClose={() => setCancelOpen(false)}
      >
        <TextField label="Motif (facultatif)" value={reason} onChangeText={setReason} placeholder="ex. : client absent" maxLength={300} />
      </ConfirmSheet>

      <Sheet
        visible={instructionsOpen}
        onClose={() => setInstructionsOpen(false)}
        title="Consignes de la mission"
        subtitle="L'équipe affectée est notifiée à l'enregistrement."
        footer={<Button label="Enregistrer" size="lg" fullWidth loading={saveInstructions.isPending} onPress={() => saveInstructions.mutate()} testID="mission-instructions-save" />}
      >
        <TextField label="Consignes" value={instructions} onChangeText={setInstructions} multiline maxLength={4000} placeholder="ex. : code portail 4521, produits dans le local à gauche" />
        {saveInstructions.error ? (
          <Text variant="subhead" tone="danger">
            {saveInstructions.error instanceof ApiError ? saveInstructions.error.message : "Enregistrement impossible."}
          </Text>
        ) : null}
      </Sheet>
    </Screen>
  );
}
