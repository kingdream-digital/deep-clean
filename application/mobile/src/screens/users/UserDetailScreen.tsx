import React, { useCallback, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { Alert } from "../../utils/alert";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { StateView } from "../../components/StateView";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { SegmentedControl } from "../../components/SegmentedControl";
import { TimeEntryStatusBadge } from "../../components/TimeEntryStatusBadge";
import { AbsenceStatusBadge } from "../../components/AbsenceStatusBadge";
import { StatusBadge } from "../../components/StatusBadge";
import { useTheme } from "../../theme/ThemeProvider";
import { useAuth } from "../../auth/AuthContext";
import { extractErrorMessage } from "../../api/client";
import {
  activateUser,
  deactivateUser,
  exportEmployeeDossierPdf,
  getEmployeeDossier,
  getUser,
  resetUserAccess,
} from "../../api/users.api";
import type { DirectoryUser, EmployeeDossier } from "../../api/users.api";
import { decideAbsence } from "../../api/absences.api";
import type { HomeStackParamList } from "../../navigation/HomeStack";
import { formatMinutes } from "../../utils/duration";
import { toLocalDateKey } from "../../utils/missionFormat";
import { shareFile } from "../../utils/shareFile";

type Route = RouteProp<{ UserDetail: { userId: string; temporaryPassword?: string } }, "UserDetail">;

// Gérer un compte déjà créé (modifier, réinitialiser l'accès, activer/
// désactiver) — la direction rejoint désormais la RH et l'admin technique
// (retour explicite du client : « tout sauf créer les comptes »). La
// création elle-même reste réservée à la RH/admin (voir UsersListScreen ::
// CREATE_ROLES, volontairement distinct de cette liste).
const MANAGE_ROLES = ["HR", "DIRECTOR", "ADMIN"];
// Qui peut consulter le dossier (pointages/absences/missions/journal) d'un
// employé — même liste que backend/src/modules/users/users.service.ts::DOSSIER_VIEW_ROLES.
const DOSSIER_VIEW_ROLES = ["HR", "DIRECTOR", "ADMIN", "SUPERVISOR"];
// Qui peut valider/refuser une absence depuis cette fiche — même liste que
// backend/src/modules/absences/absences.service.ts::MANAGE_ABSENCES_ROLES
// (le superviseur consulte le dossier mais ne décide pas des absences).
const ABSENCE_DECISION_ROLES = ["HR", "DIRECTOR", "ADMIN"];

const ABSENCE_TYPE_LABELS: Record<string, string> = {
  PAID_LEAVE: "Congé payé",
  SICK_LEAVE: "Arrêt maladie",
  UNPAID_LEAVE: "Congé sans solde",
  OTHER: "Autre",
};

const shortDateFormatter = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });

type ExportPeriod = "week" | "month";

// Semaine ISO (lundi → dimanche), cohérent avec le reste de l'app (Planning).
function startOfWeek(d: Date): Date {
  const day = d.getDay(); // 0 = dimanche
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  return monday;
}
function endOfWeek(d: Date): Date {
  const monday = startOfWeek(d);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return sunday;
}
function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}
function periodBounds(period: ExportPeriod): { from: Date; to: Date } {
  const now = new Date();
  return period === "week" ? { from: startOfWeek(now), to: endOfWeek(now) } : { from: startOfMonth(now), to: endOfMonth(now) };
}

function StatBlock({ label, value, color }: { label: string; value: string; color: string }) {
  const { spacing, type } = useTheme();
  return (
    <View style={{ flex: 1, marginRight: spacing.sm }}>
      <Text style={[type.title3, { color }]}>{value}</Text>
      <Text style={[type.caption, { color: color, opacity: 0.75, marginTop: 2 }]}>{label}</Text>
    </View>
  );
}

const ROLE_LABELS: Record<DirectoryUser["role"], string> = {
  EMPLOYEE: "Employé",
  SITE_MANAGER: "Chef d'équipe",
  SUPERVISOR: "Superviseur",
  HR: "RH",
  DIRECTOR: "Directeur",
  ADMIN: "Admin",
};

function InfoRow({ icon, label }: { icon: keyof typeof Ionicons.glyphMap; label: string }) {
  const { colors, spacing, type } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", marginTop: spacing.xs }}>
      <Ionicons name={icon} size={16} color={colors.inkTertiary} />
      <Text style={[type.callout, { color: colors.inkSecondary, marginLeft: spacing.xs, flex: 1 }]}>{label}</Text>
    </View>
  );
}

export function UserDetailScreen() {
  const { colors, spacing, type } = useTheme();
  const { user: me } = useAuth();
  const route = useRoute<Route>();
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const { userId } = route.params;

  const [account, setAccount] = useState<DirectoryUser | null>(null);
  const [dossier, setDossier] = useState<EmployeeDossier | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(route.params.temporaryPassword ?? null);
  const [exportPeriod, setExportPeriod] = useState<ExportPeriod>("month");
  const [exporting, setExporting] = useState(false);
  const [decidingAbsenceId, setDecidingAbsenceId] = useState<string | null>(null);

  const canViewDossier = me ? DOSSIER_VIEW_ROLES.includes(me.role) : false;
  const canDecideAbsences = me ? ABSENCE_DECISION_ROLES.includes(me.role) : false;

  async function handleExportDossier() {
    if (!account) return;
    setExporting(true);
    try {
      const { from, to } = periodBounds(exportPeriod);
      const bytes = await exportEmployeeDossierPdf(account.id, toLocalDateKey(from), toLocalDateKey(to));
      const periodLabel = exportPeriod === "week" ? toLocalDateKey(from) : toLocalDateKey(from).slice(0, 7);
      const baseName = `dossier_${account.firstName}_${account.lastName}_${periodLabel}`.replace(/\s+/g, "_");
      await shareFile(`${baseName}.pdf`, bytes, { mimeType: "application/pdf", uti: "com.adobe.pdf" });
    } catch (err) {
      Alert.alert("Export impossible", extractErrorMessage(err));
    } finally {
      setExporting(false);
    }
  }

  const load = useCallback(async () => {
    try {
      setState("loading");
      const [accountData, dossierData] = await Promise.all([
        getUser(userId),
        // Le dossier est une synthèse réservée à la gestion (RH/direction/
        // admin/superviseur) — un échec (403 pour les autres rôles, ou tout
        // autre souci) ne doit jamais bloquer l'affichage de la fiche de
        // base, seule la section dossier reste alors absente.
        canViewDossier ? getEmployeeDossier(userId).catch(() => null) : Promise.resolve(null),
      ]);
      setAccount(accountData);
      setDossier(dossierData);
      setState("ready");
    } catch {
      setState("error");
    }
  }, [userId, canViewDossier]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  if (state === "loading") {
    return (
      <ScreenContainer>
        <StateView kind="loading" />
      </ScreenContainer>
    );
  }
  if (state === "error" || !account) {
    return (
      <ScreenContainer>
        <StateView kind="error" onRetry={load} />
      </ScreenContainer>
    );
  }

  const canManage = me ? MANAGE_ROLES.includes(me.role) : false;
  const isSelf = me?.id === account.id;

  async function performToggleActive() {
    setActionLoading("toggle");
    try {
      const updated = account!.isActive ? await deactivateUser(account!.id) : await activateUser(account!.id);
      setAccount(updated);
    } catch (err) {
      Alert.alert("Action impossible", extractErrorMessage(err));
    } finally {
      setActionLoading(null);
    }
  }

  function handleToggleActive() {
    // Réactiver ne coupe l'accès de personne : pas besoin de confirmation.
    // Désactiver le fait immédiatement (cahier des charges §6) — même garde
    // que pour l'annulation d'une mission, pour une action aux conséquences
    // comparables.
    if (!account!.isActive) {
      void performToggleActive();
      return;
    }
    Alert.alert(
      "Désactiver ce compte ?",
      `${account!.firstName} ${account!.lastName} perdra immédiatement l'accès à l'application.`,
      [
        { text: "Retour", style: "cancel" },
        { text: "Désactiver", style: "destructive", onPress: () => void performToggleActive() },
      ]
    );
  }

  async function handleResetAccess() {
    setActionLoading("reset");
    try {
      const { temporaryPassword: pwd } = await resetUserAccess(account!.id);
      setTemporaryPassword(pwd);
    } catch (err) {
      Alert.alert("Action impossible", extractErrorMessage(err));
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDecideAbsence(absenceId: string, status: "APPROVED" | "REJECTED") {
    setDecidingAbsenceId(absenceId);
    try {
      await decideAbsence(absenceId, status);
      await load();
    } catch (err) {
      Alert.alert("Action impossible", extractErrorMessage(err));
    } finally {
      setDecidingAbsenceId(null);
    }
  }

  function confirmRejectAbsence(absence: { id: string; type: string; startDate: string; endDate: string }) {
    const start = shortDateFormatter.format(new Date(absence.startDate));
    const end = shortDateFormatter.format(new Date(absence.endDate));
    Alert.alert(
      "Refuser cette demande ?",
      `${ABSENCE_TYPE_LABELS[absence.type] ?? absence.type} · ${start === end ? start : `${start} → ${end}`}`,
      [
        { text: "Annuler", style: "cancel" },
        { text: "Refuser", style: "destructive", onPress: () => void handleDecideAbsence(absence.id, "REJECTED") },
      ]
    );
  }

  return (
    <ScreenContainer>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: spacing.lg, paddingBottom: spacing.xxxl }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
          <Text style={[type.title1, { color: colors.ink, flex: 1, marginRight: spacing.sm }]}>
            {account.firstName} {account.lastName}
          </Text>
          {account.isActive !== undefined && (
            <View
              style={{
                paddingHorizontal: spacing.sm,
                paddingVertical: 4,
                borderRadius: 999,
                backgroundColor: account.isActive ? colors.successSoft : colors.neutralSoft,
              }}
            >
              <Text style={[type.caption, { color: account.isActive ? colors.success : colors.neutral }]}>
                {account.isActive ? "Actif" : "Désactivé"}
              </Text>
            </View>
          )}
        </View>

        <Card style={{ marginTop: spacing.lg }}>
          <InfoRow icon="person-outline" label={`Identifiant : ${account.username}`} />
          <InfoRow icon="briefcase-outline" label={ROLE_LABELS[account.role]} />
          {account.email ? <InfoRow icon="mail-outline" label={account.email} /> : null}
          {account.phone ? <InfoRow icon="call-outline" label={account.phone} /> : null}
        </Card>

        {canManage && (
          <View style={{ marginTop: spacing.lg }}>
            <Button
              label="Documents (contrat, attestations...)"
              variant="secondary"
              icon="document-attach-outline"
              onPress={() => navigation.navigate("UserDocuments", { userId: account.id, fullName: `${account.firstName} ${account.lastName}` })}
            />
          </View>
        )}

        {dossier && (
          <View style={{ marginTop: spacing.xl }}>
            <Text style={[type.overline, { color: colors.inkTertiary, marginBottom: spacing.sm }]}>
              DOSSIER EMPLOYÉ
            </Text>

            {/* Export PDF pour archivage RH / préparation de la fiche de paye */}
            <Card style={{ marginBottom: spacing.sm }}>
              <Text style={[type.footnote, { color: colors.inkTertiary, marginBottom: spacing.sm }]}>
                EXPORTER LE DOSSIER (PDF)
              </Text>
              <SegmentedControl
                value={exportPeriod}
                onChange={setExportPeriod}
                options={[
                  { label: "Semaine", value: "week" },
                  { label: "Mois", value: "month" },
                ]}
              />
              <View style={{ marginTop: spacing.sm }}>
                <Button
                  label="Exporter en PDF"
                  variant="secondary"
                  icon="download-outline"
                  loading={exporting}
                  onPress={handleExportDossier}
                />
              </View>
              <Text style={[type.caption, { color: colors.inkTertiary, marginTop: spacing.xs }]}>
                Pointages détaillés et absences de la période, à archiver ou à transmettre pour la fiche de paye.
              </Text>
            </Card>

            {/* Pointages */}
            <Card>
              <Text style={[type.footnote, { color: colors.inkTertiary, marginBottom: spacing.sm }]}>
                POINTAGES · {dossier.timesheet.windowDays} DERNIERS JOURS
              </Text>
              <View style={{ flexDirection: "row" }}>
                <StatBlock
                  label="Validées"
                  value={formatMinutes(dossier.timesheet.totals.validatedMinutes)}
                  color={colors.success}
                />
                <StatBlock
                  label="En attente"
                  value={formatMinutes(dossier.timesheet.totals.pendingMinutes)}
                  color={colors.neutral}
                />
                <StatBlock
                  label="Refusées"
                  value={formatMinutes(dossier.timesheet.totals.rejectedMinutes)}
                  color={colors.danger}
                />
              </View>
              {dossier.timesheet.recent.length > 0 && (
                <View style={{ marginTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm }}>
                  {dossier.timesheet.recent.slice(0, 5).map((entry) => (
                    <View
                      key={entry.id}
                      style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.xxs }}
                    >
                      <Text style={[type.footnote, { color: colors.inkSecondary }]}>
                        {shortDateFormatter.format(new Date(entry.clockIn))}
                        {entry.isRetroactive ? " · différé" : ""}
                      </Text>
                      <TimeEntryStatusBadge status={entry.status} />
                    </View>
                  ))}
                </View>
              )}
            </Card>

            {/* Absences */}
            <Card style={{ marginTop: spacing.sm }}>
              <Text style={[type.footnote, { color: colors.inkTertiary, marginBottom: spacing.sm }]}>
                ABSENCES · CETTE ANNÉE
              </Text>
              {Object.keys(dossier.absences.approvedDaysThisYearByType).length > 0 ? (
                <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                  {Object.entries(dossier.absences.approvedDaysThisYearByType).map(([absType, days]) => (
                    <View key={absType} style={{ marginRight: spacing.lg, marginBottom: spacing.xs }}>
                      <Text style={[type.title3, { color: colors.ink }]}>
                        {days} j
                      </Text>
                      <Text style={[type.caption, { color: colors.inkTertiary, marginTop: 2 }]}>
                        {ABSENCE_TYPE_LABELS[absType] ?? absType}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={[type.callout, { color: colors.inkTertiary }]}>Aucune absence approuvée cette année.</Text>
              )}
              {dossier.absences.pendingCount > 0 && (
                <Text style={[type.footnote, { color: colors.warning, marginTop: spacing.xs }]}>
                  {dossier.absences.pendingCount} demande{dossier.absences.pendingCount > 1 ? "s" : ""} en attente
                </Text>
              )}
              {dossier.absences.recent.length > 0 && (
                <View style={{ marginTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm }}>
                  {dossier.absences.recent.slice(0, 5).map((absence) => (
                    <View key={absence.id} style={{ marginTop: spacing.xs }}>
                      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                        <Text style={[type.footnote, { color: colors.inkSecondary }]} numberOfLines={1}>
                          {ABSENCE_TYPE_LABELS[absence.type]} · {shortDateFormatter.format(new Date(absence.startDate))}
                        </Text>
                        <AbsenceStatusBadge status={absence.status} />
                      </View>
                      {absence.status === "PENDING" && canDecideAbsences && (
                        <View style={{ flexDirection: "row", gap: spacing.xs, marginTop: spacing.xxs }}>
                          <View style={{ flex: 1 }}>
                            <Button
                              label="Refuser"
                              variant="secondary"
                              size="md"
                              loading={decidingAbsenceId === absence.id}
                              onPress={() => confirmRejectAbsence(absence)}
                            />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Button
                              label="Approuver"
                              size="md"
                              loading={decidingAbsenceId === absence.id}
                              onPress={() => void handleDecideAbsence(absence.id, "APPROVED")}
                            />
                          </View>
                        </View>
                      )}
                    </View>
                  ))}
                </View>
              )}
            </Card>

            {/* Missions */}
            <Card style={{ marginTop: spacing.sm }}>
              <Text style={[type.footnote, { color: colors.inkTertiary, marginBottom: spacing.sm }]}>MISSIONS</Text>
              <View style={{ flexDirection: "row" }}>
                <StatBlock label="Terminées" value={String(dossier.missions.totals.completed)} color={colors.success} />
                <StatBlock label="À venir" value={String(dossier.missions.totals.upcoming)} color={colors.accent} />
                <StatBlock label="Annulées" value={String(dossier.missions.totals.cancelled)} color={colors.neutral} />
              </View>
              {dossier.missions.recent.length > 0 && (
                <View style={{ marginTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm }}>
                  {dossier.missions.recent.slice(0, 5).map((mission) => (
                    <View
                      key={mission.id}
                      style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.xxs }}
                    >
                      <Text style={[type.footnote, { color: colors.inkSecondary, flex: 1, marginRight: spacing.xs }]} numberOfLines={1}>
                        {mission.title} · {mission.site.name}
                      </Text>
                      <StatusBadge status={mission.status} />
                    </View>
                  ))}
                </View>
              )}
            </Card>

            {/* Journal d'activité récent */}
            {dossier.activity.length > 0 && (
              <Card style={{ marginTop: spacing.sm }}>
                <Text style={[type.footnote, { color: colors.inkTertiary, marginBottom: spacing.sm }]}>
                  JOURNAL D'ACTIVITÉ RÉCENT
                </Text>
                {dossier.activity.slice(0, 8).map((entry, index) => (
                  <View
                    key={entry.id}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginTop: index === 0 ? 0 : spacing.xxs,
                    }}
                  >
                    <Text style={[type.footnote, { color: colors.ink, flex: 1, marginRight: spacing.xs }]} numberOfLines={1}>
                      {entry.action}
                    </Text>
                    <Text style={[type.caption, { color: colors.inkTertiary }]}>
                      {shortDateFormatter.format(new Date(entry.createdAt))}
                    </Text>
                  </View>
                ))}
              </Card>
            )}
          </View>
        )}

        {temporaryPassword && (
          <Card style={{ marginTop: spacing.lg, borderColor: colors.accentDeep }}>
            <Text style={[type.headline, { color: colors.ink }]}>Identifiants de connexion</Text>
            <Text style={[type.footnote, { color: colors.inkSecondary, marginTop: spacing.xxs }]}>
              À transmettre à {account.firstName} — il devra changer ce mot de passe à sa prochaine connexion. Ce
              mot de passe ne sera plus jamais affiché.
            </Text>
            <View
              style={{
                marginTop: spacing.sm,
                padding: spacing.sm,
                borderRadius: 10,
                backgroundColor: colors.surface,
              }}
            >
              <Text style={[type.caption, { color: colors.inkTertiary, textAlign: "center" }]}>Identifiant</Text>
              <Text style={[type.title3, { color: colors.ink, textAlign: "center" }]} selectable>
                {account.username}
              </Text>
              <View style={{ height: spacing.sm }} />
              <Text style={[type.caption, { color: colors.inkTertiary, textAlign: "center" }]}>Mot de passe</Text>
              <Text style={[type.title3, { color: colors.accentDeep, textAlign: "center" }]} selectable>
                {temporaryPassword}
              </Text>
            </View>
          </Card>
        )}

        {canManage && !isSelf && (
          <View style={{ marginTop: spacing.xl, gap: spacing.sm }}>
            <Button
              label="Modifier le compte"
              variant="secondary"
              onPress={() => navigation.navigate("UserForm", { userId: account.id })}
            />
            <Button
              label="Réinitialiser l'accès"
              variant="secondary"
              loading={actionLoading === "reset"}
              onPress={handleResetAccess}
            />
            <Button
              label={account.isActive ? "Désactiver le compte" : "Réactiver le compte"}
              variant={account.isActive ? "destructive" : "secondary"}
              loading={actionLoading === "toggle"}
              onPress={handleToggleActive}
            />
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
