import React, { useCallback, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Animated, { FadeInUp } from "react-native-reanimated";
import { StateView } from "../../components/StateView";
import { PressableScale } from "../../components/PressableScale";
import { Avatar, GroupAvatar } from "../../components/Avatar";
import { useTheme } from "../../theme/ThemeProvider";
import { useResponsive } from "../../hooks/useResponsive";
import { useAuth } from "../../auth/AuthContext";
import { listConversations } from "../../api/messages.api";
import type { ConversationSummary } from "../../api/messages.api";
import { timeAgo } from "../../utils/timeAgo";
import type { InboxStackParamList } from "../../navigation/InboxStack";
import { useLiveFocusEffect } from "../../sync/liveSync";

/**
 * Aperçu d'un fil : ce qu'on lit sous le nom dans la liste. Dans un groupe,
 * le nom de qui parle est indispensable (sans lui, impossible de savoir qui
 * a écrit) ; dans un fil à deux, il serait redondant avec le titre.
 */
function previewOf(conversation: ConversationSummary, myId?: string): string {
  const last = conversation.lastMessage;
  if (!last) return "Aucun message pour le moment";

  const content = last.body ?? (last.document ? `📄 ${last.document.name}` : "📷 Photo");
  if (last.systemEvent) return content;

  const mine = last.senderId === myId;
  if (mine) return `Vous : ${content}`;
  return conversation.isGroup ? `${last.sender.firstName} : ${content}` : content;
}

export function ConversationsList() {
  const { colors, spacing, radius, type } = useTheme();
  const { hasSidebar } = useResponsive();
  const { user } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<InboxStackParamList>>();
  const [items, setItems] = useState<ConversationSummary[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  const load = useCallback(async () => {
    try {
      setItems(await listConversations());
      setState("ready");
    } catch {
      setState("error");
    }
  }, []);

  useLiveFocusEffect(
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
        message="Aucune conversation. Touchez l'icône en haut à droite pour écrire à un collègue ou créer un groupe."
      />
    );
  }

  return (
    <FlatList
      data={items}
      keyExtractor={(item) => item.id}
      contentContainerStyle={[
        { paddingBottom: spacing.xxl },
        // Même colonne de lecture que le fil : sur un écran large, une ligne
        // de conversation étirée sur 1 500 px pour un aperçu de cinq mots est
        // illisible.
        hasSidebar ? { width: "100%", maxWidth: 860, alignSelf: "center" } : null,
      ]}
      renderItem={({ item, index }) => {
        const unread = item.unreadCount > 0;
        const others = item.participants.filter((p) => p.id !== user?.id);
        return (
          <Animated.View entering={FadeInUp.delay(Math.min(index, 6) * 40).duration(280)}>
            <PressableScale
              onPress={() => navigation.navigate("ConversationThread", { conversationId: item.id })}
              pressedScale={0.985}
            >
              <View style={[styles.row, { paddingVertical: spacing.sm, paddingHorizontal: spacing.xs }]}>
                {item.isGroup ? <GroupAvatar participants={others} size={48} /> : <Avatar user={item.otherUser ?? others[0]!} size={48} />}

                <View style={{ flex: 1, marginLeft: spacing.sm }}>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Text
                      style={[
                        unread ? type.bodyMedium : type.body,
                        { color: colors.ink, flex: 1, fontWeight: unread ? "600" : "400" },
                      ]}
                      numberOfLines={1}
                    >
                      {item.title}
                    </Text>
                    <Text style={[type.footnote, { color: colors.inkTertiary, marginLeft: spacing.xs }]}>
                      {item.lastMessage ? timeAgo(item.lastMessage.createdAt) : ""}
                    </Text>
                  </View>

                  <View style={{ flexDirection: "row", alignItems: "center", marginTop: 2 }}>
                    {!!item.isGroup && (
                      <Ionicons
                        name="people"
                        size={13}
                        color={colors.inkTertiary}
                        style={{ marginRight: 4, marginTop: 1 }}
                      />
                    )}
                    <Text
                      style={[
                        type.subhead,
                        { color: unread ? colors.inkSecondary : colors.inkTertiary, flex: 1 },
                      ]}
                      numberOfLines={1}
                    >
                      {previewOf(item, user?.id)}
                    </Text>
                    {/* Pastille de non-lus façon iOS : un simple compteur à
                        droite, jamais un fond coloré sur toute la ligne — sur
                        une messagerie d'équipe, toutes les lignes étant
                        souvent non lues, le fond teinté noyait la liste
                        entière dans une seule masse de couleur. */}
                    {!!unread && (
                      <View
                        style={{
                          marginLeft: spacing.xs,
                          minWidth: 20,
                          height: 20,
                          borderRadius: radius.pill,
                          paddingHorizontal: 6,
                          backgroundColor: colors.accentFill,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Text style={{ color: colors.onAccent, fontSize: 11, fontWeight: "700" }}>
                          {item.unreadCount > 99 ? "99+" : item.unreadCount}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              </View>
            </PressableScale>
            {index < items.length - 1 && (
              // Filet aligné sur le texte, pas sur le bord de l'écran : le
              // trait part après l'avatar, comme dans une liste iOS.
              <View
                style={{
                  height: StyleSheet.hairlineWidth,
                  backgroundColor: colors.border,
                  marginLeft: 48 + spacing.sm + spacing.xs,
                }}
              />
            )}
          </Animated.View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
});
