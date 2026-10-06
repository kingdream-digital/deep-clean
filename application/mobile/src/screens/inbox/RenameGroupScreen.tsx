import React, { useState } from "react";
import { View } from "react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { ScreenContainer } from "../../components/ScreenContainer";
import { TextField } from "../../components/TextField";
import { Button } from "../../components/Button";
import { useTheme } from "../../theme/ThemeProvider";
import { renameConversation } from "../../api/messages.api";
import { extractErrorMessage } from "../../api/client";
import { Alert } from "../../utils/alert";

type Route = RouteProp<{ RenameGroup: { conversationId: string; currentTitle: string } }, "RenameGroup">;

/** Renommage d'un groupe — écran dédié plutôt qu'un champ dans une alerte,
 *  qui ne se comporte pas de la même façon sur toutes les plateformes. */
export function RenameGroupScreen() {
  const { spacing } = useTheme();
  const navigation = useNavigation();
  const { conversationId, currentTitle } = useRoute<Route>().params;

  const [title, setTitle] = useState(currentTitle);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const value = title.trim();
    if (!value) return;
    setSaving(true);
    try {
      await renameConversation(conversationId, value);
      navigation.goBack();
    } catch (err) {
      Alert.alert("Renommage impossible", extractErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScreenContainer avoidKeyboard style={{ paddingTop: 12 }}>
      <TextField label="Nom du groupe" value={title} onChangeText={setTitle} maxLength={80} autoFocus />
      <View style={{ marginTop: spacing.md }}>
        <Button label="Enregistrer" onPress={handleSave} disabled={!title.trim()} loading={saving} />
      </View>
    </ScreenContainer>
  );
}
