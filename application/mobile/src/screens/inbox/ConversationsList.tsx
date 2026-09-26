import React, { useCallback, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Animated, { FadeInUp } from "react-native-reanimated";
import { StateView } from "../../components/StateView";
import { PressableScale } from "../../components/PressableScale";
import { PulsingDot } from "../../components/PulsingDot";
import { useTheme } from "../../theme/ThemeProvider";
import { listConversations } from "../../api/messages.api";
import type { Conversation } from "../../api/messages.api";
import { timeAgo } from "../../utils/timeAgo";
import type { InboxStackParamList } from "../../navigation/InboxStack";

export function ConversationsList() {
  const { colors, spacing, radius, type } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<InboxStackParamList>>();
  const [items, setItems] = useState<Conversation[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  const load = useCallback(async () => {
    try {
      setItems(await listConversations());
      setState("ready");
    } catch {
      setState("error");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  if (state === "loading") return <StateView kind="loading" />;
  if (state === "error") return <StateView kind="error" onRetry={load} />;
  if (items.length === 0) {
    return (
      <StateView
        kind="empty"
        icon="chatbubbles-outline"
        message="Aucune conversation. Touchez + pour écrire à un collègue."
      />
    );
  }

  return (
    <FlatList
      data={items}
      keyExtractor={(item) => item.user.id}
      contentContainerStyle={{ paddingBottom: spacing.xxl }}
      ItemSeparatorComponent={() => <View style={{ height: spacing.xs }} />}
      renderItem={({ item, index }) => (
        <Animated.View entering={FadeInUp.delay(Math.min(index, 6) * 40).duration(280)}>
          <PressableScale onPress={() => navigation.navigate("ConversationThread", { userId: item.user.id })}>
            <View
              style={[
                styles.row,
                {
                  borderRadius: radius.md,
                  backgroundColor: item.unreadCount > 0 ? colors.accentSoft : colors.background,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: colors.border,
                  padding: spacing.md,
                },
              ]}
            >
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: radius.pill,
                  backgroundColor: colors.purpleSoft,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={[type.callout, { color: colors.purple, fontWeight: "700" }]}>
                  {item.user.firstName[0]}
                  {item.user.lastName[0]}
                </Text>
              </View>
              <View style={{ flex: 1, marginLeft: spacing.sm }}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  {item.unreadCount > 0 && <PulsingDot color={colors.accent} style={{ marginRight: 5 }} />}
                  <Text style={[type.headline, { color: colors.ink, flex: 1 }]} numberOfLines={1}>
                    {item.user.firstName} {item.user.lastName}
                  </Text>
                </View>
                <Text style={[type.footnote, { color: colors.inkSecondary, marginTop: 1 }]} numberOfLines={1}>
                  {item.lastMessage.body}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={[type.caption, { color: colors.inkTertiary }]}>{timeAgo(item.lastMessage.createdAt)}</Text>
                {item.unreadCount > 0 && (
                  <View
                    style={{
                      marginTop: 4,
                      minWidth: 18,
                      height: 18,
                      borderRadius: 9,
                      paddingHorizontal: 5,
                      backgroundColor: colors.accent,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text style={{ color: colors.onAccent, fontSize: 11, fontWeight: "700" }}>{item.unreadCount}</Text>
                  </View>
                )}
              </View>
            </View>
          </PressableScale>
        </Animated.View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
});
