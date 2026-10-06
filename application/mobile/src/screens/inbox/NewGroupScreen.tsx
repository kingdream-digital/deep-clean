import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { StateView } from "../../components/StateView";
import { TextField } from "../../components/TextField";
import { Button } from "../../components/Button";
import { PressableScale } from "../../components/PressableScale";
import { Avatar } from "../../components/Avatar";
import { useTheme } from "../../theme/ThemeProvider";
import { createGroupConversation, listContacts } from "../../api/messages.api";
import type { Contact } from "../../api/messages.api";
import { extractErrorMessage } from "../../api/client";
import { Alert } from "../../utils/alert";
import { ROLE_LABELS_SHORT } from "../../utils/roleLabels";
import type { InboxStackParamList } from "../../navigation/InboxStack";

/**
 * Création d'un groupe (retour explicite du client : "un système de messagerie
 * de groupe pour parler à plusieurs personnes") : un nom, puis les collègues
 * à y mettre. Deux personnes minimum en plus de soi — à deux, c'est une
 * conversation directe, et en créer un "groupe" doublonnerait le fil existant.
 */
export function NewGroupScreen() {
  const { colors, spacing, radius, type } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<InboxStackParamList>>();

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [search, setSearch] = useState("");
  const [title, setTitle] = useState("");
  const [selected, setSelected] = useState<Contact[]>([]);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      setState("loading");
      setContacts(await listContacts());
      setState("ready");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((c) => `${c.firstName} ${c.lastName}`.toLowerCase().includes(q));
  }, [contacts, search]);

  const selectedIds = useMemo(() => new Set(selected.map((c) => c.id)), [selected]);

  function toggle(contact: Contact) {
    setSelected((prev) =>
      prev.some((c) => c.id === contact.id) ? prev.filter((c) => c.id !== contact.id) : [...prev, contact]
    );
  }

  const canCreate = title.trim().length > 0 && selected.length >= 2;

  async function handleCreate() {
    if (!canCreate) return;
    setCreating(true);
    try {
      const conversation = await createGroupConversation(
        title.trim(),
        selected.map((c) => c.id)
      );
      // `replace` plutôt que `navigate` : revenir en arrière depuis le groupe
      // qu'on vient de créer doit ramener à la messagerie, pas au formulaire.
      navigation.replace("ConversationThread", { conversationId: conversation.id });
    } catch (err) {
      Alert.alert("Création impossible", extractErrorMessage(err));
    } finally {
      setCreating(false);
    }
  }

  return (
    <ScreenContainer avoidKeyboard style={{ paddingTop: 12 }}>
      <TextField
        label="Nom du groupe"
        placeholder="Ex. Chantier Le Phare"
        value={title}
        onChangeText={setTitle}
        maxLength={80}
      />

      {selected.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          // `flexGrow: 0` : sans cela, une ScrollView placée dans un
          // conteneur flex s'étire sur toute la hauteur restante et laisse un
          // grand vide entre les personnes choisies et le champ de recherche.
          style={{ marginBottom: spacing.sm, flexGrow: 0 }}
          contentContainerStyle={{ paddingVertical: 4 }}
        >
          {selected.map((contact) => (
            <PressableScale key={contact.id} onPress={() => toggle(contact)} style={{ marginRight: spacing.sm }}>
              <View style={{ alignItems: "center", width: 56 }}>
                <View>
                  <Avatar user={contact} size={44} />
                  <View
                    style={{
                      position: "absolute",
                      right: -2,
                      top: -2,
                      backgroundColor: colors.inkSecondary,
                      borderRadius: radius.pill,
                      width: 18,
                      height: 18,
                      alignItems: "center",
                      justifyContent: "center",
                      borderWidth: 2,
                      borderColor: colors.background,
                    }}
                  >
                    <Ionicons name="close" size={10} color={colors.inkInverted} />
                  </View>
                </View>
                <Text style={[type.caption, { color: colors.inkSecondary, marginTop: 4 }]} numberOfLines={1}>
                  {contact.firstName}
                </Text>
              </View>
            </PressableScale>
          ))}
        </ScrollView>
      )}

      <TextField
        label="Ajouter des collègues"
        placeholder="Rechercher un nom"
        autoCapitalize="none"
        value={search}
        onChangeText={setSearch}
      />

      {state === "loading" && <StateView kind="loading" />}
      {state === "error" && <StateView kind="error" onRetry={load} />}
      {state === "ready" && filtered.length === 0 && (
        <StateView kind="empty" icon="people-outline" message="Aucun collègue trouvé." />
      )}

      {state === "ready" && filtered.length > 0 && (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: spacing.md }}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            const isSelected = selectedIds.has(item.id);
            return (
              <PressableScale onPress={() => toggle(item)} pressedScale={0.985}>
                <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: spacing.sm }}>
                  <Avatar user={item} size={40} />
                  <View style={{ marginLeft: spacing.sm, flex: 1 }}>
                    <Text style={[type.body, { color: colors.ink }]} numberOfLines={1}>
                      {item.firstName} {item.lastName}
                    </Text>
                    <Text style={[type.footnote, { color: colors.inkTertiary }]} numberOfLines={1}>
                      {ROLE_LABELS_SHORT[item.role]}
                    </Text>
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
                    {!!isSelected && <Ionicons name="checkmark" size={15} color={colors.onAccent} />}
                  </View>
                </View>
              </PressableScale>
            );
          }}
        />
      )}

      <View style={{ paddingVertical: spacing.sm }}>
        <Button
          label={selected.length >= 2 ? `Créer le groupe (${selected.length + 1})` : "Créer le groupe"}
          onPress={handleCreate}
          disabled={!canCreate}
          loading={creating}
        />
        {!canCreate && (
          <Text style={[type.footnote, { color: colors.inkTertiary, textAlign: "center", marginTop: spacing.xs }]}>
            Donnez un nom au groupe et choisissez au moins deux collègues.
          </Text>
        )}
      </View>
    </ScreenContainer>
  );
}
