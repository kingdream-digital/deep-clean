import React, { useCallback, useEffect, useState } from "react";
import { ScrollView, Text } from "react-native";
import { Alert } from "../../utils/alert";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { StateView } from "../../components/StateView";
import { TextField } from "../../components/TextField";
import { Button } from "../../components/Button";
import { useTheme } from "../../theme/ThemeProvider";
import { useResponsive } from "../../hooks/useResponsive";
import { extractErrorMessage } from "../../api/client";
import { createStandard, deleteStandard, getStandard, updateStandard } from "../../api/standards.api";
import type { HomeStackParamList } from "../../navigation/HomeStack";

type Route = RouteProp<{ StandardForm: { siteId: string; standardId?: string } }, "StandardForm">;

function linesToList(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

export function StandardFormScreen() {
  const { colors, spacing, type } = useTheme();
  const { isDesktopWeb } = useResponsive();
  const route = useRoute<Route>();
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const { siteId, standardId } = route.params;
  const isEdit = !!standardId;

  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(isEdit ? "loading" : "ready");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [tasksText, setTasksText] = useState("");
  const [equipmentText, setEquipmentText] = useState("");
  const [safetyInstructions, setSafetyInstructions] = useState("");
  const [notes, setNotes] = useState("");

  const load = useCallback(async () => {
    if (!isEdit || !standardId) return;
    try {
      setLoadState("loading");
      const standard = await getStandard(standardId);
      setName(standard.name);
      setTasksText(standard.tasks.join("\n"));
      setEquipmentText(standard.equipment.join("\n"));
      setSafetyInstructions(standard.safetyInstructions ?? "");
      setNotes(standard.notes ?? "");
      setLoadState("ready");
    } catch {
      setLoadState("error");
    }
  }, [isEdit, standardId]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, standardId]);

  async function handleSave() {
    setError(null);
    if (!name.trim()) {
      setError("Le nom du standard est requis.");
      return;
    }
    setSaving(true);
    try {
      if (isEdit && standardId) {
        await updateStandard(standardId, {
          name: name.trim(),
          tasks: linesToList(tasksText),
          equipment: linesToList(equipmentText),
          safetyInstructions: safetyInstructions.trim() || null,
          notes: notes.trim() || null,
        });
      } else {
        await createStandard({
          siteId,
          name: name.trim(),
          tasks: linesToList(tasksText),
          equipment: linesToList(equipmentText),
          safetyInstructions: safetyInstructions.trim() || undefined,
          notes: notes.trim() || undefined,
        });
      }
      navigation.goBack();
    } catch (err) {
      setError(extractErrorMessage(err, "Impossible d'enregistrer ce standard."));
    } finally {
      setSaving(false);
    }
  }

  function handleDelete() {
    if (!standardId) return;
    Alert.alert("Supprimer ce standard ?", "Les missions déjà créées à partir de ce standard ne sont pas affectées.", [
      { text: "Annuler", style: "cancel" },
      {
        text: "Supprimer",
        style: "destructive",
        onPress: async () => {
          setDeleting(true);
          try {
            await deleteStandard(standardId);
            navigation.goBack();
          } catch (err) {
            Alert.alert("Suppression impossible", extractErrorMessage(err));
          } finally {
            setDeleting(false);
          }
        },
      },
    ]);
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
          Un standard réutilisable pour ce chantier — un élément par ligne. Il pourra être appliqué en un clic à la
          création d'une mission.
        </Text>

        <TextField label="Nom du standard" placeholder="Ex. : Nettoyage bureaux standard" value={name} onChangeText={setName} />
        <TextField
          label="Étapes / tâches"
          placeholder={"Ex.\nAspirer les bureaux\nVider les corbeilles"}
          value={tasksText}
          onChangeText={setTasksText}
          multiline
          numberOfLines={5}
        />
        <TextField
          label="Matériel nécessaire"
          placeholder={"Ex.\nAspirateur\nChiffons microfibre"}
          value={equipmentText}
          onChangeText={setEquipmentText}
          multiline
          numberOfLines={4}
        />
        <TextField
          label="Consignes de sécurité (optionnel)"
          placeholder="Ex. : port du masque obligatoire."
          value={safetyInstructions}
          onChangeText={setSafetyInstructions}
          multiline
        />
        <TextField label="Notes (optionnel)" placeholder="Toute information utile." value={notes} onChangeText={setNotes} multiline />

        {error && <Text style={[type.footnote, { color: colors.danger, marginBottom: spacing.md }]}>{error}</Text>}

        <Button label={isEdit ? "Enregistrer les modifications" : "Créer le standard"} onPress={handleSave} loading={saving} />

        {isEdit && (
          <Button
            label="Supprimer ce standard"
            variant="destructive"
            loading={deleting}
            onPress={handleDelete}
            style={{ marginTop: spacing.sm }}
          />
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
