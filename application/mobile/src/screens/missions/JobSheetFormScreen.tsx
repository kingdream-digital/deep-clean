import React, { useCallback, useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { StateView } from "../../components/StateView";
import { TextField } from "../../components/TextField";
import { Button } from "../../components/Button";
import { useTheme } from "../../theme/ThemeProvider";
import { useResponsive } from "../../hooks/useResponsive";
import { extractErrorMessage } from "../../api/client";
import { getMission, upsertJobSheet } from "../../api/missions.api";
import type { MissionsStackParamList } from "../../navigation/MissionsStack";

type Route = RouteProp<{ JobSheetForm: { missionId: string } }, "JobSheetForm">;

function linesToList(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

// Fiche de poste = document standard de la mission (étapes, matériel,
// sécurité), créé par le superviseur (ou tout rôle habilité à gérer le
// planning) pour que l'employé affecté sache exactement comment procéder,
// au-delà des consignes libres déjà présentes sur la mission.
export function JobSheetFormScreen() {
  const { colors, spacing, type } = useTheme();
  const { isDesktopWeb } = useResponsive();
  const route = useRoute<Route>();
  const navigation = useNavigation<NativeStackNavigationProp<MissionsStackParamList>>();
  const { missionId } = route.params;

  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missionTitle, setMissionTitle] = useState("");

  const [tasksText, setTasksText] = useState("");
  const [equipmentText, setEquipmentText] = useState("");
  const [safetyInstructions, setSafetyInstructions] = useState("");
  const [notes, setNotes] = useState("");

  const load = useCallback(async () => {
    try {
      setLoadState("loading");
      const mission = await getMission(missionId);
      setMissionTitle(mission.title);
      if (mission.jobSheet) {
        setTasksText(mission.jobSheet.tasks.join("\n"));
        setEquipmentText(mission.jobSheet.equipment.join("\n"));
        setSafetyInstructions(mission.jobSheet.safetyInstructions ?? "");
        setNotes(mission.jobSheet.notes ?? "");
      }
      setLoadState("ready");
    } catch {
      setLoadState("error");
    }
  }, [missionId]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missionId]);

  async function handleSave() {
    setError(null);
    setSaving(true);
    try {
      await upsertJobSheet(missionId, {
        tasks: linesToList(tasksText),
        equipment: linesToList(equipmentText),
        safetyInstructions: safetyInstructions.trim() || null,
        notes: notes.trim() || null,
      });
      navigation.goBack();
    } catch (err) {
      setError(extractErrorMessage(err, "Impossible d'enregistrer la fiche de poste."));
    } finally {
      setSaving(false);
    }
  }

  if (loadState === "loading") {
    return (
      <ScreenContainer>
        <StateView kind="loading" />
      </ScreenContainer>
    );
  }
  if (loadState === "error") {
    return (
      <ScreenContainer>
        <StateView kind="error" onRetry={load} />
      </ScreenContainer>
    );
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
          Document standard pour « {missionTitle} » — un élément par ligne.
        </Text>

        <TextField
          label="Étapes / tâches"
          placeholder={"Ex.\nAspirer les bureaux\nVider les corbeilles\nNettoyer les sanitaires"}
          value={tasksText}
          onChangeText={setTasksText}
          multiline
          numberOfLines={5}
        />
        <TextField
          label="Matériel nécessaire"
          placeholder={"Ex.\nAspirateur\nChiffons microfibre\nProduit désinfectant"}
          value={equipmentText}
          onChangeText={setEquipmentText}
          multiline
          numberOfLines={4}
        />
        <TextField
          label="Consignes de sécurité (optionnel)"
          placeholder="Ex. : porter des gants, sol glissant après lavage."
          value={safetyInstructions}
          onChangeText={setSafetyInstructions}
          multiline
        />
        <TextField
          label="Notes (optionnel)"
          placeholder="Toute information utile pour cette mission."
          value={notes}
          onChangeText={setNotes}
          multiline
        />

        {error && <Text style={[type.footnote, { color: colors.danger, marginBottom: spacing.md }]}>{error}</Text>}

        <Button label="Enregistrer la fiche de poste" onPress={handleSave} loading={saving} />
      </ScrollView>
    </ScreenContainer>
  );
}
