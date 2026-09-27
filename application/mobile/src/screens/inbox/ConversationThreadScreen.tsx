import React, { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useHeaderHeight } from "@react-navigation/elements";
import { ScreenContainer } from "../../components/ScreenContainer";
import { StateView } from "../../components/StateView";
import { PressableScale } from "../../components/PressableScale";
import { useTheme } from "../../theme/ThemeProvider";
import { useAuth } from "../../auth/AuthContext";
import { getContact, getThread, markThreadRead, sendMessage } from "../../api/messages.api";
import type { ChatMessage, Contact } from "../../api/messages.api";
import { extractErrorMessage } from "../../api/client";
import { Alert } from "../../utils/alert";
import type { InboxStackParamList } from "../../navigation/InboxStack";

type Route = RouteProp<{ ConversationThread: { userId: string } }, "ConversationThread">;

const timeFmt = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });

// Sondage léger pendant que le fil est à l'écran — pas d'infrastructure temps
// réel (websockets) dans ce projet, cohérent avec le reste de l'app
// (notifications, compteurs) qui fonctionne déjà par sondage.
const POLL_INTERVAL_MS = 5000;

export function ConversationThreadScreen() {
  const { colors, spacing, radius, type } = useTheme();
  const { user } = useAuth();
  const route = useRoute<Route>();
  const navigation = useNavigation<NativeStackNavigationProp<InboxStackParamList>>();
  const { userId } = route.params;
  const headerHeight = useHeaderHeight();

  const [contact, setContact] = useState<Contact | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList>(null);

  const load = useCallback(async () => {
    try {
      const [contactRes, threadRes] = await Promise.all([getContact(userId), getThread(userId)]);
      setContact(contactRes);
      setMessages(threadRes.items);
      setState("ready");
      void markThreadRead(userId);
    } catch {
      setState("error");
    }
  }, [userId]);

  const poll = useCallback(async () => {
    try {
      const threadRes = await getThread(userId);
      setMessages(threadRes.items);
      void markThreadRead(userId);
    } catch {
      // Sondage silencieux : une erreur ponctuelle ne doit pas perturber la lecture du fil.
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      void load();
      const interval = setInterval(poll, POLL_INTERVAL_MS);
      return () => clearInterval(interval);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userId])
  );

  useEffect(() => {
    navigation.setOptions({ title: contact ? `${contact.firstName} ${contact.lastName}` : "" });
  }, [navigation, contact]);

  async function handleSend() {
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    setDraft("");
    try {
      const sent = await sendMessage(userId, body);
      setMessages((prev) => [...prev, sent]);
    } catch (err) {
      setDraft(body);
      // Message précédemment ravalé en silence : le texte revenait dans le
      // champ sans aucune explication, donnant l'impression que l'envoi ne
      // faisait juste rien (bug remonté par un utilisateur).
      Alert.alert("Message non envoyé", extractErrorMessage(err, "Réessayez dans un instant."));
    } finally {
      setSending(false);
    }
  }

  if (state === "loading") {
    return (
      <ScreenContainer>
        <StateView kind="loading" />
      </ScreenContainer>
    );
  }
  if (state === "error" || !contact) {
    return (
      <ScreenContainer>
        <StateView kind="error" onRetry={load} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer avoidKeyboard keyboardVerticalOffset={headerHeight} style={{ paddingHorizontal: 0 }}>
      <Pressable
        onPress={() => navigation.navigate("ContactProfile", { userId })}
        style={{
          alignItems: "center",
          paddingTop: spacing.sm,
          paddingBottom: spacing.md,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
        }}
      >
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: radius.pill,
            backgroundColor: colors.purpleSoft,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={[type.callout, { color: colors.purple }]}>
            {contact.firstName[0]}
            {contact.lastName[0]}
          </Text>
        </View>
        <Text style={[type.footnote, { color: colors.accent, marginTop: spacing.xs }]}>Voir le profil</Text>
      </Pressable>

      {messages.length === 0 ? (
        <StateView kind="empty" icon="chatbubble-ellipses-outline" message="Aucun message pour le moment — dites bonjour !" />
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.md }}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          renderItem={({ item }) => {
            const isMine = item.senderId === user?.id;
            return (
              <View
                style={{
                  alignSelf: isMine ? "flex-end" : "flex-start",
                  maxWidth: "80%",
                  marginTop: spacing.xs,
                  backgroundColor: isMine ? colors.accent : colors.surface,
                  borderRadius: radius.lg,
                  borderBottomRightRadius: isMine ? 4 : radius.lg,
                  borderBottomLeftRadius: isMine ? radius.lg : 4,
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.sm,
                }}
              >
                <Text style={[type.body, { color: isMine ? colors.onAccent : colors.ink }]}>{item.body}</Text>
                <Text
                  style={[
                    type.caption,
                    { color: isMine ? colors.onAccent : colors.inkTertiary, opacity: 0.7, marginTop: 2, textAlign: "right" },
                  ]}
                >
                  {timeFmt.format(new Date(item.createdAt))}
                </Text>
              </View>
            );
          }}
        />
      )}

      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-end",
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.sm,
          paddingBottom: spacing.sm,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.border,
        }}
      >
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Votre message..."
          placeholderTextColor={colors.inkTertiary}
          multiline
          // Emoji : le clavier système (icône globe/emoji) fonctionne nativement
          // sur un TextInput standard — aucune restriction de type ici.
          style={[
            type.body,
            {
              flex: 1,
              minHeight: 40,
              maxHeight: 110,
              color: colors.ink,
              backgroundColor: colors.surface,
              borderRadius: 20,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: colors.border,
              paddingHorizontal: spacing.md,
              paddingVertical: 10,
              marginRight: spacing.sm,
            },
          ]}
        />
        <PressableScale onPress={handleSend} disabled={sending || !draft.trim()}>
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: radius.pill,
              backgroundColor: draft.trim() ? colors.accent : colors.surfaceAlt,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="arrow-up" size={20} color={draft.trim() ? colors.onAccent : colors.inkTertiary} />
          </View>
        </PressableScale>
      </View>
    </ScreenContainer>
  );
}
