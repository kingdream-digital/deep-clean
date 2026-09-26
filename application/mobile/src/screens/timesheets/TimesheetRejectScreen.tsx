import React, { useState } from "react";
import { ScrollView, Text } from "react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { TextField } from "../../components/TextField";
import { Button } from "../../components/Button";
import { useTheme } from "../../theme/ThemeProvider";
import { useResponsive } from "../../hooks/useResponsive";
import { extractErrorMessage } from "../../api/client";
import { rejectTimeEntry } from "../../api/timesheets.api";
import type { HomeStackParamList } from "../../navigation/HomeStack";

type Route = RouteProp<{ TimesheetReject: { entryId: string } }, "TimesheetReject">;

export function TimesheetRejectScreen() {
  const { spacing, colors, type } = useTheme();
  const { isDesktopWeb } = useResponsive();
  const route = useRoute<Route>();
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const { entryId } = route.params;

  const [comment, setComment] = useState("");
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
        <Text style={[type.subhead, { color: colors.inkSecondary, marginBottom: spacing.lg }]}>
          L'employé sera notifié du motif indiqué et pourra en discuter avec vous.
        </Text>
        <TextField
          label="Motif du refus"
          placeholder="Ex : horaire incohérent avec le planning."
          value={comment}
          onChangeText={setComment}
          multiline
          numberOfLines={4}
        />
        {error && <Text style={[type.footnote, { color: colors.danger, marginBottom: spacing.md }]}>{error}</Text>}
        <Button label="Refuser ce pointage" variant="destructive" loading={saving} onPress={handleSubmit} />
      </ScrollView>
    </ScreenContainer>
  );
}
