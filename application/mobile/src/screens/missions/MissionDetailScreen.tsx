import React, { useCallback, useEffect, useState } from "react";
import { Platform, ScrollView, Text, View } from "react-native";
import { Alert } from "../../utils/alert";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { StateView } from "../../components/StateView";
import { StatusBadge } from "../../components/StatusBadge";
import { Avatar } from "../../components/Avatar";
import { ListGroup, ListRow } from "../../components/GroupedList";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { PressableScale } from "../../components/PressableScale";
import { useTheme } from "../../theme/ThemeProvider";
import { useAuth } from "../../auth/AuthContext";
import {
  attachMissionStandardDocument,
  cancelMission,
  downloadMissionStandardDocument,
  getMission,
  getMissionTimeEntries,
  removeMissionStandardDocument,
  setMissionStatus,
  updateMission,
  validateMission,
} from "../../api/missions.api";
import type { Mission, MissionTimeEntry } from "../../api/missions.api";
import { TextField } from "../../components/TextField";
import { listProblems } from "../../api/problems.api";
import type { Problem } from "../../api/problems.api";
import { ProblemStatusBadge } from "../../components/ProblemStatusBadge";
import { TimeEntryStatusBadge } from "../../components/TimeEntryStatusBadge";
import { extractErrorMessage } from "../../api/client";
import { formatMissionDay, formatMissionTimeRange, isMissionOverdue, isMissionValidated } from "../../utils/missionFormat";
import { formatDuration } from "../../utils/duration";
import { formatFileSize } from "../../utils/fileSize";
import { openDirectionsTo } from "../../utils/openMaps";
import { pickWebFile } from "../../utils/webImagePicker";
import { shareFile } from "../../utils/shareFile";
import type { MissionsStackParamList } from "../../navigation/MissionsStack";
import { frenchDateFormat } from "../../utils/frenchDate";
import { useLiveFocusEffect, isBackgroundRefresh } from "../../sync/liveSync";

type Route = RouteProp<{ MissionDetail: { missionId: string } }, "MissionDetail">;

const entryTimeFormatter = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });

const validatedAtFormatter = frenchDateFormat({
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
});

function InfoRow({ icon, label }: { icon: keyof typeof Ionicons.glyphMap; label: string }) {
  const { colors, spacing, type } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", marginTop: spacing.xs }}>
      <Ionicons name={icon} size={16} color={colors.inkTertiary} />
      <Text style={[type.callout, { color: colors.inkSecondary, marginLeft: spacing.xs, flex: 1 }]}>{label}</Text>
    </View>
  );
}

export function MissionDetailScreen() {
  const { colors, spacing, radius, type } = useTheme();
  const { user } = useAuth();
  const route = useRoute<Route>();
  const navigation = useNavigation<NativeStackNavigationProp<MissionsStackParamList>>();
  const { missionId } = route.params;

  const [mission, setMission] = useState<Mission | null>(null);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [timeEntries, setTimeEntries] = useState<MissionTimeEntry[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [validationComment, setValidationComment] = useState("");
  const [instructionsDraft, setInstructionsDraft] = useState("");
  const [savingInstructions, setSavingInstructions] = useState(false);

  const load = useCallback(async () => {
    const silent = isBackgroundRefresh();
    try {
      if (!silent) setState("loading");
      const [missionData, problemsData] = await Promise.all([getMission(missionId), listProblems({ missionId })]);
      setMission(missionData);
      setProblems(problemsData.items);
      // Suivi pointage vs mission (retour explicite du client : "voir si la
      // mission est terminée ou pas, pourquoi l'employé n'a pas pointé") —
      // utile dès que la mission a démarré, pas seulement une fois terminée ;
      // avant (SCHEDULED), personne n'a encore de raison d'avoir pointé, donc
      // rien à diagnostiquer. On tolère un échec silencieux (droits
      // restreints, aucun pointage) sans bloquer le reste de l'écran.
      if (missionData.status === "IN_PROGRESS" || missionData.status === "COMPLETED") {
        setTimeEntries(await getMissionTimeEntries(missionId).catch(() => []));
      } else {
        setTimeEntries([]);
      }
      setState("ready");
    } catch {
      if (!silent) setState("error");
    }
  }, [missionId]);

  useLiveFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  useEffect(() => {
    if (mission) setInstructionsDraft(mission.instructions ?? "");
  }, [mission?.id, mission?.instructions]);

  if (state === "loading") {
    return (
      <ScreenContainer>
        <StateView kind="loading" />
      </ScreenContainer>
    );
  }

  if (state === "error" || !mission) {
    return (
      <ScreenContainer>
        <StateView kind="error" onRetry={load} />
      </ScreenContainer>
    );
  }

  // Gère le planning lui-même (création/modification/annulation, fiche de
  // poste) — le chef d'équipe n'en fait plus partie (retour explicite du
  // client) : il garde uniquement la consigne, le suivi terrain (démarrer/
  // terminer) et la validation de fin de mission.
  const canManagePlanning =
    user?.role === "SUPERVISOR" || user?.role === "HR" || user?.role === "DIRECTOR" || user?.role === "ADMIN";
  const isOwningSiteManager = user?.role === "SITE_MANAGER" && mission.site.managerId === user.id;
  // Chef d'équipe désigné sur CETTE mission précise (leadId/isLead), qu'il
  // gère ou non le chantier par ailleurs — retour explicite du client : c'est
  // lui qui encadre l'équipe et gère l'intervention, il doit pouvoir agir
  // dessus comme le ferait le chef d'équipe propriétaire du chantier.
  const isMissionLead = user?.role === "SITE_MANAGER" && mission.assignments.some((a) => a.userId === user.id && a.isLead);
  // Retour explicite du client : le suivi terrain (démarrer/terminer une
  // mission) est ouvert à tout le monde SAUF l'employé — plus réservé au chef
  // d'équipe. La portée réelle reste bornée par la visibilité de la mission
  // (un chef d'équipe ne voit de toute façon que son chantier ou les
  // missions où il est affecté).
  const canOperateMission = user?.role !== "EMPLOYEE";
  // La validation d'une mission terminée : chef d'équipe propriétaire ou
  // désigné sur cette mission, RH, superviseur ou direction (admin
  // volontairement exclu — même liste que VALIDATE_MISSION_ROLES côté backend).
  const canValidateMission =
    isOwningSiteManager || isMissionLead || user?.role === "HR" || user?.role === "SUPERVISOR" || user?.role === "DIRECTOR";
  const completionValidation = mission.validations.find((v) => v.type === "MISSION_COMPLETION");
  // Retour explicite du client : diagnostiquer un écart pointage/mission
  // (qui a pointé, qui manque, chef d'équipe et superviseur responsables) est
  // réservé à ceux qui gèrent déjà le planning ou l'équipe de ce chantier —
  // un simple employé n'a pas à voir le détail des pointages de ses collègues
  // (déjà appliqué côté serveur, voir getMissionTimeEntries).
  const canSeeTeamPointageDetail = canManagePlanning || isOwningSiteManager || isMissionLead;
  // Employés affectés n'ayant, à ce jour, aucun pointage rapproché de cette
  // mission — c'est précisément la question "pourquoi l'employé n'a pas
  // pointé" que ce diagnostic doit permettre de repérer d'un coup d'œil.
  const missingAssignees = mission.assignments.filter((a) => !timeEntries.some((e) => e.userId === a.userId));

  async function runAction(name: string, action: () => Promise<Mission>) {
    setActionLoading(name);
    try {
      const updated = await action();
      setMission(updated);
    } catch (err) {
      Alert.alert("Action impossible", extractErrorMessage(err));
    } finally {
      setActionLoading(null);
    }
  }

  async function handleValidate() {
    setActionLoading("validate");
    try {
      const updated = await validateMission(missionId, validationComment.trim() || undefined);
      setMission(updated);
      setValidationComment("");
    } catch (err) {
      Alert.alert("Validation impossible", extractErrorMessage(err));
    } finally {
      setActionLoading(null);
    }
  }

  async function handleSaveInstructions() {
    setSavingInstructions(true);
    try {
      const updated = await updateMission(missionId, { instructions: instructionsDraft.trim() || null });
      setMission(updated);
    } catch (err) {
      Alert.alert("Enregistrement impossible", extractErrorMessage(err));
    } finally {
      setSavingInstructions(false);
    }
  }

  async function handleAttachDocument() {
    try {
      let asset: { uri: string; fileName: string; file?: File } | null = null;
      if (Platform.OS === "web") {
        const picked = await pickWebFile({ accept: "application/pdf" });
        if (!picked) return;
        asset = { uri: picked.uri, fileName: picked.fileName ?? "standard.pdf", file: picked.file };
      } else {
        const result = await DocumentPicker.getDocumentAsync({ type: "application/pdf", copyToCacheDirectory: true });
        if (result.canceled || !result.assets?.[0]) return;
        asset = { uri: result.assets[0].uri, fileName: result.assets[0].name };
      }

      setActionLoading("document");
      const updated = await attachMissionStandardDocument(missionId, asset);
      setMission(updated);
    } catch (err) {
      Alert.alert("Envoi impossible", extractErrorMessage(err));
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDownloadDocument() {
    if (!mission?.standardDocumentFileName) return;
    setActionLoading("downloadDocument");
    try {
      const bytes = await downloadMissionStandardDocument(missionId);
      await shareFile(mission.standardDocumentFileName, bytes, { mimeType: "application/pdf", uti: "com.adobe.pdf" });
    } catch (err) {
      Alert.alert("Téléchargement impossible", extractErrorMessage(err));
    } finally {
      setActionLoading(null);
    }
  }

  function handleRemoveDocument() {
    Alert.alert("Retirer ce document ?", "L'équipe ne le verra plus sur cette mission.", [
      { text: "Retour", style: "cancel" },
      {
        text: "Retirer",
        style: "destructive",
        onPress: () => runAction("removeDocument", () => removeMissionStandardDocument(missionId)),
      },
    ]);
  }

  async function performCancel(scope: "one" | "series") {
    setActionLoading("cancel");
    try {
      const { mission: updated, seriesCancelledCount } = await cancelMission(missionId, scope);
      setMission(updated);
      if (seriesCancelledCount > 0) {
        Alert.alert(
          "Série annulée",
          `${seriesCancelledCount} mission${seriesCancelledCount > 1 ? "s" : ""} à venir de cette série récurrente ${
            seriesCancelledCount > 1 ? "ont" : "a"
          } aussi été annulée${seriesCancelledCount > 1 ? "s" : ""}.`
        );
      }
    } catch (err) {
      Alert.alert("Annulation impossible", extractErrorMessage(err));
    } finally {
      setActionLoading(null);
    }
  }

  function handleCancel() {
    // Mission récurrente (retour explicite du client : symétrique de la
    // création en série) — propose d'annuler seulement cette occurrence ou
    // toutes les occurrences à venir encore programmées de la série.
    if (mission?.recurrenceGroupId) {
      Alert.alert("Annuler la mission ?", "Cette mission fait partie d'une série récurrente.", [
        { text: "Retour", style: "cancel" },
        { text: "Cette mission seulement", style: "destructive", onPress: () => void performCancel("one") },
        { text: "Toute la série à venir", style: "destructive", onPress: () => void performCancel("series") },
      ]);
      return;
    }
    Alert.alert("Annuler la mission ?", "Les employés affectés seront notifiés.", [
      { text: "Retour", style: "cancel" },
      { text: "Annuler la mission", style: "destructive", onPress: () => void performCancel("one") },
    ]);
  }

  return (
    <ScreenContainer avoidKeyboard>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: spacing.lg, paddingBottom: spacing.xxxl }}
      >
        {/* Statut au-dessus du titre : placé à côté, il réduisait le titre à
            une colonne étroite (« Entretien / quotidien / espace / coworking »). */}
        <StatusBadge status={mission.status} overdue={isMissionOverdue(mission)} validated={isMissionValidated(mission)} />
        <Text style={[type.title1, { color: colors.ink, marginTop: spacing.sm }]}>{mission.title}</Text>

        <Card style={{ marginTop: spacing.lg }}>
          <InfoRow icon="calendar-outline" label={formatMissionDay(mission.date)} />
          <InfoRow icon="time-outline" label={formatMissionTimeRange(mission.startTime, mission.endTime)} />
          <InfoRow icon="location-outline" label={`${mission.site.name} — ${mission.site.address}`} />
        </Card>

        {/* Tout le monde ne connaît pas l'adresse des chantiers par cœur —
            surtout utile pour les employés sur le terrain qui s'organisent
            au dernier moment. */}
        <View style={{ marginTop: spacing.sm }}>
          <Button
            label="En route vers le chantier"
            variant="secondary"
            icon="navigate-outline"
            onPress={() => openDirectionsTo(`${mission.site.name}, ${mission.site.address}`)}
          />
        </View>

        {(isOwningSiteManager || isMissionLead) && !canManagePlanning ? (
          <Card style={{ marginTop: spacing.md }}>
            <Text style={[type.overline, { color: colors.inkTertiary, marginBottom: spacing.xs }]}>CONSIGNES</Text>
            <TextField
              label="Consigne pour l'équipe"
              placeholder="Ajouter une consigne pour l'équipe sur cette mission."
              value={instructionsDraft}
              onChangeText={setInstructionsDraft}
              multiline
            />
            <Button
              label="Enregistrer la consigne"
              size="md"
              loading={savingInstructions}
              disabled={instructionsDraft.trim() === (mission.instructions ?? "")}
              onPress={handleSaveInstructions}
            />
          </Card>
        ) : mission.instructions ? (
          <Card style={{ marginTop: spacing.md }}>
            <Text style={[type.overline, { color: colors.inkTertiary, marginBottom: spacing.xs }]}>CONSIGNES</Text>
            <Text style={[type.callout, { color: colors.ink }]}>{mission.instructions}</Text>
          </Card>
        ) : null}

        {(canManagePlanning || mission.standardDocumentFileName) && (
          <View style={{ marginTop: spacing.md }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: spacing.xs,
              }}
            >
              <Text style={[type.overline, { color: colors.inkTertiary }]}>STANDARD DE NETTOYAGE (PDF)</Text>
              {!!canManagePlanning && (
                <PressableScale onPress={handleAttachDocument}>
                  <Text style={[type.footnote, { color: colors.accent, fontWeight: "600" }]}>
                    {mission.standardDocumentFileName ? "Remplacer" : "Déposer un PDF"}
                  </Text>
                </PressableScale>
              )}
            </View>

            {mission.standardDocumentFileName ? (
              <Card style={{ flexDirection: "row", alignItems: "center" }}>
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: radius.md,
                    backgroundColor: colors.purpleSoft,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons name="document-attach-outline" size={18} color={colors.purple} />
                </View>
                <View style={{ marginLeft: spacing.sm, flex: 1 }}>
                  <Text style={[type.callout, { color: colors.ink }]} numberOfLines={1}>
                    {mission.standardDocumentFileName}
                  </Text>
                  <Text style={[type.footnote, { color: colors.inkTertiary, marginTop: 2 }]} numberOfLines={1}>
                    {mission.standardDocumentSizeBytes !== null ? formatFileSize(mission.standardDocumentSizeBytes) : ""}
                  </Text>
                </View>
                <PressableScale
                  onPress={handleDownloadDocument}
                  accessibilityRole="button"
                  accessibilityLabel="Télécharger le document"
                  style={{ marginLeft: spacing.xs, padding: spacing.xxs }}
                >
                  <Ionicons name="download-outline" size={20} color={colors.accent} />
                </PressableScale>
                {!!canManagePlanning && (
                  <PressableScale
                    onPress={handleRemoveDocument}
                    accessibilityRole="button"
                    accessibilityLabel="Retirer le document"
                    style={{ marginLeft: spacing.xs, padding: spacing.xxs }}
                  >
                    <Ionicons name="trash-outline" size={20} color={colors.danger} />
                  </PressableScale>
                )}
              </Card>
            ) : (
              <Text style={[type.callout, { color: colors.inkTertiary }]}>Aucun document déposé pour le moment.</Text>
            )}
          </View>
        )}

        {!!mission.standard && (
          <PressableScale onPress={() => navigation.navigate("StandardDetail", { standardId: mission.standard!.id })}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginTop: spacing.md,
                padding: spacing.sm,
                borderRadius: radius.md,
                backgroundColor: colors.purpleSoft,
              }}
            >
              <Ionicons name="document-text-outline" size={16} color={colors.purple} />
              <Text style={[type.footnote, { color: colors.purple, marginLeft: spacing.xs, flex: 1 }]}>
                Basé sur le standard « {mission.standard.name} »
              </Text>
              <Ionicons name="chevron-forward" size={14} color={colors.purple} />
            </View>
          </PressableScale>
        )}

        <View style={{ marginTop: spacing.xl }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm }}>
            <Text style={[type.overline, { color: colors.inkTertiary }]}>FICHE DE POSTE</Text>
            {!!canManagePlanning && (
              <PressableScale onPress={() => navigation.navigate("JobSheetForm", { missionId })}>
                <Text style={[type.footnote, { color: colors.accent, fontWeight: "600" }]}>
                  {mission.jobSheet ? "Modifier" : "Créer"}
                </Text>
              </PressableScale>
            )}
          </View>

          {mission.jobSheet ? (
            <Card>
              {mission.jobSheet.tasks.length > 0 && (
                <View style={{ marginBottom: mission.jobSheet.equipment.length > 0 ? spacing.md : 0 }}>
                  <Text style={[type.footnote, { color: colors.inkTertiary, marginBottom: spacing.xxs }]}>Étapes</Text>
                  {mission.jobSheet.tasks.map((task, i) => (
                    <View key={i} style={{ flexDirection: "row", alignItems: "flex-start", marginTop: 4 }}>
                      <Ionicons name="checkmark-circle-outline" size={16} color={colors.accent} style={{ marginTop: 2 }} />
                      <Text style={[type.callout, { color: colors.ink, marginLeft: spacing.xs, flex: 1 }]}>{task}</Text>
                    </View>
                  ))}
                </View>
              )}
              {mission.jobSheet.equipment.length > 0 && (
                <View style={{ marginBottom: (mission.jobSheet.safetyInstructions || mission.jobSheet.notes) ? spacing.md : 0 }}>
                  <Text style={[type.footnote, { color: colors.inkTertiary, marginBottom: spacing.xxs }]}>Matériel</Text>
                  <Text style={[type.callout, { color: colors.ink }]}>{mission.jobSheet.equipment.join(" · ")}</Text>
                </View>
              )}
              {!!mission.jobSheet.safetyInstructions && (
                <View style={{ marginBottom: mission.jobSheet.notes ? spacing.md : 0 }}>
                  <Text style={[type.footnote, { color: colors.warning, marginBottom: spacing.xxs }]}>Sécurité</Text>
                  <Text style={[type.callout, { color: colors.ink }]}>{mission.jobSheet.safetyInstructions}</Text>
                </View>
              )}
              {!!mission.jobSheet.notes && (
                <View>
                  <Text style={[type.footnote, { color: colors.inkTertiary, marginBottom: spacing.xxs }]}>Notes</Text>
                  <Text style={[type.callout, { color: colors.ink }]}>{mission.jobSheet.notes}</Text>
                </View>
              )}
            </Card>
          ) : (
            <Text style={[type.callout, { color: colors.inkTertiary }]}>
              Aucune fiche de poste pour cette mission.
            </Text>
          )}
        </View>

        {/* Mêmes lignes que les autres listes de personnes : la photo de
            profil (des initiales jusqu'ici, alors que la photo existait). */}
        {mission.assignments.some((a) => a.isLead) && (
          <ListGroup title="Chef d'équipe" style={{ marginTop: spacing.xl, marginBottom: 0 }}>
            {mission.assignments
              .filter((a) => a.isLead)
              .map((a) => (
                <ListRow
                  key={a.userId}
                  title={`${a.user.firstName} ${a.user.lastName}`}
                  leading={<Avatar user={a.user} size={40} />}
                  onPress={() => navigation.navigate("ContactProfile", { userId: a.userId })}
                />
              ))}
          </ListGroup>
        )}

        {mission.assignments.some((a) => !a.isLead) && (
          <ListGroup
            title="Équipe"
            count={mission.assignments.filter((a) => !a.isLead).length}
            style={{ marginTop: spacing.xl, marginBottom: 0 }}
          >
            {mission.assignments
              .filter((a) => !a.isLead)
              .map((a) => (
                <ListRow
                  key={a.userId}
                  title={`${a.user.firstName} ${a.user.lastName}`}
                  leading={<Avatar user={a.user} size={40} />}
                  onPress={() => navigation.navigate("ContactProfile", { userId: a.userId })}
                />
              ))}
          </ListGroup>
        )}

        <Text style={[type.footnote, { color: colors.inkTertiary, marginTop: spacing.md }]}>
          Créée par {mission.createdBy.firstName} {mission.createdBy.lastName}
        </Text>

        {canSeeTeamPointageDetail && (mission.status === "IN_PROGRESS" || mission.status === "COMPLETED") && (
          <>
            <Text style={[type.overline, { color: colors.inkTertiary, marginTop: spacing.xl, marginBottom: spacing.xxs }]}>
              SUIVI DE L'ÉQUIPE
            </Text>
            <Text style={[type.caption, { color: colors.inkTertiary, marginBottom: spacing.sm }]}>
              Pointages rapprochés par créneau horaire, à titre indicatif — pour vous aider à identifier un problème
              (mission {mission.status === "COMPLETED" ? "terminée" : "en cours"}).
            </Text>

            {(mission.site.manager || mission.site.supervisor) && (
              <Card padded={false} style={{ marginBottom: spacing.sm }}>
                {!!mission.site.manager && (
                  <PressableScale onPress={() => navigation.navigate("ContactProfile", { userId: mission.site.manager!.id })}>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        paddingVertical: spacing.sm,
                        paddingHorizontal: spacing.lg,
                      }}
                    >
                      <Ionicons name="person-outline" size={16} color={colors.inkTertiary} />
                      <View style={{ marginLeft: spacing.sm, flex: 1 }}>
                        <Text style={[type.footnote, { color: colors.inkTertiary }]}>Chef d'équipe du chantier</Text>
                        <Text style={[type.callout, { color: colors.ink }]}>
                          {mission.site.manager.firstName} {mission.site.manager.lastName}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={colors.inkTertiary} />
                    </View>
                  </PressableScale>
                )}
                {!!mission.site.supervisor && (
                  <PressableScale onPress={() => navigation.navigate("ContactProfile", { userId: mission.site.supervisor!.id })}>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        paddingVertical: spacing.sm,
                        paddingHorizontal: spacing.lg,
                        borderTopWidth: mission.site.manager ? 1 : 0,
                        borderTopColor: colors.border,
                      }}
                    >
                      <Ionicons name="shield-checkmark-outline" size={16} color={colors.inkTertiary} />
                      <View style={{ marginLeft: spacing.sm, flex: 1 }}>
                        <Text style={[type.footnote, { color: colors.inkTertiary }]}>Superviseur du chantier</Text>
                        <Text style={[type.callout, { color: colors.ink }]}>
                          {mission.site.supervisor.firstName} {mission.site.supervisor.lastName}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={colors.inkTertiary} />
                    </View>
                  </PressableScale>
                )}
              </Card>
            )}

            <Card padded={false}>
              {timeEntries.map((entry, index) => (
                <PressableScale
                  key={entry.id}
                  onPress={() => navigation.navigate("TimeEntryDetail", { entryId: entry.id })}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      paddingVertical: spacing.sm,
                      paddingHorizontal: spacing.lg,
                      borderTopWidth: index === 0 ? 0 : 1,
                      borderTopColor: colors.border,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[type.callout, { color: colors.ink, fontWeight: "600" }]}>
                        {entry.user.firstName} {entry.user.lastName}
                      </Text>
                      <Text style={[type.footnote, { color: colors.inkSecondary, marginTop: 1 }]}>
                        {entryTimeFormatter.format(new Date(entry.clockIn))}
                        {" – "}
                        {entry.clockOut ? entryTimeFormatter.format(new Date(entry.clockOut)) : "en cours"}
                        {"  ·  "}
                        {formatDuration(entry.clockIn, entry.clockOut)}
                      </Text>
                    </View>
                    <TimeEntryStatusBadge status={entry.status} />
                    <Ionicons name="chevron-forward" size={16} color={colors.inkTertiary} style={{ marginLeft: spacing.xs }} />
                  </View>
                </PressableScale>
              ))}
              {/* Retour explicite du client : "pourquoi l'employé n'a pas pointé" —
                  les affectés sans pointage rapproché doivent être aussi visibles
                  que ceux qui ont pointé, pas silencieusement absents de la liste. */}
              {missingAssignees.map((a, index) => (
                <PressableScale
                  key={a.userId}
                  onPress={() => navigation.navigate("ContactProfile", { userId: a.userId })}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      paddingVertical: spacing.sm,
                      paddingHorizontal: spacing.lg,
                      borderTopWidth: timeEntries.length === 0 && index === 0 ? 0 : 1,
                      borderTopColor: colors.border,
                    }}
                  >
                    <Ionicons name="alert-circle-outline" size={18} color={colors.warning} />
                    <View style={{ marginLeft: spacing.sm, flex: 1 }}>
                      <Text style={[type.callout, { color: colors.ink, fontWeight: "600" }]}>
                        {a.user.firstName} {a.user.lastName}
                      </Text>
                      <Text style={[type.footnote, { color: colors.warning, marginTop: 1 }]}>Aucun pointage</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.inkTertiary} />
                  </View>
                </PressableScale>
              ))}
            </Card>
          </>
        )}

        <Text style={[type.overline, { color: colors.inkTertiary, marginTop: spacing.xl, marginBottom: spacing.sm }]}>
          SIGNALEMENTS ({problems.length})
        </Text>
        {problems.length > 0 && (
          <Card padded={false} style={{ marginBottom: spacing.md }}>
            {problems.map((problem, index) => (
              <PressableScale key={problem.id} onPress={() => navigation.navigate("ProblemDetail", { problemId: problem.id })}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingVertical: spacing.md,
                    paddingHorizontal: spacing.lg,
                    borderTopWidth: index === 0 ? 0 : 1,
                    borderTopColor: colors.border,
                  }}
                >
                  <Text style={[type.callout, { color: colors.ink, flex: 1, marginRight: spacing.sm }]} numberOfLines={2}>
                    {problem.description}
                  </Text>
                  <ProblemStatusBadge status={problem.status} />
                </View>
              </PressableScale>
            ))}
          </Card>
        )}
        <Button
          label="Signaler un problème"
          variant="secondary"
          onPress={() => navigation.navigate("ReportProblem", { missionId })}
        />

        {mission.status === "COMPLETED" && (
          <View style={{ marginTop: spacing.xl }}>
            <Text style={[type.overline, { color: colors.inkTertiary, marginBottom: spacing.sm }]}>VALIDATION</Text>
            {completionValidation ? (
              <Card style={{ flexDirection: "row", alignItems: "flex-start" }}>
                <Ionicons name="checkmark-circle" size={20} color={colors.success} />
                <View style={{ marginLeft: spacing.sm, flex: 1 }}>
                  <Text style={[type.callout, { color: colors.ink }]}>
                    Validée par {completionValidation.validatedBy.firstName} {completionValidation.validatedBy.lastName}
                  </Text>
                  <Text style={[type.footnote, { color: colors.inkTertiary, marginTop: 2 }]}>
                    le {validatedAtFormatter.format(new Date(completionValidation.createdAt))}
                  </Text>
                  {completionValidation.comment ? (
                    <Text style={[type.callout, { color: colors.inkSecondary, marginTop: spacing.xs }]}>
                      {completionValidation.comment}
                    </Text>
                  ) : null}
                </View>
              </Card>
            ) : canValidateMission ? (
              <View>
                <TextField
                  label="Commentaire (optionnel)"
                  placeholder="Ex : contrôlé sur place, conforme."
                  value={validationComment}
                  onChangeText={setValidationComment}
                />
                <Button label="Valider la mission" loading={actionLoading === "validate"} onPress={handleValidate} />
              </View>
            ) : (
              <Text style={[type.callout, { color: colors.inkTertiary }]}>
                En attente de validation par le chef d'équipe, la RH, un superviseur ou la direction.
              </Text>
            )}
          </View>
        )}

        {mission.status !== "CANCELLED" && mission.status !== "COMPLETED" && (canManagePlanning || canOperateMission) && (
          <View style={{ marginTop: spacing.xl, gap: spacing.sm }}>
            {!!canManagePlanning && (
              <Button
                label="Modifier la mission"
                variant="secondary"
                onPress={() => navigation.navigate("MissionForm", { missionId })}
              />
            )}
            {mission.status === "SCHEDULED" && canOperateMission && (
              <Button
                label="Démarrer la mission"
                loading={actionLoading === "start"}
                onPress={() => runAction("start", () => setMissionStatus(missionId, "IN_PROGRESS"))}
              />
            )}
            {mission.status === "IN_PROGRESS" && canOperateMission && (
              <Button
                label="Marquer comme terminée"
                loading={actionLoading === "complete"}
                onPress={() => runAction("complete", () => setMissionStatus(missionId, "COMPLETED"))}
              />
            )}
            {!!canManagePlanning && (
              <Button
                label="Annuler la mission"
                variant="destructive"
                loading={actionLoading === "cancel"}
                onPress={handleCancel}
              />
            )}
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
