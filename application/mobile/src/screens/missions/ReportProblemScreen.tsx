import React, { useState } from "react";
import { Image, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { Alert } from "../../utils/alert";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import NetInfo from "@react-native-community/netinfo";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { TextField } from "../../components/TextField";
import { Button } from "../../components/Button";
import { SegmentedControl } from "../../components/SegmentedControl";
import { useTheme } from "../../theme/ThemeProvider";
import { useResponsive } from "../../hooks/useResponsive";
import { extractErrorMessage } from "../../api/client";
import { createProblem, uploadProblemPhoto } from "../../api/problems.api";
import type { ProblemType } from "../../api/problems.api";
import type { MissionsStackParamList } from "../../navigation/MissionsStack";
import { enqueueAction } from "../../offline/queue";
import { pickWebImages } from "../../utils/webImagePicker";

type Route = RouteProp<{ ReportProblem: { missionId: string } }, "ReportProblem">;

interface PickedPhoto {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
  /** Web uniquement — voir utils/webImagePicker.ts et api/problems.api.ts. */
  file?: File;
}

const MAX_PHOTOS = 5;

export function ReportProblemScreen() {
  const { colors, spacing, radius, type: typeScale } = useTheme();
  const { isDesktopWeb } = useResponsive();
  const route = useRoute<Route>();
  const navigation = useNavigation<NativeStackNavigationProp<MissionsStackParamList>>();
  const { missionId } = route.params;

  const [type, setType] = useState<ProblemType>("ISSUE");
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addAssets(assets: { uri: string; fileName?: string | null; mimeType?: string | null; file?: File }[]) {
    setPhotos((prev) => {
      const room = MAX_PHOTOS - prev.length;
      if (room <= 0) return prev;
      const added = assets
        .slice(0, room)
        .map((a) => ({ uri: a.uri, fileName: a.fileName, mimeType: a.mimeType, file: a.file }));
      return [...prev, ...added];
    });
  }

  async function handleTakePhoto() {
    // Contournement web : voir utils/webImagePicker.ts — l'implémentation web
    // de expo-image-picker n'ouvre jamais la boîte de dialogue (bug
    // upstream : clic synthétique non "trusted"), vérifié en conditions
    // réelles. Sur natif, le SDK Expo fonctionne déjà correctement.
    if (Platform.OS === "web") {
      const files = await pickWebImages({ multiple: false, capture: true });
      addAssets(files);
      return;
    }
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Accès refusé", "Autorisez l'accès à l'appareil photo dans les réglages pour prendre une photo.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.8 });
    if (!result.canceled) addAssets(result.assets);
  }

  async function handlePickFromLibrary() {
    if (Platform.OS === "web") {
      const files = await pickWebImages({ multiple: true });
      addAssets(files);
      return;
    }
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Accès refusé", "Autorisez l'accès aux photos dans les réglages pour en sélectionner.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
      allowsMultipleSelection: true,
      selectionLimit: MAX_PHOTOS - photos.length,
    });
    if (!result.canceled) addAssets(result.assets);
  }

  function handleAddPhoto() {
    if (photos.length >= MAX_PHOTOS) {
      Alert.alert("Limite atteinte", `Vous pouvez joindre au maximum ${MAX_PHOTOS} photos.`);
      return;
    }
    Alert.alert("Ajouter une photo", undefined, [
      { text: "Prendre une photo", onPress: handleTakePhoto },
      { text: "Choisir dans la galerie", onPress: handlePickFromLibrary },
      { text: "Annuler", style: "cancel" },
    ]);
  }

  function removePhoto(uri: string) {
    setPhotos((prev) => prev.filter((p) => p.uri !== uri));
  }

  async function handleSubmit() {
    if (!description.trim()) {
      setError("Merci de décrire ce que vous avez constaté.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const net = await NetInfo.fetch();
      const isOffline = !net.isConnected || net.isInternetReachable === false;

      if (isOffline) {
        // Une photo est un fichier binaire : la mettre en attente de
        // synchronisation est un chantier à part (voir offline/queue.ts),
        // non couvert par cette file. Un signalement texte seul reste
        // différable ; avec photo, il faut une vraie connexion.
        if (photos.length > 0) {
          setError("Vous êtes hors connexion : un signalement avec photo ne peut pas être mis en attente. Réessayez avec une connexion, ou envoyez-le sans photo pour l'instant.");
          setSubmitting(false);
          return;
        }
        await enqueueAction("REPORT_PROBLEM", { missionId, type, description: description.trim() });
        Alert.alert("Signalement enregistré", "Vous êtes hors connexion : il sera envoyé automatiquement dès que la connexion revient.");
        navigation.goBack();
        return;
      }

      const problem = await createProblem({ missionId, type, description: description.trim() });

      for (const photo of photos) {
        // Envoi séquentiel : plus simple à raisonner et à faire échouer proprement
        // qu'un Promise.all, pour un nombre de photos volontairement limité (5 max).
        // eslint-disable-next-line no-await-in-loop
        await uploadProblemPhoto(problem.id, photo);
      }

      navigation.replace("ProblemDetail", { problemId: problem.id });
    } catch (err) {
      setError(extractErrorMessage(err, "Impossible d'envoyer le signalement."));
    } finally {
      setSubmitting(false);
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
        <Text style={[typeScale.subhead, { color: colors.inkSecondary, marginBottom: spacing.xs }]}>Type de signalement</Text>
        <SegmentedControl
          value={type}
          onChange={setType}
          options={[
            { label: "Problème", value: "ISSUE" },
            { label: "Matériel manquant", value: "MISSING_MATERIAL" },
          ]}
        />

        <View style={{ height: spacing.md }} />

        <TextField
          label="Description"
          placeholder={type === "MISSING_MATERIAL" ? "Ex : Plus de produit désinfectant." : "Ex : Sol endommagé dans le couloir."}
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={4}
          style={{ minHeight: 90, textAlignVertical: "top" }}
        />

        <Text style={[typeScale.subhead, { color: colors.inkSecondary, marginBottom: spacing.xs }]}>
          Photos ({photos.length}/{MAX_PHOTOS})
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.lg }}>
          {photos.map((photo) => (
            <View key={photo.uri} style={{ width: 84, height: 84 }}>
              <Image source={{ uri: photo.uri }} style={{ width: 84, height: 84, borderRadius: radius.md }} />
              <Pressable
                onPress={() => removePhoto(photo.uri)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Retirer cette photo"
                style={{
                  position: "absolute",
                  top: -6,
                  right: -6,
                  backgroundColor: colors.danger,
                  borderRadius: radius.pill,
                  width: 22,
                  height: 22,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="close" size={14} color={colors.onAccent} />
              </Pressable>
            </View>
          ))}

          {photos.length < MAX_PHOTOS && (
            <Pressable
              onPress={handleAddPhoto}
              accessibilityRole="button"
              accessibilityLabel="Ajouter une photo"
              style={{
                width: 84,
                height: 84,
                borderRadius: radius.md,
                borderWidth: 1.5,
                borderColor: colors.border,
                borderStyle: "dashed",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="camera-outline" size={24} color={colors.inkTertiary} />
            </Pressable>
          )}
        </View>

        {!!error && <Text style={[typeScale.footnote, { color: colors.danger, marginBottom: spacing.md }]}>{error}</Text>}

        <Button label="Envoyer le signalement" onPress={handleSubmit} loading={submitting} />
      </ScrollView>
    </ScreenContainer>
  );
}
