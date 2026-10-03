import React, { useCallback, useEffect, useState } from "react";
import { Linking, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { ScreenContainer } from "../../components/ScreenContainer";
import { StateView } from "../../components/StateView";
import { Card } from "../../components/Card";
import { AuthenticatedImage } from "../../components/AuthenticatedImage";
import { PhotoViewerModal } from "../../components/PhotoViewerModal";
import { PressableScale } from "../../components/PressableScale";
import { TimeEntryStatusBadge } from "../../components/TimeEntryStatusBadge";
import { useTheme } from "../../theme/ThemeProvider";
import { getTimeEntry, clockInPhotoUrl, clockOutPhotoUrl, validateTimeEntry } from "../../api/timesheets.api";
import { Button } from "../../components/Button";
import { useAuth } from "../../auth/AuthContext";
import { extractErrorMessage } from "../../api/client";
import { Alert } from "../../utils/alert";
import type { TimeEntry } from "../../api/timesheets.api";
import { formatDuration } from "../../utils/duration";
import { formatHoursMinutes } from "../../utils/timesheetSummary";
import { DISTANCE_ALERT_METERS, formatDistance } from "../../utils/distance";
import { frenchDateFormat } from "../../utils/frenchDate";
import { isBackgroundRefresh, useReloadOnDataChange } from "../../sync/liveSync";

const DECIDE_ROLES = ["SITE_MANAGER", "SUPERVISOR", "HR", "DIRECTOR", "ADMIN"];

type Route = RouteProp<{ TimeEntryDetail: { entryId: string } }, "TimeEntryDetail">;

const dayFmt = frenchDateFormat({ weekday: "long", day: "numeric", month: "long" });
const timeFmt = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });

function InfoRow({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  const { colors, spacing, type } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", marginTop: spacing.sm }}>
      <Ionicons name={icon} size={16} color={colors.inkTertiary} style={{ marginTop: 2 }} />
      <View style={{ marginLeft: spacing.xs, flex: 1 }}>
        <Text style={[type.footnote, { color: colors.inkTertiary }]}>{label}</Text>
        <Text style={[type.callout, { color: colors.ink, marginTop: 1 }]}>{value}</Text>
      </View>
    </View>
  );
}

// Justificatif anti-fraude (photo + position GPS pris au moment du pointage)
// — affiché uniquement quand ces informations existent, pour rester
// compatible avec les pointages saisis avant l'introduction de cette
// fonctionnalité. La comparaison avec le chantier prévu (adresse + distance)
// est calculée entièrement en interne, côté serveur, sans aucun service de
// géocodage tiers (retour explicite du client) — elle reste absente si le
// chantier n'a pas encore de position GPS enregistrée.
function ProofSection({
  title,
  photoUrl,
  latitude,
  longitude,
  accuracy,
  siteAddress,
  distanceMeters,
  onOpenPhoto,
}: {
  title: string;
  photoUrl: string;
  latitude?: number | null;
  longitude?: number | null;
  accuracy?: number | null;
  siteAddress?: string | null;
  distanceMeters?: number | null;
  onOpenPhoto: (uri: string) => void;
}) {
  const { colors, spacing, type, radius } = useTheme();
  const hasPosition = latitude != null && longitude != null;
  const isFar = distanceMeters != null && distanceMeters > DISTANCE_ALERT_METERS;

  return (
    <View style={{ marginTop: spacing.md }}>
      <Text style={[type.footnote, { color: colors.inkTertiary }]}>{title}</Text>
      <PressableScale onPress={() => onOpenPhoto(photoUrl)} accessibilityRole="button" accessibilityLabel="Agrandir la photo">
        <AuthenticatedImage
          uri={photoUrl}
          style={{ width: "100%", height: 200, marginTop: spacing.xs, borderRadius: radius.md, backgroundColor: colors.surfaceAlt }}
        />
      </PressableScale>

      {distanceMeters != null && (
        <View style={{ flexDirection: "row", alignItems: "center", marginTop: spacing.sm }}>
          <Ionicons
            name={isFar ? "warning-outline" : "checkmark-circle-outline"}
            size={16}
            color={isFar ? colors.warning : colors.success}
          />
          <Text style={[type.callout, { color: isFar ? colors.warning : colors.success, marginLeft: spacing.xs, flex: 1 }]}>
            Pointé à {formatDistance(distanceMeters)} du chantier prévu
          </Text>
        </View>
      )}
      {!!siteAddress && (
        <Text style={[type.footnote, { color: colors.inkTertiary, marginTop: 2 }]}>Chantier prévu : {siteAddress}</Text>
      )}

      {!!hasPosition && (
        <PressableScale
          onPress={() => Linking.openURL(`https://www.google.com/maps?q=${latitude},${longitude}`)}
          style={{ flexDirection: "row", alignItems: "flex-start", marginTop: spacing.xs }}
        >
          <Ionicons name="location-outline" size={14} color={colors.accent} style={{ marginTop: 2 }} />
          <Text style={[type.footnote, { color: colors.accent, marginLeft: spacing.xs, flex: 1 }]}>
            Voir la position pointée sur la carte{accuracy != null ? ` (précision ${Math.round(accuracy)} m)` : ""}
          </Text>
        </PressableScale>
      )}
    </View>
  );
}

// Détail d'un pointage — accessible notamment depuis une notification de
// validation/refus, pour voir concrètement les heures pointées et qui a
// validé (au-delà du seul texte de la notification).
export function TimeEntryDetailScreen() {
  const { colors, spacing, type } = useTheme();
  const route = useRoute<Route>();
  const { entryId } = route.params;

  const [entry, setEntry] = useState<TimeEntry | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const { user } = useAuth();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const navigation = useNavigation<any>();

  const load = useCallback(async () => {
    const silent = isBackgroundRefresh();
    try {
      if (!silent) setState("loading");
      setEntry(await getTimeEntry(entryId));
      setState("ready");
    } catch {
      if (!silent) setState("error");
    }
  }, [entryId]);

  useEffect(() => {
    void load();
  }, [load]);
  useReloadOnDataChange(load);

  if (state === "loading") {
    return (
      <ScreenContainer>
        <StateView kind="loading" />
      </ScreenContainer>
    );
  }
  if (state === "error" || !entry) {
    return (
      <ScreenContainer>
        <StateView kind="error" onRetry={load} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: spacing.lg, paddingBottom: spacing.xxl }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={[type.title1, { color: colors.ink }]}>
            {entry.user.firstName} {entry.user.lastName}
          </Text>
          <TimeEntryStatusBadge status={entry.status} />
        </View>

        <Card style={{ marginTop: spacing.lg }}>
          <InfoRow icon="calendar-outline" label="Date" value={dayFmt.format(new Date(entry.clockIn))} />
          <InfoRow
            icon="time-outline"
            label="Horaires pointés"
            value={`${timeFmt.format(new Date(entry.clockIn))} – ${
              entry.clockOut ? timeFmt.format(new Date(entry.clockOut)) : "en cours"
            } (${formatDuration(entry.clockIn, entry.clockOut)})`}
          />
          {!!entry.matchedMission && (
            <>
              <InfoRow icon="briefcase-outline" label="Mission" value={entry.matchedMission.title} />
              <InfoRow icon="business-outline" label="Chantier" value={entry.matchedMission.site.name} />
              <InfoRow
                icon="calendar-clear-outline"
                label="Horaire prévu pour cette mission"
                value={`${timeFmt.format(new Date(entry.matchedMission.startTime))} – ${timeFmt.format(
                  new Date(entry.matchedMission.endTime)
                )}`}
              />
            </>
          )}
          {!!entry.matchedMission && !!entry.clockOut && (() => {
            const planned = (new Date(entry.matchedMission.endTime).getTime() - new Date(entry.matchedMission.startTime).getTime()) / 60000;
            const worked = (new Date(entry.clockOut).getTime() - new Date(entry.clockIn).getTime()) / 60000;
            const gap = Math.round(worked - planned);
            if (Math.abs(gap) < 15) return null;
            return (
              <InfoRow
                icon="alert-circle-outline"
                label="Écart avec l'horaire prévu"
                value={`${formatHoursMinutes(Math.abs(gap))} ${gap > 0 ? "de plus" : "de moins"} que prévu`}
              />
            );
          })()}
          {!!entry.isRetroactive && (
            <InfoRow icon="alert-circle-outline" label="Type" value="Pointage différé (saisi après coup)" />
          )}
          {!!entry.validatedBy && (
            <InfoRow
              icon={entry.status === "REJECTED" ? "close-circle-outline" : "checkmark-circle-outline"}
              label={entry.status === "REJECTED" ? "Refusé par" : "Validé par"}
              value={`${entry.validatedBy.firstName} ${entry.validatedBy.lastName}${
                entry.validatedAt ? " le " + dayFmt.format(new Date(entry.validatedAt)) : ""
              }`}
            />
          )}
          {!!entry.comment && <InfoRow icon="chatbubble-outline" label="Commentaire" value={entry.comment} />}
          {entry.overtimeMinutes != null && (
            <InfoRow
              icon="trending-up-outline"
              label="Heures supplémentaires"
              value={`+${formatHoursMinutes(entry.overtimeMinutes)} au-delà de la mission prévue, payées normalement.`}
            />
          )}
          {entry.status === "VALIDATED" && (
            <InfoRow icon="paper-plane-outline" label="Transmission" value="Heures transmises à la RH." />
          )}
        </Card>

        {(entry.hasClockInPhoto || entry.hasClockOutPhoto) && (
          <Card style={{ marginTop: spacing.md }}>
            <Text style={[type.callout, { color: colors.ink, fontWeight: "600" }]}>Justificatif de pointage</Text>
            {!!entry.hasClockInPhoto && (
              <ProofSection
                title="Prise à l'arrivée"
                photoUrl={clockInPhotoUrl(entry.id)}
                latitude={entry.clockInLatitude}
                longitude={entry.clockInLongitude}
                accuracy={entry.clockInAccuracy}
                siteAddress={entry.matchedMission?.site.address}
                distanceMeters={entry.clockInDistanceMeters}
                onOpenPhoto={setViewerUri}
              />
            )}
            {!!entry.hasClockOutPhoto && (
              <ProofSection
                title="Prise au départ"
                photoUrl={clockOutPhotoUrl(entry.id)}
                latitude={entry.clockOutLatitude}
                longitude={entry.clockOutLongitude}
                accuracy={entry.clockOutAccuracy}
                siteAddress={entry.matchedMission?.site.address}
                distanceMeters={entry.clockOutDistanceMeters}
                onOpenPhoto={setViewerUri}
              />
            )}
          </Card>
        )}
              {/* Décider directement depuis le détail (retour d'audit : il fallait
            revenir à la liste). Le serveur revérifie toujours le droit. */}
        {entry.status === "PENDING" && !!entry.clockOut && !!user && user.id !== entry.user.id && DECIDE_ROLES.includes(user.role) && (
          <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg }}>
            <View style={{ flex: 1 }}>
              <Button label="Refuser" variant="secondary" onPress={() => navigation.navigate("TimesheetReject", { entryId: entry.id })} />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                label="Valider"
                loading={validating}
                onPress={async () => {
                  setValidating(true);
                  try {
                    setEntry({ ...entry, ...(await validateTimeEntry(entry.id)) });
                  } catch (err) {
                    Alert.alert("Validation impossible", extractErrorMessage(err));
                  } finally {
                    setValidating(false);
                  }
                }}
              />
            </View>
          </View>
        )}
        {/* Pointage refusé : l'employé saisit la version corrigée. */}
        {entry.status === "REJECTED" && !!user && user.id === entry.user.id && (
          <View style={{ marginTop: spacing.lg }}>
            <Text style={[type.footnote, { color: colors.inkSecondary, marginBottom: spacing.sm }]}>
              Ce pointage a été refusé. Saisissez un pointage différé avec les heures réelles : il sera de nouveau soumis à validation.
            </Text>
            <Button label="Saisir le pointage corrigé" icon="create-outline" onPress={() => navigation.navigate("TimesheetRetroactive")} />
          </View>
        )}
      </ScrollView>
      <PhotoViewerModal visible={!!viewerUri} uri={viewerUri} onClose={() => setViewerUri(null)} />
    </ScreenContainer>
  );
}
