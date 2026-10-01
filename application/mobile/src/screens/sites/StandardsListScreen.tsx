import React, { useCallback, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Animated, { FadeInUp } from "react-native-reanimated";
import { ScreenContainer } from "../../components/ScreenContainer";
import { StateView } from "../../components/StateView";
import { Card } from "../../components/Card";
import { PressableScale } from "../../components/PressableScale";
import { useTheme } from "../../theme/ThemeProvider";
import { useAuth } from "../../auth/AuthContext";
import { listStandards } from "../../api/standards.api";
import type { CleaningStandard } from "../../api/standards.api";
import type { HomeStackParamList } from "../../navigation/HomeStack";

type Route = RouteProp<{ StandardsList: { siteId: string; siteName?: string } }, "StandardsList">;

const MANAGE_ROLES = ["SUPERVISOR", "HR", "DIRECTOR", "ADMIN"];

// Bibliothèque de standards de nettoyage propres à un chantier/client —
// préparés à l'avance par le superviseur/la RH, puis appliqués en un clic à
// la création d'une mission sur ce chantier (voir MissionFormScreen).
export function StandardsListScreen() {
  const { colors, spacing, radius, type } = useTheme();
  const { user } = useAuth();
  const route = useRoute<Route>();
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const { siteId } = route.params;

  const [items, setItems] = useState<CleaningStandard[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  const canManage = user ? MANAGE_ROLES.includes(user.role) : false;

  const load = useCallback(async () => {
    try {
      setState("loading");
      setItems(await listStandards(siteId));
      setState("ready");
    } catch {
      setState("error");
    }
  }, [siteId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  return (
    <ScreenContainer style={{ paddingTop: 12 }}>
      {state === "loading" && <StateView kind="loading" />}
      {state === "error" && <StateView kind="error" onRetry={load} />}
      {state === "ready" && items.length === 0 && (
        <StateView
          kind="empty"
          icon="document-text-outline"
          message="Aucun standard pour ce chantier."
        />
      )}

      {state === "ready" && items.length > 0 && (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: spacing.xxxl }}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          renderItem={({ item, index }) => (
            <Animated.View entering={FadeInUp.delay(Math.min(index, 6) * 40).duration(280)}>
              <PressableScale
                onPress={() => navigation.navigate("StandardForm", { siteId, standardId: item.id })}
              >
                <Card style={{ flexDirection: "row", alignItems: "center" }}>
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: radius.md,
                      backgroundColor: colors.purpleSoft,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Ionicons name="document-text-outline" size={18} color={colors.purple} />
                  </View>
                  <View style={{ marginLeft: spacing.sm, flex: 1 }}>
                    <Text style={[type.headline, { color: colors.ink }]} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={[type.footnote, { color: colors.inkTertiary, marginTop: 2 }]} numberOfLines={1}>
                      {item.tasks.length} étape{item.tasks.length > 1 ? "s" : ""}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.inkTertiary} />
                </Card>
              </PressableScale>
            </Animated.View>
          )}
        />
      )}

      {canManage && (
        <Animated.View entering={FadeInUp.duration(280)} style={styles.fab}>
          <PressableScale
            pressedScale={0.9}
            onPress={() => navigation.navigate("StandardForm", { siteId })}
            accessibilityRole="button"
            accessibilityLabel="Nouveau standard"
            style={[styles.fabInner, { backgroundColor: colors.accentFill, borderRadius: radius.pill, shadowColor: colors.shadow }]}
          >
            <Ionicons name="add" size={26} color={colors.onAccent} />
          </PressableScale>
        </Animated.View>
      )}
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
