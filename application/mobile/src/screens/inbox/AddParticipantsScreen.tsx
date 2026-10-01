import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { StateView } from "../../components/StateView";
import { TextField } from "../../components/TextField";
import { Button } from "../../components/Button";
import { PressableScale } from "../../components/PressableScale";
import { Avatar } from "../../components/Avatar";
import { useTheme } from "../../theme/ThemeProvider";
import { addParticipants, getConversation, listContacts } from "../../api/messages.api";
import type { Contact } from "../../api/messages.api";
import { extractErrorMessage } from "../../api/client";
import { Alert } from "../../utils/alert";
import { ROLE_LABELS_SHORT } from "../../utils/roleLabels";
import type { InboxStackParamList } from "../../navigation/InboxStack";

type Route = RouteProp<{ AddParticipants: { conversationId: string } }, "AddParticipants">;

/** Ajout de collègues à un groupe existant — réservé à ses administrateurs
 *  (règle appliquée côté serveur, l'écran n'est qu'un raccourci). */
export function AddParticipantsScreen() {
  const { colors, spacing, radius, type } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<InboxStackParamList>>();
  const { conversationId } = useRoute<Route>().params;

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [alreadyIn, setAlreadyIn] = useState<Set<string>>(new Set());
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setState("loading");
      const [all, conversation] = await Promise.all([listContacts(), getConversation(conversationId)]);
      setContacts(all);
      setAlreadyIn(new Set(conversation.participants.filter((p) => !p.hasLeft).map((p) => p.id)));
      setState("ready");
    } catch {
      setState("error");
    }
  }, [conversationId]);

  useEffect(() => {
    void load();
  }, [load]);

  const available = useMemo(() => {
    const q = search.trim().toLowerCase();
    return contacts
      .filter((c) => !alreadyIn.has(c.id))
      .filter((c) => !q || `${c.firstName} ${c.lastName}`.toLowerCase().includes(q));
  }, [contacts, alreadyIn, search]);

  async function handleAdd() {
    if (selected.length === 0) return;
    setSaving(true);
    try {
      await addParticipants(conversationId, selected);
      navigation.goBack();
    } catch (err) {
      Alert.alert("Ajout impossible", extractErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScreenContainer avoidKeyboard style={{ paddingTop: 12 }}>
      <TextField
        label="Rechercher"
        placeholder="Nom d'un collègue"
        autoCapitalize="none"
        value={search}
        onChangeText={setSearch}
      />

      {state === "loading" && <StateView kind="loading" />}
      {state === "error" && <StateView kind="error" onRetry={load} />}
      {state === "ready" && available.length === 0 && (
        <StateView kind="empty" icon="people-outline" message="Tout le monde fait déjà partie de ce groupe." />
      )}

      {state === "ready" && available.length > 0 && (
        <FlatList
          data={available}
          keyExtractor={(item) => item.id}
          style={{ flex: 1 }}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            const isSelected = selected.includes(item.id);
            return (
              <PressableScale
                onPress={() =>
                  setSelected((prev) => (isSelected ? prev.filter((id) => id !== item.id) : [...prev, item.id]))
                }
                pressedScale={0.985}
              >
                <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: spacing.sm }}>
                  <Avatar user={item} size={40} />
                  <View style={{ marginLeft: spacing.sm, flex: 1 }}>
                    <Text style={[type.body, { color: colors.ink }]} numberOfLines={1}>
                      {item.firstName} {item.lastName}
                    </Text>
                    <Text style={[type.footnote, { color: colors.inkTertiary }]}>{ROLE_LABELS_SHORT[item.role]}</Text>
                  </View>
                  <View
                    style={{
                      width: 23,
                      height: 23,
                      borderRadius: radius.pill,
                      borderWidth: isSelected ? 0 : StyleSheet.hairlineWidth * 2,
                      borderColor: colors.borderStrong,
                      backgroundColor: isSelected ? colors.accentFill : "transparent",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {isSelected && <Ionicons name="checkmark" size={15} color={colors.onAccent} />}
                  </View>
                </View>
              </PressableScale>
            );
          }}
        />
      )}

      <View style={{ paddingVertical: spacing.sm }}>
        <Button
          label={selected.length > 0 ? `Ajouter (${selected.length})` : "Ajouter"}
          onPress={handleAdd}
          disabled={selected.length === 0}
          loading={saving}
        />
      </View>
    </ScreenContainer>
  );
}
