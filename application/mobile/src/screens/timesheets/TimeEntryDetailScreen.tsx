import React, { useCallback, useEffect, useState } from "react";
import { Linking, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRoute, RouteProp } from "@react-navigation/native";
import { ScreenContainer } from "../../components/ScreenContainer";
import { StateView } from "../../components/StateView";
import { Card } from "../../components/Card";
import { AuthenticatedImage } from "../../components/AuthenticatedImage";
import { PressableScale } from "../../components/PressableScale";
import { TimeEntryStatusBadge } from "../../components/TimeEntryStatusBadge";
import { useTheme } from "../../theme/ThemeProvider";
import { getTimeEntry, clockInPhotoUrl, clockOutPhotoUrl } from "../../api/timesheets.api";
import type { TimeEntry } from "../../api/timesheets.api";
import { formatDuration } from "../../utils/duration";
import { formatHoursMinutes } from "../../utils/timesheetSummary";

type Route = RouteProp<{ TimeEntryDetail: { entryId: string } }, "TimeEntryDetail">;

const dayFmt = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" });
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

// Justificatif anti-fraude (photo + position GPS pris au moment du pointage) —
// affiché uniquement quand ces informations existent, pour rester compatible
// avec les pointages saisis avant l'introduction de cette fonctionnalité.
function ProofSection({
  title,
  photoUrl,
  latitude,
  longitude,
  accuracy,
}: {
  title: string;
  photoUrl: string;
  latitude?: number | null;
  longitude?: number | null;
  accuracy?: number | null;
}) {
  const { colors, spacing, type, radius } = useTheme();
  const hasPosition = latitude != null && longitude != null;

  return (
    <View style={{ marginTop: spacing.md }}>
      <Text style={[type.footnote, { color: colors.inkTertiary }]}>{title}</Text>
      <AuthenticatedImage
        uri={photoUrl}
        style={{ width: "100%", height: 200, marginTop: spacing.xs, borderRadius: radius.md, backgroundColor: colors.surfaceAlt }}
      />
      {hasPosition && (
        <PressableScale
          onPress={() => Linking.openURL(`https://www.google.com/maps?q=${latitude},${longitude}`)}
          style={{ flexDirection: "row", alignItems: "center", marginTop: spacing.sm }}
        >
          <Ionicons name="location-outline" size={16} color={colors.accent} />
          <Text style={[type.callout, { color: colors.accent, marginLeft: spacing.xs }]}>
            Voir sur la carte{accuracy != null ? ` (précision ${Math.round(accuracy)} m)` : ""}
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

  const load = useCallback(async () => {
    try {
      setState("loading");
      setEntry(await getTimeEntry(entryId));
      setState("ready");
    } catch {
      setState("error");
    }
  }, [entryId]);

  useEffect(() => {
    void load();
  }, [load]);

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
      <View style={{ paddingTop: spacing.lg }}>
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
          {entry.isRetroactive && (
            <InfoRow icon="alert-circle-outline" label="Type" value="Pointage différé (saisi après coup)" />
          )}
          {entry.validatedBy && (
            <InfoRow
              icon={entry.status === "REJECTED" ? "close-circle-outline" : "checkmark-circle-outline"}
              label={entry.status === "REJECTED" ? "Refusé par" : "Validé par"}
              value={`${entry.validatedBy.firstName} ${entry.validatedBy.lastName}${
                entry.validatedAt ? " le " + dayFmt.format(new Date(entry.validatedAt)) : ""
              }`}
            />
          )}
          {entry.comment && <InfoRow icon="chatbubble-outline" label="Commentaire" value={entry.comment} />}
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
            {entry.hasClockInPhoto && (
              <ProofSection
                title="Prise à l'arrivée"
                photoUrl={clockInPhotoUrl(entry.id)}
                latitude={entry.clockInLatitude}
                longitude={entry.clockInLongitude}
                accuracy={entry.clockInAccuracy}
              />
            )}
            {entry.hasClockOutPhoto && (
              <ProofSection
                title="Prise au départ"
                photoUrl={clockOutPhotoUrl(entry.id)}
                latitude={entry.clockOutLatitude}
                longitude={entry.clockOutLongitude}
                accuracy={entry.clockOutAccuracy}
              />
            )}
          </Card>
        )}
      </View>
    </ScreenContainer>
  );
}
