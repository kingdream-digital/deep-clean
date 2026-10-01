import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Image, Linking, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { useFocusEffect, useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useHeaderHeight } from "@react-navigation/elements";
import { ScreenContainer } from "../../components/ScreenContainer";
import { StateView } from "../../components/StateView";
import { PressableScale } from "../../components/PressableScale";
import { AuthenticatedImage } from "../../components/AuthenticatedImage";
import { PhotoViewerModal } from "../../components/PhotoViewerModal";
import { Avatar, GroupAvatar } from "../../components/Avatar";
import { useTheme } from "../../theme/ThemeProvider";
import { useResponsive } from "../../hooks/useResponsive";
import { useAuth } from "../../auth/AuthContext";
import {
  downloadMessageDocument,
  getConversation,
  getThread,
  markThreadRead,
  messagePhotoUrl,
  openDirectConversation,
  sendMessage,
} from "../../api/messages.api";
import type { ChatMessage, Conversation, LocalDocumentAsset, Participant } from "../../api/messages.api";
import type { LocalPhotoAsset } from "../../api/problems.api";
import { extractErrorMessage } from "../../api/client";
import { Alert } from "../../utils/alert";
import { pickWebImages, pickWebFile } from "../../utils/webImagePicker";
import { shareFile } from "../../utils/shareFile";
import { formatFileSize } from "../../utils/fileSize";
import { ROLE_LABELS_SHORT } from "../../utils/roleLabels";
import type { InboxStackParamList } from "../../navigation/InboxStack";

// L'écran s'ouvre soit sur un fil déjà connu (liste, notification), soit sur
// une personne (fiche contact, équipe d'une mission) — dans ce second cas le
// fil à deux est récupéré ou créé à l'ouverture.
type Route = RouteProp<
  { ConversationThread: { conversationId?: string; userId?: string } },
  "ConversationThread"
>;

const timeFmt = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });
const dayFmt = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" });

// Sondage léger pendant que le fil est à l'écran — pas d'infrastructure temps
// réel (websockets) dans ce projet, cohérent avec le reste de l'app
// (notifications, compteurs) qui fonctionne déjà par sondage.
const POLL_INTERVAL_MS = 5000;

/** Séparateur de jour, comme dans une messagerie grand public. */
function dayLabel(iso: string): string {
  const date = new Date(iso);
  const startOfDay = (d: Date) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x.getTime();
  };
  const today = startOfDay(new Date());
  const day = startOfDay(date);
  const dayMs = 86_400_000;
  if (day === today) return "Aujourd'hui";
  if (day === today - dayMs) return "Hier";
  return dayFmt.format(date);
}

interface Row {
  message: ChatMessage;
  /** Premier message d'un bloc du même auteur : porte l'avatar et le nom. */
  startsBlock: boolean;
  /** Dernier du bloc : porte l'heure et le coin de bulle marqué. */
  endsBlock: boolean;
  daySeparator: string | null;
}

/**
 * Regroupe les messages consécutifs d'une même personne en blocs (et insère
 * les séparateurs de jour) : c'est ce qui distingue une vraie messagerie d'une
 * simple liste de bulles — un avatar et un nom répétés à chaque ligne
 * alourdissent inutilement la lecture d'un échange rapide.
 */
function buildRows(messages: ChatMessage[]): Row[] {
  const BLOCK_GAP_MS = 5 * 60 * 1000;
  return messages.map((message, index) => {
    const previous = messages[index - 1];
    const next = messages[index + 1];
    const sameAuthorAs = (other?: ChatMessage) =>
      !!other &&
      !other.systemEvent &&
      !message.systemEvent &&
      other.senderId === message.senderId &&
      Math.abs(new Date(message.createdAt).getTime() - new Date(other.createdAt).getTime()) < BLOCK_GAP_MS;

    const previousDay = previous ? dayLabel(previous.createdAt) : null;
    const currentDay = dayLabel(message.createdAt);

    return {
      message,
      startsBlock: !sameAuthorAs(previous) || previousDay !== currentDay,
      endsBlock: !sameAuthorAs(next),
      daySeparator: previousDay === currentDay ? null : currentDay,
    };
  });
}

export function ConversationThreadScreen() {
  const { colors, spacing, radius, type } = useTheme();
  const { hasSidebar } = useResponsive();
  const { user } = useAuth();
  const route = useRoute<Route>();
  const navigation = useNavigation<NativeStackNavigationProp<InboxStackParamList>>();
  const headerHeight = useHeaderHeight();

  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  // Pièce jointe en attente d'envoi — jamais téléversée tant que l'utilisateur
  // n'a pas appuyé sur envoyer (même principe que les autres écrans de l'app).
  const [photo, setPhoto] = useState<LocalPhotoAsset | null>(null);
  const [document, setDocument] = useState<LocalDocumentAsset | null>(null);
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const listRef = useRef<FlatList>(null);

  const conversationId = conversation?.id;

  const load = useCallback(async () => {
    try {
      const resolved = route.params.conversationId
        ? await getConversation(route.params.conversationId)
        : await openDirectConversation(route.params.userId as string);
      const threadRes = await getThread(resolved.id);
      setConversation(resolved);
      setMessages(threadRes.items);
      setState("ready");
      void markThreadRead(resolved.id);
    } catch {
      setState("error");
    }
  }, [route.params.conversationId, route.params.userId]);

  const poll = useCallback(async () => {
    if (!conversationId) return;
    try {
      const threadRes = await getThread(conversationId);
      setMessages(threadRes.items);
      void markThreadRead(conversationId);
    } catch {
      // Sondage silencieux : une erreur ponctuelle ne doit pas perturber la lecture du fil.
    }
  }, [conversationId]);

  useFocusEffect(
    useCallback(() => {
      void load();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [route.params.conversationId, route.params.userId])
  );

  useEffect(() => {
    if (!conversationId) return undefined;
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [conversationId, poll]);

  const callableParticipants = useMemo(
    () => (conversation?.participants ?? []).filter((p) => p.id !== user?.id && !p.hasLeft && p.phone),
    [conversation, user?.id]
  );

  const openInfo = useCallback(() => {
    if (conversationId) navigation.navigate("ConversationInfo", { conversationId });
  }, [navigation, conversationId]);

  /**
   * Appel téléphonique depuis la conversation (retour explicite du client :
   * "une fonction téléphone, icône en haut à droite"). À deux, on appelle
   * directement l'interlocuteur ; dans un groupe, on choisit d'abord qui
   * appeler — un groupe n'a pas de numéro.
   */
  const handleCall = useCallback(() => {
    if (!conversation) return;

    async function dial(person: Participant) {
      const url = `tel:${person.phone}`;
      const supported = await Linking.canOpenURL(url).catch(() => false);
      if (!supported) {
        // Cas réel sur un navigateur de bureau : aucune application
        // téléphone n'est associée. On affiche alors le numéro, qui reste
        // utile, au lieu de ne rien faire du tout.
        Alert.alert(`${person.firstName} ${person.lastName}`, `Téléphone : ${person.phone}`);
        return;
      }
      await Linking.openURL(url);
    }

    if (!conversation.isGroup) {
      const other = conversation.otherUser;
      if (!other?.phone) {
        Alert.alert(
          "Aucun numéro enregistré",
          `${other?.firstName ?? "Cette personne"} n'a pas de numéro de téléphone dans son profil. La RH peut l'ajouter.`
        );
        return;
      }
      void dial(other);
      return;
    }

    if (callableParticipants.length === 0) {
      Alert.alert("Aucun numéro enregistré", "Personne dans ce groupe n'a de numéro de téléphone renseigné.");
      return;
    }
    Alert.alert("Appeler", "Qui souhaitez-vous appeler ?", [
      ...callableParticipants.map((p) => ({
        text: `${p.firstName} ${p.lastName}`,
        onPress: () => void dial(p),
      })),
      { text: "Annuler", style: "cancel" as const },
    ]);
  }, [conversation, callableParticipants]);

  useEffect(() => {
    if (!conversation) return;
    navigation.setOptions({
      headerTitle: () => (
        <Pressable onPress={openInfo} style={{ flexDirection: "row", alignItems: "center" }} hitSlop={6}>
          {conversation.isGroup ? (
            <GroupAvatar participants={conversation.participants.filter((p) => p.id !== user?.id)} size={32} />
          ) : (
            <Avatar user={conversation.otherUser ?? conversation.participants[0]!} size={32} />
          )}
          <View style={{ marginLeft: spacing.xs }}>
            <Text style={[type.headline, { color: colors.ink }]} numberOfLines={1}>
              {conversation.title}
            </Text>
            <Text style={[type.caption, { color: colors.inkTertiary }]} numberOfLines={1}>
              {conversation.isGroup
                ? `${conversation.participants.filter((p) => !p.hasLeft).length} participants`
                : ROLE_LABELS_SHORT[(conversation.otherUser ?? conversation.participants[0]!).role]}
            </Text>
          </View>
        </Pressable>
      ),
      // Cet écran est parfois atteint via un saut inter-onglets (voir
      // ContactProfileScreen.tsx) plutôt que par une navigation normale dans
      // ce stack — selon le chemin emprunté, `goBack()` peut ne rien avoir à
      // dépiler. On garde toujours une sortie qui fonctionne.
      headerLeft: () => (
        <PressableScale
          onPress={() => {
            if (navigation.canGoBack()) navigation.goBack();
            else navigation.navigate("InboxHome");
          }}
          hitSlop={10}
          style={{ marginLeft: -4, padding: 4 }}
        >
          <Ionicons name="chevron-back" size={28} color={colors.accent} />
        </PressableScale>
      ),
      // Retour explicite du client : l'icône téléphone en haut à droite.
      headerRight: () => (
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <PressableScale onPress={handleCall} hitSlop={10} style={{ padding: 6 }} pressedScale={0.9}>
            <Ionicons name="call" size={21} color={colors.accent} />
          </PressableScale>
          <PressableScale onPress={openInfo} hitSlop={10} style={{ padding: 6, marginLeft: 2 }} pressedScale={0.9}>
            <Ionicons name="information-circle-outline" size={23} color={colors.accent} />
          </PressableScale>
        </View>
      ),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation, conversation, handleCall, openInfo]);

  async function handleSend() {
    const body = draft.trim();
    if ((!body && !photo && !document) || !conversationId) return;
    setSending(true);
    setDraft("");
    const sentPhoto = photo;
    const sentDocument = document;
    setPhoto(null);
    setDocument(null);
    try {
      const sent = await sendMessage(conversationId, body || undefined, {
        photo: sentPhoto ?? undefined,
        document: sentDocument ?? undefined,
      });
      setMessages((prev) => [...prev, sent]);
    } catch (err) {
      setDraft(body);
      setPhoto(sentPhoto);
      setDocument(sentDocument);
      Alert.alert("Message non envoyé", extractErrorMessage(err, "Réessayez dans un instant."));
    } finally {
      setSending(false);
    }
  }

  async function handleTakePhoto() {
    if (Platform.OS === "web") {
      const [file] = await pickWebImages({ multiple: false, capture: true });
      if (file) {
        setDocument(null);
        setPhoto(file);
      }
      return;
    }
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Accès refusé", "Autorisez l'accès à l'appareil photo dans les réglages pour prendre une photo.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.8 });
    if (!result.canceled) {
      setDocument(null);
      setPhoto(result.assets[0]);
    }
  }

  async function handlePickFromLibrary() {
    if (Platform.OS === "web") {
      const [file] = await pickWebImages({ multiple: false });
      if (file) {
        setDocument(null);
        setPhoto(file);
      }
      return;
    }
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Accès refusé", "Autorisez l'accès aux photos dans les réglages pour en sélectionner.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });
    if (!result.canceled) {
      setDocument(null);
      setPhoto(result.assets[0]);
    }
  }

  // Partage de document (retour explicite du client). PDF uniquement : c'est
  // le seul format dont le serveur peut vérifier le contenu réel plutôt que le
  // type déclaré par le client (voir backend utils/storage.ts).
  async function handlePickDocument() {
    if (Platform.OS === "web") {
      const picked = await pickWebFile({ accept: "application/pdf" });
      if (!picked) return;
      setPhoto(null);
      setDocument({ uri: picked.uri, fileName: picked.fileName ?? "document.pdf", file: picked.file });
      return;
    }
    const result = await DocumentPicker.getDocumentAsync({ type: "application/pdf", copyToCacheDirectory: true });
    if (result.canceled || !result.assets?.[0]) return;
    setPhoto(null);
    setDocument({ uri: result.assets[0].uri, fileName: result.assets[0].name });
  }

  function handleAttach() {
    Alert.alert("Joindre", undefined, [
      { text: "Prendre une photo", onPress: handleTakePhoto },
      { text: "Choisir une photo", onPress: handlePickFromLibrary },
      { text: "Document PDF", onPress: handlePickDocument },
      { text: "Annuler", style: "cancel" },
    ]);
  }

  async function handleOpenDocument(message: ChatMessage) {
    if (!message.document) return;
    setDownloadingId(message.id);
    try {
      const bytes = await downloadMessageDocument(message.id);
      await shareFile(message.document.name, bytes, { mimeType: "application/pdf", uti: "com.adobe.pdf" });
    } catch (err) {
      Alert.alert("Ouverture impossible", extractErrorMessage(err));
    } finally {
      setDownloadingId(null);
    }
  }

  const rows = useMemo(() => buildRows(messages), [messages]);

  // Sur un grand écran, une conversation étalée d'un bord à l'autre oblige
  // l'œil à balayer toute la largeur : les bulles restent dans une colonne de
  // lecture centrée, comme la barre de saisie qui doit rester alignée dessus.
  const readable = hasSidebar
    ? ({ width: "100%", maxWidth: 860, alignSelf: "center" } as const)
    : undefined;

  if (state === "loading") {
    return (
      <ScreenContainer>
        <StateView kind="loading" />
      </ScreenContainer>
    );
  }
  if (state === "error" || !conversation) {
    return (
      <ScreenContainer>
        <StateView kind="error" onRetry={load} />
      </ScreenContainer>
    );
  }

  const attachment = photo ?? document;

  return (
    <ScreenContainer avoidKeyboard keyboardVerticalOffset={headerHeight} style={{ paddingHorizontal: 0 }}>
      {messages.length === 0 ? (
        <StateView
          kind="empty"
          icon="chatbubble-ellipses-outline"
          message={
            conversation.isGroup
              ? "Ce groupe vient d'être créé — écrivez le premier message."
              : "Aucun message pour le moment — dites bonjour !"
          }
        />
      ) : (
        <FlatList
          ref={listRef}
          data={rows}
          keyExtractor={(row) => row.message.id}
          style={{ flex: 1 }}
          contentContainerStyle={[
            { paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.md },
            readable,
          ]}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          renderItem={({ item: row }) => {
            const { message, startsBlock, endsBlock, daySeparator } = row;
            const isMine = message.senderId === user?.id;

            // Événement de groupe : ligne centrée discrète, jamais une bulle.
            if (message.systemEvent) {
              return (
                <View>
                  {daySeparator && <DaySeparator label={daySeparator} />}
                  <Text
                    style={[
                      type.caption,
                      { color: colors.inkTertiary, textAlign: "center", marginVertical: spacing.xs },
                    ]}
                  >
                    {message.body}
                  </Text>
                </View>
              );
            }

            // Largeur réservée à l'avatar dans un groupe (0 dans un fil à
            // deux, où il n'y a pas d'avatar devant les bulles).
            const avatarGutter = !isMine && conversation.isGroup ? 34 : 0;
            const bubbleColor = isMine ? colors.accentFill : colors.surface;
            const textColor = isMine ? colors.onAccent : colors.ink;
            const hasAttachment = message.hasPhoto || !!message.document;

            return (
              <View>
                {daySeparator && <DaySeparator label={daySeparator} />}
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: isMine ? "flex-end" : "flex-start",
                    marginTop: startsBlock ? spacing.sm : 2,
                  }}
                >
                  <View style={{ maxWidth: "80%" }}>
                    {!isMine && conversation.isGroup && startsBlock && (
                      <Text
                        style={[
                          type.caption,
                          { color: colors.inkSecondary, marginBottom: 3, marginLeft: avatarGutter + 10 },
                        ]}
                      >
                        {message.sender.firstName} {message.sender.lastName}
                      </Text>
                    )}

                    <View style={{ flexDirection: "row", alignItems: "flex-end", flexShrink: 1 }}>
                      {/* Avatar aligné sur le bas de la DERNIÈRE bulle du bloc
                          (jamais sur l'heure, qui viendrait le décaler) ;
                          l'espace reste réservé pour les autres lignes du
                          bloc, qui restent ainsi alignées entre elles. */}
                      {!isMine && conversation.isGroup && (
                        <View style={{ width: 28, marginRight: 6 }}>
                          {endsBlock && <Avatar user={message.sender} size={28} />}
                        </View>
                      )}

                      <View
                      style={{
                        // `flexShrink` indispensable : dans une ligne flex, un
                        // enfant ne se contraint pas tout seul à la largeur
                        // disponible — sans lui, une bulle un peu longue
                        // dépassait du bord de l'écran au lieu de passer à la
                        // ligne (constaté sur un message d'une ligne et demie).
                        flexShrink: 1,
                        backgroundColor: bubbleColor,
                        borderRadius: radius.lg,
                        // Coin marqué du côté de l'auteur, et seulement sur le
                        // dernier message du bloc : la "queue" de bulle façon
                        // messagerie, pas un coin coupé à chaque ligne.
                        borderBottomRightRadius: isMine && endsBlock ? 5 : radius.lg,
                        borderBottomLeftRadius: !isMine && endsBlock ? 5 : radius.lg,
                        padding: hasAttachment ? 4 : undefined,
                        paddingHorizontal: hasAttachment ? 4 : spacing.sm + 2,
                        paddingVertical: hasAttachment ? 4 : 8,
                        borderWidth: isMine ? 0 : StyleSheet.hairlineWidth,
                        borderColor: colors.border,
                      }}
                    >
                      {message.hasPhoto && (
                        <PressableScale onPress={() => setViewerUri(messagePhotoUrl(message.id))}>
                          <AuthenticatedImage
                            uri={messagePhotoUrl(message.id)}
                            style={{
                              width: 230,
                              height: 230,
                              borderRadius: radius.md,
                              backgroundColor: colors.surfaceAlt,
                            }}
                          />
                        </PressableScale>
                      )}

                      {message.document && (
                        <PressableScale onPress={() => handleOpenDocument(message)} pressedScale={0.97}>
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              width: 244,
                              padding: spacing.xs,
                            }}
                          >
                            <View
                              style={{
                                width: 38,
                                height: 38,
                                borderRadius: radius.sm,
                                backgroundColor: isMine ? "rgba(255,255,255,0.18)" : colors.dangerSoft,
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              <Ionicons
                                name={downloadingId === message.id ? "hourglass-outline" : "document-text"}
                                size={19}
                                color={isMine ? colors.onAccent : colors.danger}
                              />
                            </View>
                            <View style={{ flex: 1, marginLeft: spacing.xs }}>
                              <Text style={[type.footnote, { color: textColor, fontWeight: "600" }]} numberOfLines={2}>
                                {message.document.name}
                              </Text>
                              <Text
                                style={[
                                  type.caption,
                                  { color: textColor, opacity: 0.7, marginTop: 1 },
                                ]}
                              >
                                PDF · {formatFileSize(message.document.sizeBytes)}
                              </Text>
                            </View>
                            <Ionicons
                              name="download-outline"
                              size={17}
                              color={textColor}
                              style={{ opacity: 0.8, marginLeft: 2 }}
                            />
                          </View>
                        </PressableScale>
                      )}

                      {message.body && (
                        <Text
                          style={[
                            type.callout,
                            { color: textColor, marginHorizontal: hasAttachment ? spacing.xs : 0, marginTop: hasAttachment ? 2 : 0, marginBottom: hasAttachment ? 4 : 0 },
                          ]}
                        >
                          {message.body}
                        </Text>
                      )}
                    </View>

                    {/* Heure une seule fois par bloc, sous la dernière bulle —
                        répétée à chaque ligne, elle double le bruit visuel. */}
                    </View>

                    {endsBlock && (
                      <Text
                        style={[
                          type.caption,
                          {
                            color: colors.inkTertiary,
                            fontSize: 11,
                            marginTop: 3,
                            marginRight: isMine ? 6 : 0,
                            marginLeft: isMine ? 0 : avatarGutter + 6,
                            textAlign: isMine ? "right" : "left",
                          },
                        ]}
                      >
                        {timeFmt.format(new Date(message.createdAt))}
                      </Text>
                    )}
                  </View>
                </View>
              </View>
            );
          }}
        />
      )}

      {attachment && (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: spacing.md,
            paddingTop: spacing.xs,
            paddingBottom: 2,
          }}
        >
          {photo ? (
            <Image
              source={{ uri: photo.uri }}
              style={{ width: 52, height: 52, borderRadius: radius.md, backgroundColor: colors.surfaceAlt }}
            />
          ) : (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: colors.surface,
                borderRadius: radius.md,
                paddingHorizontal: spacing.xs,
                paddingVertical: 8,
                flex: 1,
              }}
            >
              <Ionicons name="document-text" size={18} color={colors.danger} />
              <Text style={[type.footnote, { color: colors.ink, marginLeft: 6, flex: 1 }]} numberOfLines={1}>
                {document?.fileName}
              </Text>
            </View>
          )}
          <PressableScale
            onPress={() => {
              setPhoto(null);
              setDocument(null);
            }}
            style={{ marginLeft: spacing.xs }}
            hitSlop={10}
          >
            <Ionicons name="close-circle" size={22} color={colors.inkTertiary} />
          </PressableScale>
        </View>
      )}

      {conversation.hasLeft ? (
        <View style={{ padding: spacing.md, alignItems: "center" }}>
          <Text style={[type.footnote, { color: colors.inkTertiary, textAlign: "center" }]}>
            Vous ne faites plus partie de ce groupe. L'historique reste consultable.
          </Text>
        </View>
      ) : (
        <View
          style={[
            {
              flexDirection: "row",
              alignItems: "flex-end",
              paddingHorizontal: spacing.md,
              paddingTop: spacing.xs,
              paddingBottom: spacing.xs,
              borderTopWidth: StyleSheet.hairlineWidth,
              borderTopColor: colors.border,
            },
            readable,
          ]}
        >
          <PressableScale
            onPress={handleAttach}
            style={{ marginRight: spacing.xs, marginBottom: 7, padding: 2 }}
            hitSlop={8}
            pressedScale={0.9}
          >
            <Ionicons name="add-circle-outline" size={27} color={colors.accent} />
          </PressableScale>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Votre message..."
            placeholderTextColor={colors.inkTertiary}
            multiline
            // Retour explicite du client : sur le web, la touche Entrée doit
            // envoyer le message (Maj+Entrée pour un retour à la ligne) —
            // jamais sur mobile natif, où le clavier tactile n'a pas cette
            // convention. On intercepte `onKeyPress` (web uniquement) pour
            // envoyer sans jamais faire perdre le focus du champ.
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
            style={[
              type.callout,
              {
                flex: 1,
                minHeight: 38,
                maxHeight: 110,
                color: colors.ink,
                backgroundColor: colors.surface,
                borderRadius: radius.pill,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: colors.border,
                paddingHorizontal: spacing.sm,
                paddingTop: 9,
                paddingBottom: 9,
                marginRight: spacing.xs,
              },
            ]}
          />
          <PressableScale
            onPress={handleSend}
            disabled={sending || (!draft.trim() && !attachment)}
            pressedScale={0.9}
          >
            <View
              style={{
                width: 38,
                height: 38,
                borderRadius: radius.pill,
                backgroundColor: draft.trim() || attachment ? colors.accentFill : colors.surfaceAlt,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons
                name="arrow-up"
                size={19}
                color={draft.trim() || attachment ? colors.onAccent : colors.inkTertiary}
              />
            </View>
          </PressableScale>
        </View>
      )}

      <PhotoViewerModal visible={!!viewerUri} uri={viewerUri ?? ""} onClose={() => setViewerUri(null)} />
    </ScreenContainer>
  );
}

function DaySeparator({ label }: { label: string }) {
  const { colors, spacing, type } = useTheme();
  return (
    <Text
      style={[
        type.caption,
        {
          color: colors.inkTertiary,
          textAlign: "center",
          marginTop: spacing.md,
          marginBottom: spacing.xs,
          textTransform: "capitalize",
        },
      ]}
    >
      {label}
    </Text>
  );
}
