import React, { useCallback, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { Alert } from "../../utils/alert";
import { Ionicons } from "@expo/vector-icons";
import { Picker } from "@react-native-picker/picker";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { StateView } from "../../components/StateView";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { TextField } from "../../components/TextField";
import { PressableScale } from "../../components/PressableScale";
import { AuthenticatedImage } from "../../components/AuthenticatedImage";
import { PhotoViewerModal } from "../../components/PhotoViewerModal";
import { ProgressRing } from "../../components/ProgressRing";
import { useTheme } from "../../theme/ThemeProvider";
import { useAuth } from "../../auth/AuthContext";
import { extractErrorMessage } from "../../api/client";
import { currentPeriod, getSite, getSiteProgress, sitePhotoUrl, upsertSiteTarget } from "../../api/sites.api";
import type { Site, SiteBillingMode, SiteProgress } from "../../api/sites.api";
import { listMissions } from "../../api/missions.api";
import type { Mission } from "../../api/missions.api";
import { listProblems } from "../../api/problems.api";
import type { Problem } from "../../api/problems.api";
import { formatMissionDay, formatMissionTimeRange, todayKey } from "../../utils/missionFormat";
import type { HomeStackParamList } from "../../navigation/HomeStack";

const periodFmt = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" });
const BILLING_MODE_LABELS: Record<SiteBillingMode, string> = { FLAT_RATE: "Forfait (montant prévu au devis)", PER_SERVICE: "À la prestation" };

type Route = RouteProp<{ SiteDetail: { siteId: string } }, "SiteDetail">;

const MANAGE_ROLES = ["SUPERVISOR", "HR", "DIRECTOR", "ADMIN"];
// Facturation réservée à RH/Direction/Admin (cahier des charges §1-3) — le
// Superviseur n'y figure pas, contrairement à la gestion du chantier lui-même.
const INVOICE_ROLES = ["HR", "DIRECTOR", "ADMIN"];

// Fiche chantier — reprend la structure de la maquette validée (bannière,
// chef d'équipe, standards, consignes, prochaines missions, signalements) ;
// la bannière affiche la vraie photo du chantier quand il en a une (retour
// explicite du client : "un visuel directement"), sinon l'icône générique
// d'origine.
export function SiteDetailScreen() {
  const { colors, spacing, type } = useTheme();
  const { user } = useAuth();
  const route = useRoute<Route>();
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const { siteId } = route.params;

  const [site, setSite] = useState<Site | null>(null);
  const [upcomingMissions, setUpcomingMissions] = useState<Mission[]>([]);
  const [openProblems, setOpenProblems] = useState<Problem[]>([]);
  const [progress, setProgress] = useState<SiteProgress | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [viewerOpen, setViewerOpen] = useState(false);
  const [editingTarget, setEditingTarget] = useState(false);

  const period = currentPeriod();

  const load = useCallback(async () => {
    try {
      setState("loading");
      const [siteRes, missionsRes, problemsRes, progressRes] = await Promise.all([
        getSite(siteId),
        listMissions({ siteId, from: todayKey(), pageSize: 5 }),
        listProblems({ siteId }),
        getSiteProgress(siteId, period),
      ]);
      setSite(siteRes);
      setUpcomingMissions(missionsRes.items.filter((m) => m.status !== "CANCELLED").slice(0, 5));
      setOpenProblems(problemsRes.items.filter((p) => p.status !== "VALIDATED").slice(0, 3));
      setProgress(progressRes);
      setState("ready");
    } catch {
      setState("error");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId, period]);

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
  if (state === "error" || !site) {
    return (
      <ScreenContainer>
        <StateView kind="error" onRetry={load} />
      </ScreenContainer>
    );
  }

  const canManage = user ? MANAGE_ROLES.includes(user.role) : false;
  const canInvoice = user ? INVOICE_ROLES.includes(user.role) : false;

  return (
    <ScreenContainer style={{ paddingHorizontal: 0 }}>
      {site.hasPhoto ? (
        <PressableScale onPress={() => setViewerOpen(true)}>
          <AuthenticatedImage uri={sitePhotoUrl(site.id)} style={{ width: "100%", height: 140, backgroundColor: colors.surfaceAlt }} />
        </PressableScale>
      ) : (
        <View style={{ height: 140 }}>
          <LinearGradient
            colors={colors.accentGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
          >
            <Ionicons name="business-outline" size={44} color="rgba(255,255,255,0.85)" />
          </LinearGradient>
        </View>
      )}

      <ScrollView
        showsVerticalScrollIndicator={false}
        style={{ paddingHorizontal: spacing.lg }}
        contentContainerStyle={{ paddingTop: spacing.lg, paddingBottom: spacing.xxxl }}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
          <Text style={[type.title1, { color: colors.ink, flex: 1, marginRight: spacing.sm }]}>{site.name}</Text>
          <View
            style={{
              paddingHorizontal: spacing.sm,
              paddingVertical: 4,
              borderRadius: 999,
              backgroundColor: site.isActive ? colors.successSoft : colors.neutralSoft,
            }}
          >
            <Text style={[type.caption, { color: site.isActive ? colors.success : colors.neutral, fontWeight: "600" }]}>
              {site.isActive ? "Actif" : "Inactif"}
            </Text>
          </View>
        </View>
        <Text style={[type.subhead, { color: colors.inkSecondary, marginTop: 4 }]}>{site.address}</Text>
        {/* Lien commercial (module commercial §20-21) — absent pour un
            chantier opérationnel classique, purement informatif ici. */}
        {(site.client || site.quote) && (
          <View style={{ flexDirection: "row", alignItems: "center", marginTop: spacing.xs, flexWrap: "wrap" }}>
            <Ionicons name="briefcase-outline" size={13} color={colors.inkTertiary} />
            <Text style={[type.footnote, { color: colors.inkTertiary, marginLeft: 4 }]}>
              {[site.client?.companyName, site.quote?.quoteNumber].filter(Boolean).join(" · ")}
            </Text>
          </View>
        )}

        <Text style={[type.overline, { color: colors.inkTertiary, marginTop: spacing.xl, marginBottom: spacing.sm }]}>
          CHEF D'ÉQUIPE
        </Text>
        {site.manager ? (
          <PressableScale onPress={() => navigation.navigate("UserDetail", { userId: site.manager!.id })}>
            <Card style={{ flexDirection: "row", alignItems: "center" }}>
              <View
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 999,
                  backgroundColor: colors.purpleSoft,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={[type.footnote, { color: colors.purple, fontWeight: "700" }]}>
                  {site.manager.firstName[0]}
                  {site.manager.lastName[0]}
                </Text>
              </View>
              <View style={{ marginLeft: spacing.sm, flex: 1 }}>
                <Text style={[type.callout, { color: colors.ink, fontWeight: "600" }]}>
                  {site.manager.firstName} {site.manager.lastName}
                </Text>
                <Text style={[type.caption, { color: colors.inkTertiary }]}>Chef d'équipe</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.inkTertiary} />
            </Card>
          </PressableScale>
        ) : (
          <Card>
            <Text style={[type.callout, { color: colors.inkSecondary }]}>Aucun chef d'équipe assigné</Text>
          </Card>
        )}

        {/* Superviseur du chantier — retour explicite du client : interlocuteur
            fixe, distinct du chef d'équipe ci-dessus qui peut varier d'une
            mission à l'autre (voir MissionDetailScreen "Chef d'équipe"). */}
        <Text style={[type.overline, { color: colors.inkTertiary, marginTop: spacing.lg, marginBottom: spacing.sm }]}>
          SUPERVISEUR DU CHANTIER
        </Text>
        {site.supervisor ? (
          <PressableScale onPress={() => navigation.navigate("UserDetail", { userId: site.supervisor!.id })}>
            <Card style={{ flexDirection: "row", alignItems: "center" }}>
              <View
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 999,
                  backgroundColor: colors.accentSoft,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={[type.footnote, { color: colors.accent, fontWeight: "700" }]}>
                  {site.supervisor.firstName[0]}
                  {site.supervisor.lastName[0]}
                </Text>
              </View>
              <View style={{ marginLeft: spacing.sm, flex: 1 }}>
                <Text style={[type.callout, { color: colors.ink, fontWeight: "600" }]}>
                  {site.supervisor.firstName} {site.supervisor.lastName}
                </Text>
                <Text style={[type.caption, { color: colors.inkTertiary }]}>Superviseur</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.inkTertiary} />
            </Card>
          </PressableScale>
        ) : (
          <Card>
            <Text style={[type.callout, { color: colors.inkSecondary }]}>Aucun superviseur assigné</Text>
          </Card>
        )}

        <Text style={[type.overline, { color: colors.inkTertiary, marginTop: spacing.lg, marginBottom: spacing.sm }]}>
          STANDARD DE NETTOYAGE
        </Text>
        <PressableScale onPress={() => navigation.navigate("StandardsList", { siteId: site.id, siteName: site.name })}>
          <Card style={{ flexDirection: "row", alignItems: "center" }}>
            <View
              style={{
                width: 34,
                height: 34,
                borderRadius: 11,
                backgroundColor: colors.dangerSoft,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="document-text-outline" size={16} color={colors.danger} />
            </View>
            <View style={{ marginLeft: spacing.sm, flex: 1 }}>
              <Text style={[type.callout, { color: colors.ink, fontWeight: "600" }]}>Standards de nettoyage</Text>
              <Text style={[type.caption, { color: colors.inkTertiary }]}>Consulter les standards de ce chantier</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.inkTertiary} />
          </Card>
        </PressableScale>

        {site.description ? (
          <>
            <Text style={[type.overline, { color: colors.inkTertiary, marginTop: spacing.lg, marginBottom: spacing.sm }]}>
              CONSIGNES
            </Text>
            <Card>
              <Text style={[type.callout, { color: colors.ink, lineHeight: 20 }]}>{site.description}</Text>
            </Card>
          </>
        ) : null}

        {/* Suivi mensuel (module commercial §22-24/§28) — l'objectif est saisi
            manuellement, le réalisé est toujours recalculé depuis les
            missions réelles du chantier : n'affiche jamais rien d'automatique,
            juste une information/alerte pour le responsable (§37). */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.lg, marginBottom: spacing.sm }}>
          <Text style={[type.overline, { color: colors.inkTertiary }]}>
            OBJECTIFS & SUIVI · {periodFmt.format(new Date(`${period}-01`))}
          </Text>
        </View>
        {progress && (
          <SiteTargetSection
            siteId={site.id}
            period={period}
            progress={progress}
            canManage={canManage}
            editing={editingTarget}
            onStartEdit={() => setEditingTarget(true)}
            onCancelEdit={() => setEditingTarget(false)}
            onSaved={async () => {
              setEditingTarget(false);
              await load();
            }}
          />
        )}

        <Text style={[type.overline, { color: colors.inkTertiary, marginTop: spacing.lg, marginBottom: spacing.sm }]}>
          PROCHAINES MISSIONS
        </Text>
        {upcomingMissions.length === 0 ? (
          <Card>
            <Text style={[type.callout, { color: colors.inkSecondary }]}>Aucune mission à venir sur ce chantier.</Text>
          </Card>
        ) : (
          <Card padded={false}>
            {upcomingMissions.map((mission, index) => (
              <PressableScale key={mission.id} onPress={() => navigation.navigate("MissionDetail", { missionId: mission.id })}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: spacing.md,
                    borderTopWidth: index === 0 ? 0 : 1,
                    borderTopColor: colors.border,
                  }}
                >
                  <View style={{ flex: 1, marginRight: spacing.sm }}>
                    <Text style={[type.callout, { color: colors.ink, fontWeight: "600" }]} numberOfLines={1}>
                      {formatMissionDay(mission.date)}
                    </Text>
                    <Text style={[type.footnote, { color: colors.inkSecondary, marginTop: 1 }]} numberOfLines={1}>
                      {formatMissionTimeRange(mission.startTime, mission.endTime)} · {mission.title}
                    </Text>
                  </View>
                  <MissionStatusPill status={mission.status} />
                </View>
              </PressableScale>
            ))}
          </Card>
        )}

        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.lg, marginBottom: spacing.sm }}>
          <Text style={[type.overline, { color: colors.inkTertiary }]}>SIGNALEMENTS</Text>
          <PressableScale onPress={() => navigation.navigate("ProblemsList")}>
            <Text style={[type.footnote, { color: colors.accent, fontWeight: "600" }]}>Voir tout</Text>
          </PressableScale>
        </View>
        {openProblems.length === 0 ? (
          <Card>
            <Text style={[type.callout, { color: colors.inkSecondary }]}>Aucun signalement en cours sur ce chantier.</Text>
          </Card>
        ) : (
          <View style={{ gap: spacing.sm }}>
            {openProblems.map((problem) => (
              <PressableScale key={problem.id} onPress={() => navigation.navigate("ProblemDetail", { problemId: problem.id })}>
                <Card style={{ flexDirection: "row", alignItems: "center" }}>
                  <View
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 11,
                      backgroundColor: colors.warningSoft,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Ionicons name="alert-circle-outline" size={16} color={colors.warning} />
                  </View>
                  <View style={{ marginLeft: spacing.sm, flex: 1 }}>
                    <Text style={[type.callout, { color: colors.ink, fontWeight: "600" }]} numberOfLines={1}>
                      {problem.description}
                    </Text>
                    <Text style={[type.caption, { color: colors.inkTertiary, marginTop: 1 }]}>
                      Signalé {formatMissionDay(problem.createdAt)}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.inkTertiary} />
                </Card>
              </PressableScale>
            ))}
          </View>
        )}

        {(canManage || canInvoice) && (
          <View style={{ marginTop: spacing.xl, gap: spacing.sm }}>
            {/* Client → Chantier → Facturation (cahier des charges §32) —
                réservé RH/Direction/Admin, comme le reste de la facturation. */}
            {canInvoice && (
              <Button
                label="Créer une facture"
                onPress={() => navigation.navigate("InvoiceForm", { clientId: site.clientId ?? undefined, quoteId: site.quoteId ?? undefined, siteId: site.id })}
              />
            )}
            {canManage && (
              <Button label="Modifier le chantier" variant="secondary" onPress={() => navigation.navigate("SiteForm", { siteId: site.id })} />
            )}
          </View>
        )}
      </ScrollView>

      {site.hasPhoto && (
        <PhotoViewerModal visible={viewerOpen} uri={sitePhotoUrl(site.id)} onClose={() => setViewerOpen(false)} />
      )}
    </ScreenContainer>
  );
}

interface SiteTargetSectionProps {
  siteId: string;
  period: string;
  progress: SiteProgress;
  canManage: boolean;
  editing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaved: () => void;
}

function SiteTargetSection({ siteId, period, progress, canManage, editing, onStartEdit, onCancelEdit, onSaved }: SiteTargetSectionProps) {
  const { colors, spacing, radius, type } = useTheme();
  const [plannedVisits, setPlannedVisits] = useState(String(progress.target?.plannedVisits ?? ""));
  const [plannedHours, setPlannedHours] = useState(progress.target?.plannedHours != null ? String(progress.target.plannedHours) : "");
  const [plannedAmount, setPlannedAmount] = useState(progress.target?.plannedAmount != null ? String(progress.target.plannedAmount) : "");
  const [billingMode, setBillingMode] = useState<SiteBillingMode>(progress.target?.billingMode ?? "FLAT_RATE");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const visits = Number(plannedVisits);
    if (!plannedVisits || Number.isNaN(visits) || visits < 0) {
      Alert.alert("Objectif invalide", "Indiquez un nombre de prestations prévues (0 ou plus).");
      return;
    }
    setSaving(true);
    try {
      await upsertSiteTarget(siteId, {
        period,
        plannedVisits: visits,
        plannedHours: plannedHours ? Number(plannedHours.replace(",", ".")) : undefined,
        plannedAmount: plannedAmount ? Number(plannedAmount.replace(",", ".")) : undefined,
        billingMode,
      });
      onSaved();
    } catch (err) {
      Alert.alert("Enregistrement impossible", extractErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <Card>
        <TextField label="Prestations prévues ce mois" keyboardType="number-pad" value={plannedVisits} onChangeText={setPlannedVisits} placeholder="6" />
        <TextField label="Heures prévues (optionnel)" keyboardType="decimal-pad" value={plannedHours} onChangeText={setPlannedHours} placeholder="20" />
        <TextField label="Montant prévu HT (optionnel)" keyboardType="decimal-pad" value={plannedAmount} onChangeText={setPlannedAmount} placeholder="900" />
        <View style={{ marginBottom: spacing.md }}>
          <Text style={[type.subhead, { color: colors.inkSecondary, marginBottom: spacing.xxs }]}>Mode de facturation</Text>
          <Card padded={false}>
            <Picker selectedValue={billingMode} onValueChange={(v) => setBillingMode(v as SiteBillingMode)} style={{ color: colors.ink }} itemStyle={{ color: colors.ink }}>
              {Object.entries(BILLING_MODE_LABELS).map(([value, label]) => (
                <Picker.Item key={value} label={label} value={value} />
              ))}
            </Picker>
          </Card>
        </View>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <Button label="Annuler" variant="secondary" onPress={onCancelEdit} disabled={saving} />
          </View>
          <View style={{ flex: 1 }}>
            <Button label="Enregistrer" onPress={handleSave} loading={saving} />
          </View>
        </View>
      </Card>
    );
  }

  if (!progress.target) {
    return (
      <Card>
        <Text style={[type.callout, { color: colors.inkSecondary }]}>Aucun objectif défini pour ce mois.</Text>
        {canManage && (
          <View style={{ marginTop: spacing.sm }}>
            <Button label="Définir l'objectif" variant="secondary" onPress={onStartEdit} />
          </View>
        )}
      </Card>
    );
  }

  const targetPlannedVisits = progress.target.plannedVisits;
  const completionRatio = targetPlannedVisits > 0 ? progress.completedVisits / targetPlannedVisits : 0;

  return (
    <Card>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <ProgressRing progress={completionRatio} color={colors.success} size={84} strokeWidth={9}>
          <Text style={[type.title3, { color: colors.ink, fontWeight: "800" }]}>{Math.round(completionRatio * 100)}%</Text>
        </ProgressRing>
        <View style={{ flex: 1, marginLeft: spacing.lg }}>
          <SiteStat icon="calendar-outline" tint={colors.neutral} label="Prévues" value={String(targetPlannedVisits)} />
          <SiteStat icon="checkmark-circle-outline" tint={colors.success} label="Réalisées" value={String(progress.completedVisits)} />
          <SiteStat
            icon="time-outline"
            tint={colors.warning}
            label="Restantes"
            value={progress.remainingVisits != null ? String(progress.remainingVisits) : "—"}
            last
          />
        </View>
      </View>
      {(progress.target.plannedHours != null || progress.plannedHours > 0) && (
        <Text style={[type.footnote, { color: colors.inkSecondary, marginTop: spacing.sm }]}>
          Heures : {progress.plannedHours} h planifiées
          {progress.actualHours > 0 ? ` · ${progress.actualHours} h pointées (indicatif)` : ""}
        </Text>
      )}
      {progress.remainingVisits !== null && progress.remainingVisits > 0 && (
        <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.warningSoft, borderRadius: radius.md, padding: spacing.sm, marginTop: spacing.sm }}>
          <Ionicons name="alert-circle" size={16} color={colors.warning} />
          <Text style={[type.footnote, { color: colors.warning, marginLeft: 6, fontWeight: "600", flex: 1 }]}>
            {progress.remainingVisits} prestation{progress.remainingVisits > 1 ? "s" : ""} restante{progress.remainingVisits > 1 ? "s" : ""} à programmer ce mois-ci.
          </Text>
        </View>
      )}
      {canManage && (
        <View style={{ marginTop: spacing.sm }}>
          <Button label="Modifier l'objectif" variant="secondary" onPress={onStartEdit} />
        </View>
      )}
    </Card>
  );
}

// Légende façon Apple Fitness (anneau à gauche, lignes icône+libellé+valeur à
// droite) — remplace l'ancien trio de chiffres nus côte à côte.
function SiteStat({
  icon,
  tint,
  label,
  value,
  last = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
  label: string;
  value: string;
  last?: boolean;
}) {
  const { colors, spacing, radius, type } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", marginBottom: last ? 0 : spacing.sm }}>
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: radius.sm,
          backgroundColor: tint + "1F",
          alignItems: "center",
          justifyContent: "center",
          marginRight: spacing.xs,
        }}
      >
        <Ionicons name={icon} size={12} color={tint} />
      </View>
      <Text style={[type.footnote, { color: colors.inkSecondary, flex: 1 }]}>{label}</Text>
      <Text style={[type.headline, { color: colors.ink }]}>{value}</Text>
    </View>
  );
}

function MissionStatusPill({ status }: { status: Mission["status"] }) {
  const { colors, type } = useTheme();
  const tone: Record<Mission["status"], { bg: string; fg: string; label: string }> = {
    SCHEDULED: { bg: colors.neutralSoft, fg: colors.neutral, label: "À venir" },
    IN_PROGRESS: { bg: colors.successSoft, fg: colors.success, label: "En cours" },
    COMPLETED: { bg: colors.accentSoft, fg: colors.accent, label: "Terminée" },
    CANCELLED: { bg: colors.dangerSoft, fg: colors.danger, label: "Annulée" },
  };
  const t = tone[status];
  return (
    <View style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: t.bg, flexShrink: 0 }}>
      <Text style={[type.caption, { color: t.fg, fontWeight: "600" }]}>{t.label}</Text>
    </View>
  );
}
