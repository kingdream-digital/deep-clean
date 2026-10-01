import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { StateView } from "../../components/StateView";
import { TextField } from "../../components/TextField";
import { PressableScale } from "../../components/PressableScale";
import { Avatar } from "../../components/Avatar";
import { useTheme } from "../../theme/ThemeProvider";
import { listContacts } from "../../api/messages.api";
import type { Contact } from "../../api/messages.api";
import { ROLE_LABELS } from "../../utils/roleLabels";
import type { InboxStackParamList } from "../../navigation/InboxStack";

// Annuaire complet de l'entreprise (tout compte actif) pour démarrer une
// conversation — à deux en touchant un nom, ou à plusieurs via « Nouveau
// groupe » (retour explicite du client : "parler à plusieurs personnes").
export function NewMessageScreen() {
  const { colors, spacing, radius, type } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<InboxStackParamList>>();

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [search, setSearch] = useState("");

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

  return (
    <ScreenContainer avoidKeyboard style={{ paddingTop: 12 }}>
      <PressableScale onPress={() => navigation.navigate("NewGroup")} pressedScale={0.98}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingVertical: spacing.sm,
            marginBottom: spacing.xs,
          }}
        >
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: radius.pill,
              backgroundColor: colors.accentSoft,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="people" size={21} color={colors.accent} />
          </View>
          <Text style={[type.body, { color: colors.accent, marginLeft: spacing.sm, fontWeight: "600" }]}>
            Nouveau groupe
          </Text>
        </View>
      </PressableScale>

      <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginBottom: spacing.sm }} />

      <TextField
        label="Rechercher"
        placeholder="Nom d'un collègue"
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
          contentContainerStyle={{ paddingBottom: spacing.xxl }}
          renderItem={({ item, index }) => (
            <>
              <PressableScale
                // Ouvre directement la conversation plutôt que la fiche
                // contact : écrire est l'action attendue depuis cet écran.
                onPress={() => navigation.replace("ConversationThread", { userId: item.id })}
                pressedScale={0.985}
              >
                <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: spacing.sm }}>
                  <Avatar user={item} size={40} />
                  <View style={{ marginLeft: spacing.sm, flex: 1 }}>
                    <Text style={[type.body, { color: colors.ink }]} numberOfLines={1}>
                      {item.firstName} {item.lastName}
                    </Text>
                    <Text style={[type.footnote, { color: colors.inkTertiary }]} numberOfLines={1}>
                      {ROLE_LABELS[item.role]}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={17} color={colors.inkTertiary} />
                </View>
              </PressableScale>
              {index < filtered.length - 1 && (
                <View
                  style={{
                    height: StyleSheet.hairlineWidth,
                    backgroundColor: colors.border,
                    marginLeft: 40 + spacing.sm,
                  }}
                />
              )}
            </>
          )}
        />
      )}
    </ScreenContainer>
  );
}
