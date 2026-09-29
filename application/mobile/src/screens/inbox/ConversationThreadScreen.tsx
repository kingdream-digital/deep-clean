import React, { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, Image, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect, useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useHeaderHeight } from "@react-navigation/elements";
import { ScreenContainer } from "../../components/ScreenContainer";
import { StateView } from "../../components/StateView";
import { PressableScale } from "../../components/PressableScale";
import { AuthenticatedImage } from "../../components/AuthenticatedImage";
import { PhotoViewerModal } from "../../components/PhotoViewerModal";
import { useTheme } from "../../theme/ThemeProvider";
import { useAuth } from "../../auth/AuthContext";
import { getContact, getThread, markThreadRead, messagePhotoUrl, sendMessage } from "../../api/messages.api";
import type { ChatMessage, Contact } from "../../api/messages.api";
import type { LocalPhotoAsset } from "../../api/problems.api";
import { extractErrorMessage } from "../../api/client";
import { Alert } from "../../utils/alert";
import { pickWebImages } from "../../utils/webImagePicker";
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
  // Photo jointe (retour explicite du client) — sélection locale en attente
  // d'envoi, jamais téléversée tant que l'utilisateur n'a pas appuyé sur
  // envoyer (même principe que les autres écrans avec photo optionnelle).
  const [photo, setPhoto] = useState<LocalPhotoAsset | null>(null);
  const [viewerUri, setViewerUri] = useState<string | null>(null);
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
    navigation.setOptions({
      title: contact ? `${contact.firstName} ${contact.lastName}` : "",
      // Cet écran est parfois atteint via un saut inter-onglets (voir
      // ContactProfileScreen.tsx) plutôt que par une navigation normale dans
      // ce stack — selon le chemin emprunté, `goBack()` peut ne rien avoir à
      // dépiler (bug constaté : le bouton retour restait inerte une fois sur
      // la conversation). On garde toujours une sortie qui fonctionne :
      // retour normal si possible, sinon retour à la liste des messages.
      headerLeft: () => (
        <PressableScale
          onPress={() => {
            if (navigation.canGoBack()) navigation.goBack();
            else navigation.navigate("InboxHome");
          }}
          hitSlop={10}
          style={{ marginLeft: -4, padding: 4 }}
        >
          <Ionicons name="chevron-back" size={26} color={colors.accent} />
        </PressableScale>
      ),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation, contact]);

  async function handleSend() {
    const body = draft.trim();
    // Retour explicite du client : un message peut être une photo seule.
    if (!body && !photo) return;
    setSending(true);
    setDraft("");
    const sentPhoto = photo;
    setPhoto(null);
    try {
      const sent = await sendMessage(userId, body || undefined, sentPhoto ?? undefined);
      setMessages((prev) => [...prev, sent]);
    } catch (err) {
      setDraft(body);
      setPhoto(sentPhoto);
      // Message précédemment ravalé en silence : le texte revenait dans le
      // champ sans aucune explication, donnant l'impression que l'envoi ne
      // faisait juste rien (bug remonté par un utilisateur).
      Alert.alert("Message non envoyé", extractErrorMessage(err, "Réessayez dans un instant."));
    } finally {
      setSending(false);
    }
  }

  async function handleTakePhoto() {
    if (Platform.OS === "web") {
      const [file] = await pickWebImages({ multiple: false, capture: true });
      if (file) setPhoto(file);
      return;
    }
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Accès refusé", "Autorisez l'accès à l'appareil photo dans les réglages pour prendre une photo.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.8 });
    if (!result.canceled) setPhoto(result.assets[0]);
  }

  async function handlePickFromLibrary() {
    if (Platform.OS === "web") {
      const [file] = await pickWebImages({ multiple: false });
      if (file) setPhoto(file);
      return;
    }
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Accès refusé", "Autorisez l'accès aux photos dans les réglages pour en sélectionner.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });
    if (!result.canceled) setPhoto(result.assets[0]);
  }

  function handleAddPhoto() {
    Alert.alert("Joindre une photo", undefined, [
      { text: "Prendre une photo", onPress: handleTakePhoto },
      { text: "Choisir dans la galerie", onPress: handlePickFromLibrary },
      { text: "Annuler", style: "cancel" },
    ]);
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
                  padding: item.hasPhoto ? 4 : undefined,
                  paddingHorizontal: item.hasPhoto ? 4 : spacing.md,
                  paddingVertical: item.hasPhoto ? 4 : spacing.sm,
                }}
              >
                {item.hasPhoto && (
                  <PressableScale onPress={() => setViewerUri(messagePhotoUrl(item.id))}>
                    <AuthenticatedImage
                      uri={messagePhotoUrl(item.id)}
                      style={{ width: 220, height: 220, borderRadius: radius.md - 4, backgroundColor: colors.surfaceAlt }}
                    />
                  </PressableScale>
                )}
                {item.body && (
                  <Text
                    style={[
                      type.body,
                      { color: isMine ? colors.onAccent : colors.ink, margin: item.hasPhoto ? spacing.xs : 0 },
                    ]}
                  >
                    {item.body}
                  </Text>
                )}
                <Text
                  style={[
                    type.caption,
                    {
                      color: isMine ? colors.onAccent : colors.inkTertiary,
                      opacity: 0.7,
                      marginTop: 2,
                      marginHorizontal: item.hasPhoto ? spacing.xs : 0,
                      textAlign: "right",
                    },
                  ]}
                >
                  {timeFmt.format(new Date(item.createdAt))}
                </Text>
              </View>
            );
          }}
        />
      )}

      {photo && (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.sm,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: colors.border,
          }}
        >
          <Image source={{ uri: photo.uri }} style={{ width: 56, height: 56, borderRadius: radius.md, backgroundColor: colors.surfaceAlt }} />
          <PressableScale onPress={() => setPhoto(null)} style={{ marginLeft: spacing.sm }} hitSlop={10}>
            <Ionicons name="close-circle" size={22} color={colors.inkTertiary} />
          </PressableScale>
        </View>
      )}

      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-end",
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.sm,
          paddingBottom: spacing.sm,
          borderTopWidth: photo ? 0 : StyleSheet.hairlineWidth,
          borderTopColor: colors.border,
        }}
      >
        <PressableScale onPress={handleAddPhoto} style={{ marginRight: spacing.sm, marginBottom: 8 }} hitSlop={8}>
          <Ionicons name="camera-outline" size={26} color={colors.accent} />
        </PressableScale>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Votre message..."
          placeholderTextColor={colors.inkTertiary}
          multiline
          // Retour explicite du client : sur le web, la touche Entrée doit
          // envoyer le message (Maj+Entrée pour un retour à la ligne), comme
          // sur un vrai site de messagerie — jamais sur mobile natif, où le
          // clavier tactile n'a pas cette convention et où la touche retour
          // doit rester un simple saut de ligne. `react-native-web` ne route
          // "Entrée" vers `onSubmitEditing` que si `blurOnSubmit` est vrai, ce
          // qui perdrait aussi le focus du champ à chaque envoi : on
          // intercepte donc directement `onKeyPress` (web uniquement) pour
          // envoyer sans jamais faire perdre le focus.
          onKeyPress={
            Platform.OS === "web"
              ? (e) => {
                  const webEvent = e as unknown as { key: string; shiftKey?: boolean; preventDefault: () => void };
                  if (webEvent.key === "Enter" && !webEvent.shiftKey) {
                    webEvent.preventDefault();
                    void handleSend();
                  }
                }
              : undefined
          }
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
        <PressableScale onPress={handleSend} disabled={sending || (!draft.trim() && !photo)}>
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: radius.pill,
              backgroundColor: draft.trim() || photo ? colors.accent : colors.surfaceAlt,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="arrow-up" size={20} color={draft.trim() || photo ? colors.onAccent : colors.inkTertiary} />
          </View>
        </PressableScale>
      </View>

      <PhotoViewerModal visible={!!viewerUri} uri={viewerUri ?? ""} onClose={() => setViewerUri(null)} />
    </ScreenContainer>
  );
}
