import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { StateView } from "../../components/StateView";
import { TextField } from "../../components/TextField";
import { Card } from "../../components/Card";
import { PressableScale } from "../../components/PressableScale";
import { useTheme } from "../../theme/ThemeProvider";
import { listContacts } from "../../api/messages.api";
import type { Contact } from "../../api/messages.api";
import type { InboxStackParamList } from "../../navigation/InboxStack";

// Annuaire complet de l'entreprise (tout compte actif) pour démarrer une
// nouvelle conversation — on ouvre d'abord la fiche contact (nom, téléphone),
// conformément à la demande : "cliquer sur les profils de tout le monde".
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
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          renderItem={({ item }) => (
            <PressableScale onPress={() => navigation.navigate("ContactProfile", { userId: item.id })}>
              <Card style={{ flexDirection: "row", alignItems: "center" }}>
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: radius.pill,
                    backgroundColor: colors.purpleSoft,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={[type.caption, { color: colors.purple, fontWeight: "700" }]}>
                    {item.firstName[0]}
                    {item.lastName[0]}
                  </Text>
                </View>
                <Text style={[type.body, { color: colors.ink, marginLeft: spacing.sm, flex: 1 }]}>
                  {item.firstName} {item.lastName}
                </Text>
              </Card>
            </PressableScale>
          )}
        />
      )}
    </ScreenContainer>
  );
}
