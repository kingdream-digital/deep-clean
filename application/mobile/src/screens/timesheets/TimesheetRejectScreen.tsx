import React, { useEffect, useState } from "react";
import { ScrollView, Text } from "react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { TextField } from "../../components/TextField";
import { Button } from "../../components/Button";
import { useTheme } from "../../theme/ThemeProvider";
import { useResponsive } from "../../hooks/useResponsive";
import { extractErrorMessage } from "../../api/client";
import { getTimeEntry, rejectTimeEntry } from "../../api/timesheets.api";
import type { TimeEntry } from "../../api/timesheets.api";
import { Card } from "../../components/Card";
import { formatDuration } from "../../utils/duration";
import type { HomeStackParamList } from "../../navigation/HomeStack";

const recapFmt = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

type Route = RouteProp<{ TimesheetReject: { entryId: string } }, "TimesheetReject">;

export function TimesheetRejectScreen() {
  const { spacing, colors, type } = useTheme();
  const { isDesktopWeb } = useResponsive();
  const route = useRoute<Route>();
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const { entryId } = route.params;

  const [comment, setComment] = useState("");
  // Rappel du pointage concerné (retour d'audit : refuser « à l'aveugle »).
  const [entry, setEntry] = useState<TimeEntry | null>(null);
  useEffect(() => {
    getTimeEntry(entryId).then(setEntry).catch(() => setEntry(null));
  }, [entryId]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    if (!comment.trim()) {
      setError("Merci d'indiquer le motif du refus.");
      return;
    }
    setSaving(true);
    try {
      await rejectTimeEntry(entryId, comment.trim());
      navigation.goBack();
    } catch (err) {
      setError(extractErrorMessage(err, "Impossible de refuser ce pointage."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScreenContainer avoidKeyboard style={{ paddingTop: spacing.lg }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={isDesktopWeb ? { maxWidth: 640, width: "100%", alignSelf: "center" } : undefined}
      >
        {!!entry && (
          <Card style={{ marginBottom: spacing.md }}>
            <Text style={[type.headline, { color: colors.ink }]}>
              {entry.user.firstName} {entry.user.lastName}
            </Text>
            <Text style={[type.footnote, { color: colors.inkSecondary, marginTop: 2 }]}>
              {recapFmt.format(new Date(entry.clockIn))} → {entry.clockOut ? recapFmt.format(new Date(entry.clockOut)) : "en cours"} · {formatDuration(entry.clockIn, entry.clockOut)}
            </Text>
            {!!entry.matchedMission && (
              <Text style={[type.footnote, { color: colors.inkTertiary, marginTop: 2 }]}>
                Mission : {entry.matchedMission.title} ({entry.matchedMission.site.name})
              </Text>
            )}
          </Card>
        )}
        <Text style={[type.subhead, { color: colors.inkSecondary, marginBottom: spacing.lg }]}>
          L'employé sera notifié du motif indiqué et pourra saisir un pointage corrigé.
        </Text>
        <TextField
          label="Motif du refus"
          placeholder="Ex : horaire incohérent avec le planning."
          value={comment}
          onChangeText={setComment}
          multiline
          numberOfLines={4}
        />
        {!!error && <Text style={[type.footnote, { color: colors.danger, marginBottom: spacing.md }]}>{error}</Text>}
        <Button label="Refuser ce pointage" variant="destructive" loading={saving} onPress={handleSubmit} />
      </ScrollView>
    </ScreenContainer>
  );
}
