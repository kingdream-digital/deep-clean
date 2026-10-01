import React, { useCallback, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Animated, { FadeInUp } from "react-native-reanimated";
import { ScreenContainer } from "../../components/ScreenContainer";
import { StateView } from "../../components/StateView";
import { Card } from "../../components/Card";
import { PressableScale } from "../../components/PressableScale";
import { TextField } from "../../components/TextField";
import { ProspectStatusBadge } from "../../components/ProspectStatusBadge";
import { useTheme } from "../../theme/ThemeProvider";
import { useResponsive } from "../../hooks/useResponsive";
import { listProspects } from "../../api/prospects.api";
import type { Prospect } from "../../api/prospects.api";
import type { MenuStackParamList } from "../../navigation/MenuStack";
import { frenchDateFormat } from "../../utils/frenchDate";

const dateFmt = frenchDateFormat({ day: "numeric", month: "short" });

function contactName(p: Prospect): string | null {
  const name = [p.contactFirstName, p.contactLastName].filter(Boolean).join(" ");
  return name || null;
}

export function ProspectsListScreen() {
  const { colors, spacing, radius, type } = useTheme();
  const { isDesktopWeb } = useResponsive();
  const navigation = useNavigation<NativeStackNavigationProp<MenuStackParamList>>();

  const [search, setSearch] = useState("");
  const [items, setItems] = useState<Prospect[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  const load = useCallback(async (query: string) => {
    try {
      setState("loading");
      const res = await listProspects(query.trim() ? { search: query.trim() } : {});
      setItems(res.items);
      setState("ready");
    } catch {
      setState("error");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load(search);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load])
  );

  return (
    <ScreenContainer style={{ paddingTop: spacing.md }}>
      <View style={[isDesktopWeb && styles.desktopHeader, { marginBottom: spacing.md }]}>
        {isDesktopWeb && (
          <Text style={[type.title1, { color: colors.ink, marginBottom: spacing.md }]}>Prospects</Text>
        )}
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
        <StateView kind="empty" icon="person-add-outline" message="Aucun prospect pour le moment." />
      )}

      {state === "ready" && items.length > 0 && (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: spacing.xxxl }}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          renderItem={({ item, index }) => (
            <Animated.View entering={FadeInUp.delay(Math.min(index, 6) * 40).duration(280)}>
              <PressableScale onPress={() => navigation.navigate("ProspectDetail", { prospectId: item.id })}>
                <Card>
                  <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
                    <View style={{ flex: 1, marginRight: spacing.sm }}>
                      <Text style={[type.headline, { color: colors.ink }]} numberOfLines={1}>
                        {item.companyName}
                      </Text>
                      {contactName(item) && (
                        <Text style={[type.footnote, { color: colors.inkSecondary, marginTop: 2 }]} numberOfLines={1}>
                          {contactName(item)}
                          {item.jobTitle ? ` · ${item.jobTitle}` : ""}
                        </Text>
                      )}
                    </View>
                    <ProspectStatusBadge status={item.status} />
                  </View>

                  {item.nextFollowUpAt && (
                    <View style={{ flexDirection: "row", alignItems: "center", marginTop: spacing.sm }}>
                      <Ionicons name="alarm-outline" size={13} color={colors.inkTertiary} />
                      <Text style={[type.footnote, { color: colors.inkSecondary, marginLeft: 4 }]}>
                        Relance prévue le {dateFmt.format(new Date(item.nextFollowUpAt))}
                      </Text>
                    </View>
                  )}
                  {item.assignedUser && (
                    <View style={{ flexDirection: "row", alignItems: "center", marginTop: spacing.xxs }}>
                      <Ionicons name="person-outline" size={13} color={colors.inkTertiary} />
                      <Text style={[type.footnote, { color: colors.inkTertiary, marginLeft: 4 }]} numberOfLines={1}>
                        {item.assignedUser.firstName} {item.assignedUser.lastName}
                      </Text>
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
          onPress={() => navigation.navigate("ProspectForm", undefined)}
          accessibilityRole="button"
          accessibilityLabel="Nouveau prospect"
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
  desktopHeader: { maxWidth: 640 },
});
