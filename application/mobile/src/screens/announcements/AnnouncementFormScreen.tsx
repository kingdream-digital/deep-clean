import React, { useState } from "react";
import { Image, Platform, ScrollView, Text, View } from "react-native";
import { Alert } from "../../utils/alert";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { TextField } from "../../components/TextField";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { PressableScale } from "../../components/PressableScale";
import { useTheme } from "../../theme/ThemeProvider";
import { extractErrorMessage } from "../../api/client";
import { createAnnouncement } from "../../api/announcements.api";
import type { AnnouncementPhotoAsset } from "../../api/announcements.api";
import { pickWebImages } from "../../utils/webImagePicker";
import type { HomeStackParamList } from "../../navigation/HomeStack";

export function AnnouncementFormScreen() {
  const { colors, spacing, radius, type } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [photo, setPhoto] = useState<AnnouncementPhotoAsset | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleTakePhoto() {
    if (Platform.OS === "web") {
      const [file] = await pickWebImages({ multiple: false, capture: true });
      if (file) setPhoto(file);
      return;
    }
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Accès refusé", "Autorisez l'accès à l'appareil photo dans les réglages pour prendre une photo.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.8 });
    if (!result.canceled) setPhoto(result.assets[0]);
  }

  async function handlePickFromLibrary() {
    if (Platform.OS === "web") {
      const [file] = await pickWebImages({ multiple: false });
      if (file) setPhoto(file);
      return;
    }
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Accès refusé", "Autorisez l'accès aux photos dans les réglages pour en sélectionner.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });
    if (!result.canceled) setPhoto(result.assets[0]);
  }

  function handleAddPhoto() {
    Alert.alert("Photo de couverture", undefined, [
      { text: "Prendre une photo", onPress: handleTakePhoto },
      { text: "Choisir dans la galerie", onPress: handlePickFromLibrary },
      { text: "Annuler", style: "cancel" },
    ]);
  }

  async function handleSubmit() {
    if (!title.trim() || !body.trim()) {
      setError("Merci de renseigner un titre et un message.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const announcement = await createAnnouncement({ title: title.trim(), body: body.trim() }, photo ?? undefined);
      navigation.replace("AnnouncementDetail", { announcementId: announcement.id });
    } catch (err) {
      setError(extractErrorMessage(err, "Impossible de publier cette actualité."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScreenContainer avoidKeyboard>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: spacing.lg }}>
        <Text style={[type.subhead, { color: colors.inkSecondary, marginBottom: spacing.lg }]}>
          Visible immédiatement par toute l'entreprise — chacun reçoit une notification à la publication.
        </Text>

        <Text style={[type.footnote, { color: colors.inkTertiary, marginBottom: spacing.xxs }]}>
          Photo de couverture (facultatif)
        </Text>
        {photo ? (
          <View style={{ marginBottom: spacing.lg }}>
            <Image
              source={{ uri: photo.uri }}
              style={{ width: "100%", height: 180, borderRadius: radius.md, backgroundColor: colors.surfaceAlt }}
            />
            <PressableScale onPress={() => setPhoto(null)} style={{ marginTop: spacing.xs, alignSelf: "flex-start" }}>
              <Text style={[type.footnote, { color: colors.danger, fontWeight: "600" }]}>Retirer la photo</Text>
            </PressableScale>
          </View>
        ) : (
          <Card padded={false} style={{ marginBottom: spacing.lg }}>
            <PressableScale
              onPress={handleAddPhoto}
              style={{ alignItems: "center", justifyContent: "center", paddingVertical: spacing.xl }}
            >
              <Ionicons name="image-outline" size={28} color={colors.accent} />
              <Text style={[type.callout, { color: colors.accent, fontWeight: "600", marginTop: spacing.xs }]}>
                Ajouter une photo
              </Text>
              <Text style={[type.footnote, { color: colors.inkTertiary, marginTop: 2 }]}>
                Une photo de l'entreprise ou des locaux fait un bel effet en tête d'actualité.
              </Text>
            </PressableScale>
          </Card>
        )}

        <TextField label="Titre" placeholder="Ex. Nouveau protocole de nettoyage" value={title} onChangeText={setTitle} maxLength={160} />
        <TextField
          label="Message"
          placeholder="Rédigez votre actualité…"
          value={body}
          onChangeText={setBody}
          multiline
          numberOfLines={6}
          style={{ minHeight: 140, textAlignVertical: "top" }}
        />

        {error && <Text style={[type.footnote, { color: colors.danger, marginBottom: spacing.md }]}>{error}</Text>}

        <Button label="Publier" onPress={handleSubmit} loading={saving} />
      </ScrollView>
    </ScreenContainer>
  );
}
