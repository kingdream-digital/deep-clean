import React, { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { TextField } from "../../components/TextField";
import { DateTimeField } from "../../components/DateTimeField";
import { Button } from "../../components/Button";
import { useTheme } from "../../theme/ThemeProvider";
import { useResponsive } from "../../hooks/useResponsive";
import { extractErrorMessage } from "../../api/client";
import { createRetroactiveTimeEntry } from "../../api/timesheets.api";
import type { HomeStackParamList } from "../../navigation/HomeStack";
import { frenchDateFormat } from "../../utils/frenchDate";

const dateFmt = frenchDateFormat({ weekday: "short", day: "numeric", month: "short" });
const timeFmt = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });

function combine(date: Date, time: Date): Date {
  const d = new Date(date);
  d.setHours(time.getHours(), time.getMinutes(), 0, 0);
  return d;
}

function roundedNow(offsetMinutes: number): Date {
  const d = new Date(Date.now() + offsetMinutes * 60000);
  d.setSeconds(0, 0);
  return d;
}

// Pour un oubli de pointage : l'employé saisit une session déjà terminée
// (arrivée + départ), pas un pointage "en cours" — le serveur refuse toute
// période future ou remontant à plus de 7 jours (voir timesheets.service.ts).
export function RetroactiveClockScreen() {
  const { colors, spacing, type } = useTheme();
  const { isDesktopWeb } = useResponsive();
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();

  const [date, setDate] = useState<Date>(roundedNow(0));
  const [startTime, setStartTime] = useState<Date>(roundedNow(-120));
  const [endTime, setEndTime] = useState<Date>(roundedNow(0));
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setError(null);
    const clockInDate = combine(date, startTime);
    const clockOutDate = combine(date, endTime);
    if (clockOutDate <= clockInDate) {
      setError("L'heure de sortie doit être postérieure à l'heure d'entrée.");
      return;
    }

    setSaving(true);
    try {
      await createRetroactiveTimeEntry({
        clockIn: clockInDate.toISOString(),
        clockOut: clockOutDate.toISOString(),
        comment: comment.trim() || undefined,
      });
      navigation.goBack();
    } catch (err) {
      setError(extractErrorMessage(err, "Impossible d'enregistrer ce pointage."));
    } finally {
      setSaving(false);
    }
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
        <Text style={[type.subhead, { color: colors.inkSecondary, marginBottom: spacing.lg }]}>
          Vous avez oublié de pointer ? Indiquez la session déjà effectuée — elle sera soumise à validation
          comme n'importe quel pointage.
        </Text>

        <DateTimeField
          label="Date"
          mode="date"
          value={date}
          maximumDate={new Date()}
          onChange={setDate}
          formatValue={(d) => dateFmt.format(d)}
        />

        <View style={{ flexDirection: "row", gap: spacing.md }}>
          <View style={{ flex: 1 }}>
            <DateTimeField label="Arrivée" mode="time" value={startTime} onChange={setStartTime} formatValue={(d) => timeFmt.format(d)} />
          </View>
          <View style={{ flex: 1 }}>
            <DateTimeField label="Sortie" mode="time" value={endTime} onChange={setEndTime} formatValue={(d) => timeFmt.format(d)} />
          </View>
        </View>

        <TextField
          label="Motif (optionnel)"
          placeholder="Ex. : oubli de pointer en arrivant"
          value={comment}
          onChangeText={setComment}
          multiline
        />

        {!!error && <Text style={[type.footnote, { color: colors.danger, marginBottom: spacing.md }]}>{error}</Text>}

        <Button label="Enregistrer ce pointage" onPress={handleSave} loading={saving} />
      </ScrollView>
    </ScreenContainer>
  );
}
