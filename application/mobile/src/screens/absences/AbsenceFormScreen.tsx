import React, { useState } from "react";
import { ScrollView, Text } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { TextField } from "../../components/TextField";
import { DateTimeField } from "../../components/DateTimeField";
import { SegmentedControl } from "../../components/SegmentedControl";
import { Button } from "../../components/Button";
import { useTheme } from "../../theme/ThemeProvider";
import { useResponsive } from "../../hooks/useResponsive";
import { extractErrorMessage } from "../../api/client";
import { createAbsence } from "../../api/absences.api";
import type { AbsenceType } from "../../api/absences.api";
import { toLocalDateKey } from "../../utils/missionFormat";
import type { HomeStackParamList } from "../../navigation/HomeStack";

const dateFmt = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", year: "numeric" });

const TYPE_OPTIONS: { label: string; value: AbsenceType }[] = [
  { label: "Congé payé", value: "PAID_LEAVE" },
  { label: "Maladie", value: "SICK_LEAVE" },
  { label: "Sans solde", value: "UNPAID_LEAVE" },
  { label: "Autre", value: "OTHER" },
];

// Demande d'absence — soumise à validation RH sauf pour la RH elle-même
// (voir absences.service.ts `createAbsence` : une absence déclarée par la RH
// est directement approuvée, elle fait autorité).
export function AbsenceFormScreen() {
  const { colors, spacing, type: typeScale } = useTheme();
  const { isDesktopWeb } = useResponsive();
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();

  const [type, setType] = useState<AbsenceType>("PAID_LEAVE");
  const [startDate, setStartDate] = useState<Date>(new Date());
  const [endDate, setEndDate] = useState<Date>(new Date());
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    if (toLocalDateKey(endDate) < toLocalDateKey(startDate)) {
      setError("La date de fin doit être postérieure ou égale à la date de début.");
      return;
    }
    setSaving(true);
    try {
      await createAbsence({
        type,
        startDate: toLocalDateKey(startDate),
        endDate: toLocalDateKey(endDate),
        reason: reason.trim() || undefined,
      });
      navigation.goBack();
    } catch (err) {
      setError(extractErrorMessage(err, "Impossible d'enregistrer cette demande."));
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
        <Text style={[typeScale.subhead, { color: colors.inkSecondary, marginBottom: spacing.md }]}>Type d'absence</Text>
        <SegmentedControl value={type} onChange={setType} options={TYPE_OPTIONS} />

        <DateTimeField
          label="Du"
          mode="date"
          value={startDate}
          onChange={setStartDate}
          formatValue={(d) => dateFmt.format(d)}
        />
        <DateTimeField
          label="Au"
          mode="date"
          value={endDate}
          minimumDate={startDate}
          onChange={setEndDate}
          formatValue={(d) => dateFmt.format(d)}
        />

        <TextField
          label="Motif (optionnel)"
          placeholder="Ex. : congés d'été, visite médicale…"
          value={reason}
          onChangeText={setReason}
          multiline
        />

        {error && <Text style={[typeScale.footnote, { color: colors.danger, marginBottom: spacing.md }]}>{error}</Text>}

        <Button label="Envoyer la demande" onPress={handleSubmit} loading={saving} />
      </ScrollView>
    </ScreenContainer>
  );
}
