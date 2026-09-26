import React, { useState } from "react";
import { ScrollView, Text } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { TextField } from "../../components/TextField";
import { Button } from "../../components/Button";
import { useTheme } from "../../theme/ThemeProvider";
import { extractErrorMessage } from "../../api/client";
import { createAnnouncement } from "../../api/announcements.api";
import type { HomeStackParamList } from "../../navigation/HomeStack";

export function AnnouncementFormScreen() {
  const { colors, spacing, type } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!title.trim() || !body.trim()) {
      setError("Merci de renseigner un titre et un message.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const announcement = await createAnnouncement({ title: title.trim(), body: body.trim() });
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
