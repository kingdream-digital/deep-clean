import React, { useCallback, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Animated, { FadeInUp } from "react-native-reanimated";
import { ScreenContainer } from "../../components/ScreenContainer";
import { StateView } from "../../components/StateView";
import { Card } from "../../components/Card";
import { PressableScale } from "../../components/PressableScale";
import { TextField } from "../../components/TextField";
import { useTheme } from "../../theme/ThemeProvider";
import { useResponsive } from "../../hooks/useResponsive";
import { listClients } from "../../api/clients.api";
import type { Client } from "../../api/clients.api";
import type { MenuStackParamList } from "../../navigation/MenuStack";
import { useLiveFocusEffect, isBackgroundRefresh } from "../../sync/liveSync";

function contactName(c: Client): string | null {
  const name = [c.contactFirstName, c.contactLastName].filter(Boolean).join(" ");
  return name || null;
}

export function ClientsListScreen() {
  const { colors, spacing, radius, type } = useTheme();
  const { isDesktopWeb } = useResponsive();
  const navigation = useNavigation<NativeStackNavigationProp<MenuStackParamList>>();

  const [search, setSearch] = useState("");
  const [items, setItems] = useState<Client[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  const load = useCallback(async (query: string) => {
    const silent = isBackgroundRefresh();
    try {
      if (!silent) setState("loading");
      const res = await listClients(query.trim() ? { search: query.trim() } : {});
      setItems(res.items);
      setState("ready");
    } catch {
      if (!silent) setState("error");
    }
  }, []);

  useLiveFocusEffect(
    useCallback(() => {
      void load(search);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load])
  );

  return (
    <ScreenContainer style={{ paddingTop: spacing.md }}>
      <View style={{ marginBottom: spacing.md }}>
        {!!isDesktopWeb && <Text style={[type.title1, { color: colors.ink, marginBottom: spacing.md }]}>Clients</Text>}
        <TextField
          label="Recherche"
          placeholder="Entreprise, contact, email"
          value={search}
          onChangeText={setSearch}
          onSubmitEditing={() => load(search)}
        />
      </View>

      {state === "loading" && <StateView kind="loading" />}
      {state === "error" && <StateView kind="error" onRetry={() => load(search)} />}
      {state === "ready" && items.length === 0 && (
        <StateView kind="empty" icon="briefcase-outline" message="Aucun client pour le moment." />
      )}

      {state === "ready" && items.length > 0 && (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: spacing.xxxl }}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          renderItem={({ item, index }) => (
            <Animated.View entering={FadeInUp.delay(Math.min(index, 6) * 40).duration(280)}>
              <PressableScale onPress={() => navigation.navigate("ClientDetail", { clientId: item.id })}>
                <Card>
                  <Text style={[type.headline, { color: colors.ink }]} numberOfLines={1}>
                    {item.companyName}
                  </Text>
                  {contactName(item) && (
                    <Text style={[type.footnote, { color: colors.inkSecondary, marginTop: 2 }]} numberOfLines={1}>
                      {contactName(item)}
                    </Text>
                  )}
                  {!!item.city && (
                    <View style={{ flexDirection: "row", alignItems: "center", marginTop: spacing.xs }}>
                      <Ionicons name="location-outline" size={13} color={colors.inkTertiary} />
                      <Text style={[type.footnote, { color: colors.inkTertiary, marginLeft: 4 }]}>{item.city}</Text>
                    </View>
                  )}
                </Card>
              </PressableScale>
            </Animated.View>
          )}
        />
      )}

      <Animated.View entering={FadeInUp.duration(280)} style={styles.fab}>
        <PressableScale
          pressedScale={0.9}
          onPress={() => navigation.navigate("ClientForm", undefined)}
          accessibilityRole="button"
          accessibilityLabel="Nouveau client"
          style={[styles.fabInner, { backgroundColor: colors.accentFill, borderRadius: radius.pill, shadowColor: colors.shadow }]}
        >
          <Ionicons name="add" size={26} color={colors.onAccent} />
        </PressableScale>
      </Animated.View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  fab: { position: "absolute", right: 20, bottom: 24 },
  fabInner: {
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
});
