import React, { useCallback, useEffect, useState } from "react";
import { Linking, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute, RouteProp, NavigationProp } from "@react-navigation/native";
import { ScreenContainer } from "../../components/ScreenContainer";
import { StateView } from "../../components/StateView";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { PressableScale } from "../../components/PressableScale";
import { Avatar } from "../../components/Avatar";
import { useTheme } from "../../theme/ThemeProvider";
import { blockContact, getContact, listBlockedContacts, unblockContact } from "../../api/messages.api";
import type { Contact } from "../../api/messages.api";
import { Alert } from "../../utils/alert";
import { extractErrorMessage } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { ROLE_LABELS_SHORT } from "../../utils/roleLabels";
import type { AppTabsParamList } from "../../navigation/appTabsShared";
import { isBackgroundRefresh, useReloadOnDataChange } from "../../sync/liveSync";

type Route = RouteProp<{ ContactProfile: { userId: string } }, "ContactProfile">;

// Fiche contact minimale (nom, téléphone) — annuaire interne ouvert à toute
// l'entreprise pour la messagerie, volontairement plus léger que l'écran de
// gestion des comptes réservé à la RH (aucune action d'administration ici).
export function ContactProfileScreen() {
  const { colors, spacing, type } = useTheme();
  const route = useRoute<Route>();
  const navigation = useNavigation<NavigationProp<AppTabsParamList>>();
  const { userId } = route.params;

  const { user } = useAuth();
  const [contact, setContact] = useState<Contact | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  // Blocage dans la messagerie (règle App Store 1.2) : action personnelle,
  // disponible sur la fiche de n'importe quel collègue.
  const [blocked, setBlocked] = useState(false);
  const [blockBusy, setBlockBusy] = useState(false);

  const load = useCallback(async () => {
    const silent = isBackgroundRefresh();
    try {
      if (!silent) setState("loading");
      const [fresh, blockedList] = await Promise.all([getContact(userId), listBlockedContacts().catch(() => [])]);
      setContact(fresh);
      setBlocked(blockedList.some((c) => c.id === userId));
      setState("ready");
    } catch {
      if (!silent) setState("error");
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);
  useReloadOnDataChange(load);

  async function handleCall() {
    if (!contact?.phone) return;
    const url = `tel:${contact.phone}`;
    const supported = await Linking.canOpenURL(url).catch(() => false);
    if (!supported) {
      // Navigateur de bureau sans application téléphone : afficher le numéro
      // reste utile, plutôt que de ne rien faire du tout.
      Alert.alert(`${contact.firstName} ${contact.lastName}`, `Téléphone : ${contact.phone}`);
      return;
    }
    await Linking.openURL(url);
  }

  function toggleBlock() {
    if (!contact) return;
    const name = `${contact.firstName} ${contact.lastName}`;
    const run = async () => {
      setBlockBusy(true);
      try {
        if (blocked) await unblockContact(contact.id);
        else await blockContact(contact.id);
        setBlocked(!blocked);
      } catch (err) {
        Alert.alert("Action impossible", extractErrorMessage(err));
      } finally {
        setBlockBusy(false);
      }
    };
    if (blocked) {
      void run();
      return;
    }
    Alert.alert(
      `Bloquer ${name} ?`,
      "Cette personne ne pourra plus vous écrire en message direct et vous ne recevrez plus ses notifications de messagerie. Ses messages de groupe vous seront masqués. Pour un comportement abusif, signalez aussi ses messages à la RH (appui long sur un message).",
      [
        { text: "Annuler", style: "cancel" },
        { text: "Bloquer", style: "destructive", onPress: () => void run() },
      ]
    );
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
    <ScreenContainer>
      <View style={{ alignItems: "center", paddingTop: spacing.xl }}>
        <Avatar user={contact} size={88} />
        <Text style={[type.title2, { color: colors.ink, marginTop: spacing.md }]}>
          {contact.firstName} {contact.lastName}
        </Text>
        <Text style={[type.subhead, { color: colors.inkSecondary, marginTop: 2 }]}>
          {ROLE_LABELS_SHORT[contact.role]}
        </Text>
      </View>

      <Card style={{ marginTop: spacing.xl }}>
        {contact.phone ? (
          <PressableScale onPress={handleCall}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Ionicons name="call-outline" size={18} color={colors.inkTertiary} />
              <Text style={[type.callout, { color: colors.accent, marginLeft: spacing.sm }]}>{contact.phone}</Text>
            </View>
          </PressableScale>
        ) : (
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Ionicons name="call-outline" size={18} color={colors.inkTertiary} />
            <Text style={[type.callout, { color: colors.inkTertiary, marginLeft: spacing.sm }]}>
              Aucun numéro renseigné
            </Text>
          </View>
        )}
      </Card>

      <View style={{ marginTop: spacing.xl }}>
        <Button
          label="Envoyer un message"
          icon="chatbubble-outline"
          onPress={() =>
            // Cet écran est monté dans plusieurs stacks (Accueil, Planning,
            // Missions, Menu, Messagerie) — "ConversationThread" n'existe que
            // dans le stack Messagerie. Passer par le nom de l'onglet
            // fonctionne dans tous les cas, y compris depuis l'onglet
            // Messagerie lui-même.
            navigation.navigate("Messagerie", { screen: "ConversationThread", params: { userId } })
          }
        />
        {!!contact.phone && (
          <View style={{ marginTop: spacing.sm }}>
            <Button label="Appeler" icon="call-outline" variant="secondary" onPress={handleCall} />
          </View>
        )}
      </View>

      {contact.id !== user?.id && (
        <View style={{ marginTop: spacing.xl, alignItems: "center" }}>
          <PressableScale
            onPress={toggleBlock}
            disabled={blockBusy}
            accessibilityRole="button"
            style={{ flexDirection: "row", alignItems: "center", padding: spacing.xs, opacity: blockBusy ? 0.5 : 1 }}
          >
            <Ionicons name={blocked ? "lock-open-outline" : "ban-outline"} size={17} color={blocked ? colors.accentText : colors.danger} />
            <Text style={[type.callout, { color: blocked ? colors.accentText : colors.danger, fontWeight: "600", marginLeft: spacing.xs }]}>
              {blocked ? "Débloquer ce contact" : "Bloquer ce contact"}
            </Text>
          </PressableScale>
          {blocked && (
            <Text style={[type.footnote, { color: colors.inkTertiary, textAlign: "center", marginTop: spacing.xxs }]}>
              Vous avez bloqué ce contact : il ne peut plus vous écrire en message direct.
            </Text>
          )}
        </View>
      )}
    </ScreenContainer>
  );
}
