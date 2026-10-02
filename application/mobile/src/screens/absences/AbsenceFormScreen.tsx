import React, { useEffect, useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { TextField } from "../../components/TextField";
import { DateTimeField } from "../../components/DateTimeField";
import { SegmentedControl } from "../../components/SegmentedControl";
import { Button } from "../../components/Button";
import { PressableScale } from "../../components/PressableScale";
import { useTheme } from "../../theme/ThemeProvider";
import { useResponsive } from "../../hooks/useResponsive";
import { useAuth } from "../../auth/AuthContext";
import { extractErrorMessage } from "../../api/client";
import { createAbsence } from "../../api/absences.api";
import type { AbsenceType } from "../../api/absences.api";
import { countBusinessDaysPreview, getLeaveBalance } from "../../api/leave.api";
import type { LeaveBalance } from "../../api/leave.api";
import { toLocalDateKey } from "../../utils/missionFormat";
import type { HomeStackParamList } from "../../navigation/HomeStack";
import { frenchDateFormat } from "../../utils/frenchDate";
import { formatDaysWithUnit } from "../../utils/leaveDays";

const dateFmt = frenchDateFormat({ weekday: "short", day: "numeric", month: "short", year: "numeric" });

const TYPE_OPTIONS: { label: string; value: AbsenceType }[] = [
  { label: "Congé payé", value: "PAID_LEAVE" },
  { label: "Maladie", value: "SICK_LEAVE" },
  { label: "Sans solde", value: "UNPAID_LEAVE" },
  { label: "Autre", value: "OTHER" },
];

// Types moins courants, proposés à part (surtout saisis par la RH).
const MORE_TYPE_OPTIONS: { label: string; value: AbsenceType }[] = [
  { label: "Accident du travail", value: "WORK_ACCIDENT" },
  { label: "Maternité / paternité", value: "PARENTAL_LEAVE" },
];

// Effet de chaque type sur l'acquisition des congés payés (affiché sous le
// choix, pour que chacun comprenne l'impact sur son compteur).
const RIGHTS_NOTE: Record<AbsenceType, string> = {
  PAID_LEAVE: "Décompté de votre solde, en jours ouvrables. Continue à ouvrir des droits à congés.",
  SICK_LEAVE: "N'est pas décompté du solde. Ouvre 2 jours de congés par mois d'arrêt (au lieu de 2,5).",
  UNPAID_LEAVE: "N'est pas décompté du solde, mais n'ouvre aucun droit à congés sur ces jours.",
  WORK_ACCIDENT: "N'est pas décompté du solde. Assimilé à du travail : ouvre 2,5 jours par mois.",
  PARENTAL_LEAVE: "N'est pas décompté du solde. Assimilé à du travail : ouvre 2,5 jours par mois.",
  OTHER: "N'est pas décompté du solde. Assimilé à du travail (formation, événement familial…).",
};

// Demande d'absence — soumise à validation RH sauf pour la RH elle-même
// (voir absences.service.ts `createAbsence` : une absence déclarée par la RH
// est directement approuvée, elle fait autorité).
export function AbsenceFormScreen() {
  const { colors, spacing, type: typeScale } = useTheme();
  const { isDesktopWeb } = useResponsive();
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const { user } = useAuth();
  const { params } = useRoute<RouteProp<HomeStackParamList, "AbsenceForm">>();
  // Pour quelqu'un d'autre (responsable depuis le planning) : enregistrée et
  // approuvée directement par le serveur, la personne est prévenue.
  const forOther = !!params?.userId && params.userId !== user?.id;
  const targetUserId = forOther ? params!.userId! : user?.id;
  const initialDay = params?.initialDate ? new Date(`${params.initialDate}T00:00:00`) : new Date();

  const [type, setType] = useState<AbsenceType>(forOther ? "SICK_LEAVE" : "PAID_LEAVE");
  const [startDate, setStartDate] = useState<Date>(initialDay);
  const [endDate, setEndDate] = useState<Date>(initialDay);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [balance, setBalance] = useState<LeaveBalance | null>(null);

  useEffect(() => {
    if (!targetUserId) return;
    getLeaveBalance(targetUserId).then(setBalance).catch(() => setBalance(null));
  }, [targetUserId]);

  const requestedDays = useMemo(() => countBusinessDaysPreview(startDate, endDate), [startDate, endDate]);
  const wouldExceedBalance = type === "PAID_LEAVE" && balance != null && requestedDays > balance.remaining;

  async function handleSubmit() {
    setError(null);
    if (toLocalDateKey(endDate) < toLocalDateKey(startDate)) {
      setError("La date de fin doit être postérieure ou égale à la date de début.");
      return;
    }
    setSaving(true);
    try {
      await createAbsence({
        ...(forOther ? { userId: targetUserId } : {}),
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
        {forOther && (
          <Card style={{ marginBottom: spacing.lg }}>
            <Text style={[typeScale.headline, { color: colors.ink }]}>{params?.fullName}</Text>
            <Text style={[typeScale.footnote, { color: colors.inkSecondary, marginTop: 2 }]}>
              L'absence est enregistrée directement (sans validation) et la personne est prévenue. Elle apparaît aussitôt dans le planning.
            </Text>
          </Card>
        )}

        <Text style={[typeScale.subhead, { color: colors.inkSecondary, marginBottom: spacing.md }]}>Type d'absence</Text>
        <SegmentedControl value={type} onChange={setType} options={TYPE_OPTIONS} />
        <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm }}>
          {MORE_TYPE_OPTIONS.map((opt) => (
            <PressableScale key={opt.value} onPress={() => setType(opt.value)} style={{ flex: 1 }}>
              <View
                style={{
                  paddingVertical: spacing.sm,
                  borderRadius: 10,
                  alignItems: "center",
                  borderWidth: 1,
                  borderColor: type === opt.value ? colors.accent : colors.border,
                  backgroundColor: type === opt.value ? colors.accentSoft : "transparent",
                }}
              >
                <Text style={[typeScale.footnote, { color: type === opt.value ? colors.accentText : colors.inkSecondary, fontWeight: "600" }]}>
                  {opt.label}
                </Text>
              </View>
            </PressableScale>
          ))}
        </View>
        <Text style={[typeScale.footnote, { color: colors.inkTertiary, marginTop: spacing.sm }]}>{RIGHTS_NOTE[type]}</Text>

        {/* Respiration entre le choix du type et les dates : le libellé « Du »
            touchait le sélecteur. */}
        <View style={{ height: spacing.lg }} />

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

        <Card style={{ marginBottom: spacing.md }}>
          <Text style={[typeScale.callout, { color: colors.ink }]}>
            {requestedDays} jour{requestedDays > 1 ? "s" : ""} ouvrable{requestedDays > 1 ? "s" : ""}
            {type === "PAID_LEAVE" ? " (du lundi au samedi, hors jours fériés)" : ""}
          </Text>
          {type === "PAID_LEAVE" && balance && (
            <Text style={[typeScale.footnote, { color: wouldExceedBalance ? colors.danger : colors.inkTertiary, marginTop: 2 }]}>
              {wouldExceedBalance
                ? `⚠️ Solde restant : ${formatDaysWithUnit(balance.remaining)} — cette demande le dépasse.`
                : `Solde restant après cette demande : ${formatDaysWithUnit(balance.remaining - requestedDays)}.`}
            </Text>
          )}
        </Card>

        <TextField
          label="Motif (optionnel)"
          placeholder="Ex. : congés d'été, visite médicale…"
          value={reason}
          onChangeText={setReason}
          multiline
        />

        {!!error && <Text style={[typeScale.footnote, { color: colors.danger, marginBottom: spacing.md }]}>{error}</Text>}

        <Button label={forOther ? "Enregistrer l'absence" : "Envoyer la demande"} onPress={handleSubmit} loading={saving} />
      </ScrollView>
    </ScreenContainer>
  );
}
