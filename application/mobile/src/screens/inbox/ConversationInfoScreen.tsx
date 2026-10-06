import React, { useCallback, useMemo, useState } from "react";
import { Linking, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { StateView } from "../../components/StateView";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { PressableScale } from "../../components/PressableScale";
import { Avatar, GroupAvatar } from "../../components/Avatar";
import { useTheme } from "../../theme/ThemeProvider";
import { useAuth } from "../../auth/AuthContext";
import {
  getConversation,
  leaveConversation,
  removeParticipant,
  renameConversation,
} from "../../api/messages.api";
import type { Conversation, Participant } from "../../api/messages.api";
import { extractErrorMessage } from "../../api/client";
import { Alert } from "../../utils/alert";
import { ROLE_LABELS_SHORT } from "../../utils/roleLabels";
import type { InboxStackParamList } from "../../navigation/InboxStack";
import { useLiveFocusEffect } from "../../sync/liveSync";

type Route = RouteProp<{ ConversationInfo: { conversationId: string } }, "ConversationInfo">;

/**
 * Fiche d'un fil : à deux, les coordonnées de l'interlocuteur ; en groupe, la
 * liste des participants et son administration (ajouter, retirer, renommer,
 * quitter). Toutes ces actions restent vérifiées côté serveur — l'écran ne
 * fait que masquer ce qui n'est pas permis.
 */
export function ConversationInfoScreen() {
  const { colors, spacing, radius, type } = useTheme();
  const { user } = useAuth();
  const route = useRoute<Route>();
  const navigation = useNavigation<NativeStackNavigationProp<InboxStackParamList>>();
  const { conversationId } = route.params;

  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setConversation(await getConversation(conversationId));
      setState("ready");
    } catch {
      setState("error");
    }
  }, [conversationId]);

  useLiveFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const activeParticipants = useMemo(
    () => (conversation?.participants ?? []).filter((p) => !p.hasLeft),
    [conversation]
  );

  async function call(person: Participant) {
    if (!person.phone) {
      Alert.alert(
        "Aucun numéro enregistré",
        `${person.firstName} n'a pas de numéro de téléphone dans son profil. La RH peut l'ajouter.`
      );
      return;
    }
    const url = `tel:${person.phone}`;
    const supported = await Linking.canOpenURL(url).catch(() => false);
    if (!supported) {
      Alert.alert(`${person.firstName} ${person.lastName}`, `Téléphone : ${person.phone}`);
      return;
    }
    await Linking.openURL(url);
  }

  function handleRename() {
    if (!conversation) return;
    // Pas de champ de saisie dans une alerte sur toutes les plateformes : on
    // réutilise l'écran de renommage dédié, qui gère aussi le clavier.
    navigation.navigate("RenameGroup", { conversationId, currentTitle: conversation.title });
  }

  function handleRemove(person: Participant) {
    Alert.alert("Retirer du groupe", `Retirer ${person.firstName} ${person.lastName} de ce groupe ?`, [
      { text: "Annuler", style: "cancel" },
      {
        text: "Retirer",
        style: "destructive",
        onPress: async () => {
          setBusy(true);
          try {
            setConversation(await removeParticipant(conversationId, person.id));
          } catch (err) {
            Alert.alert("Action impossible", extractErrorMessage(err));
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  }

  function handleLeave() {
    Alert.alert("Quitter le groupe", "Vous ne recevrez plus les messages de ce groupe.", [
      { text: "Annuler", style: "cancel" },
      {
        text: "Quitter",
        style: "destructive",
        onPress: async () => {
          setBusy(true);
          try {
            await leaveConversation(conversationId);
            navigation.navigate("InboxHome");
          } catch (err) {
            Alert.alert("Action impossible", extractErrorMessage(err));
            setBusy(false);
          }
        },
      },
    ]);
  }

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

  const other = conversation.otherUser;
  const canAdminister = conversation.isGroup && conversation.isAdmin && !conversation.hasLeft;

  return (
    <ScreenContainer>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={{ alignItems: "center", paddingTop: spacing.lg }}>
          {conversation.isGroup ? (
            <GroupAvatar participants={activeParticipants.filter((p) => p.id !== user?.id)} size={84} />
          ) : (
            <Avatar user={other ?? conversation.participants[0]!} size={84} />
          )}
          <View style={{ flexDirection: "row", alignItems: "center", marginTop: spacing.md }}>
            <Text style={[type.title2, { color: colors.ink, textAlign: "center" }]}>{conversation.title}</Text>
            {!!canAdminister && (
              <PressableScale onPress={handleRename} hitSlop={10} style={{ marginLeft: 6 }}>
                <Ionicons name="pencil" size={16} color={colors.accent} />
              </PressableScale>
            )}
          </View>
          <Text style={[type.subhead, { color: colors.inkSecondary, marginTop: 2 }]}>
            {conversation.isGroup
              ? `${activeParticipants.length} participants`
              : ROLE_LABELS_SHORT[(other ?? conversation.participants[0]!).role]}
          </Text>
        </View>

        {/* Actions rapides façon fiche de contact : appeler, écrire. */}
        <View style={{ flexDirection: "row", justifyContent: "center", marginTop: spacing.lg }}>
          {!conversation.isGroup && other && (
            <QuickAction icon="call" label="Appeler" onPress={() => call(other)} />
          )}
          {/* Un groupe n'a pas de numéro : on propose de choisir qui appeler
              parmi les participants qui en ont un. */}
          {!!conversation.isGroup && (
            <QuickAction
              icon="call"
              label="Appeler"
              onPress={() => {
                const callable = activeParticipants.filter((p) => p.id !== user?.id && p.phone);
                if (callable.length === 0) {
                  Alert.alert("Aucun numéro enregistré", "Personne dans ce groupe n'a de numéro de téléphone renseigné.");
                  return;
                }
                Alert.alert("Appeler", "Qui souhaitez-vous appeler ?", [
                  ...callable.map((p) => ({ text: `${p.firstName} ${p.lastName}`, onPress: () => void call(p) })),
                  { text: "Annuler", style: "cancel" as const },
                ]);
              }}
            />
          )}
          <QuickAction
            icon="chatbubble"
            label="Message"
            onPress={() => navigation.navigate("ConversationThread", { conversationId })}
          />
          {!!canAdminister && (
            <QuickAction
              icon="person-add"
              label="Ajouter"
              onPress={() => navigation.navigate("AddParticipants", { conversationId })}
            />
          )}
        </View>

        {!conversation.isGroup && other && (
          <Card style={{ marginTop: spacing.xl }}>
            <PressableScale onPress={() => call(other)} disabled={!other.phone}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Ionicons name="call-outline" size={18} color={colors.inkTertiary} />
                <Text
                  style={[
                    type.callout,
                    { color: other.phone ? colors.accent : colors.inkTertiary, marginLeft: spacing.sm },
                  ]}
                >
                  {other.phone ?? "Aucun numéro renseigné"}
                </Text>
              </View>
            </PressableScale>
          </Card>
        )}

        {!!conversation.isGroup && (
          <View style={{ marginTop: spacing.xl }}>
            <Text style={[type.overline, { color: colors.inkTertiary, marginBottom: spacing.xs }]}>
              PARTICIPANTS
            </Text>
            <Card padded={false}>
              {activeParticipants.map((person, index) => (
                <View key={person.id}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      paddingHorizontal: spacing.md,
                      paddingVertical: spacing.sm,
                    }}
                  >
                    <Avatar user={person} size={38} />
                    <View style={{ flex: 1, marginLeft: spacing.sm }}>
                      <Text style={[type.body, { color: colors.ink }]} numberOfLines={1}>
                        {person.firstName} {person.lastName}
                        {person.id === user?.id ? " (vous)" : ""}
                      </Text>
                      <Text style={[type.footnote, { color: colors.inkTertiary }]} numberOfLines={1}>
                        {ROLE_LABELS_SHORT[person.role]}
                        {person.isAdmin ? " · Administrateur" : ""}
                      </Text>
                    </View>
                    {person.id !== user?.id && (
                      <PressableScale onPress={() => call(person)} hitSlop={8} style={{ padding: 6 }}>
                        <Ionicons name="call-outline" size={19} color={colors.accent} />
                      </PressableScale>
                    )}
                    {canAdminister && person.id !== user?.id && (
                      <PressableScale
                        onPress={() => handleRemove(person)}
                        hitSlop={8}
                        style={{ padding: 6, marginLeft: 2 }}
                        disabled={busy}
                      >
                        <Ionicons name="remove-circle-outline" size={19} color={colors.danger} />
                      </PressableScale>
                    )}
                  </View>
                  {index < activeParticipants.length - 1 && (
                    <View
                      style={{
                        height: StyleSheet.hairlineWidth,
                        backgroundColor: colors.border,
                        marginLeft: 38 + spacing.md + spacing.sm,
                      }}
                    />
                  )}
                </View>
              ))}
            </Card>

            {!conversation.hasLeft && (
              <View style={{ marginTop: spacing.xl, marginBottom: spacing.xxl }}>
                <Button label="Quitter le groupe" variant="destructive" icon="exit-outline" onPress={handleLeave} />
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

function QuickAction({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  const { colors, spacing, radius, type } = useTheme();
  return (
    <PressableScale onPress={onPress} style={{ alignItems: "center", marginHorizontal: spacing.sm }} pressedScale={0.94}>
      <View
        style={{
          width: 52,
          height: 52,
          borderRadius: radius.md,
          backgroundColor: colors.accentSoft,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name={icon} size={21} color={colors.accent} />
      </View>
      <Text style={[type.caption, { color: colors.inkSecondary, marginTop: 5 }]}>{label}</Text>
    </PressableScale>
  );
}
