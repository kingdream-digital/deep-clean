import React, { useCallback, useState } from "react";
import { Linking, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { StateView } from "../../components/StateView";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { PressableScale } from "../../components/PressableScale";
import { useTheme } from "../../theme/ThemeProvider";
import { useAuth } from "../../auth/AuthContext";
import { getClient } from "../../api/clients.api";
import type { Client } from "../../api/clients.api";
import type { MenuStackParamList } from "../../navigation/MenuStack";
import { useLiveFocusEffect, isBackgroundRefresh } from "../../sync/liveSync";

type Route = RouteProp<MenuStackParamList, "ClientDetail">;
const FULL_ACCESS_ROLES = ["HR", "DIRECTOR", "ADMIN"];

function InfoRow({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  const { colors, spacing, type } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", marginTop: spacing.sm }}>
      <Ionicons name={icon} size={16} color={colors.inkTertiary} style={{ marginTop: 2 }} />
      <View style={{ marginLeft: spacing.sm, flex: 1 }}>
        <Text style={[type.caption, { color: colors.inkTertiary }]}>{label}</Text>
        <Text style={[type.callout, { color: colors.ink, marginTop: 1 }]}>{value}</Text>
      </View>
    </View>
  );
}

export function ClientDetailScreen() {
  const { colors, spacing, type } = useTheme();
  const { user } = useAuth();
  const route = useRoute<Route>();
  const navigation = useNavigation<NativeStackNavigationProp<MenuStackParamList>>();
  const { clientId } = route.params;

  const [client, setClient] = useState<Client | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  const load = useCallback(async () => {
    const silent = isBackgroundRefresh();
    try {
      if (!silent) setState("loading");
      setClient(await getClient(clientId));
      setState("ready");
    } catch {
      if (!silent) setState("error");
    }
  }, [clientId]);

  useLiveFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  if (state === "loading") {
    return (
      <ScreenContainer>
        <StateView kind="loading" />
      </ScreenContainer>
    );
  }
  if (state === "error" || !client) {
    return (
      <ScreenContainer>
        <StateView kind="error" onRetry={load} />
      </ScreenContainer>
    );
  }

  const contactName = [client.contactFirstName, client.contactLastName].filter(Boolean).join(" ");
  const fullAddress = [client.billingAddress, [client.postalCode, client.city].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  const canManage = !!user && (FULL_ACCESS_ROLES.includes(user.role) || client.createdById === user.id);

  return (
    <ScreenContainer style={{ paddingTop: spacing.md }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: spacing.xxxl }}>
        <Card>
          <Text style={[type.title2, { color: colors.ink }]}>{client.companyName}</Text>
          {!!contactName && (
            <Text style={[type.callout, { color: colors.inkSecondary, marginTop: 2 }]}>
              {contactName}
              {client.jobTitle ? ` · ${client.jobTitle}` : ""}
            </Text>
          )}

          {!!client.phone && (
            <PressableScale onPress={() => Linking.openURL(`tel:${client.phone}`)}>
              <InfoRow icon="call-outline" label="Téléphone" value={client.phone} />
            </PressableScale>
          )}
          {!!client.email && (
            <PressableScale onPress={() => Linking.openURL(`mailto:${client.email}`)}>
              <InfoRow icon="mail-outline" label="Email" value={client.email} />
            </PressableScale>
          )}
          {!!fullAddress && <InfoRow icon="location-outline" label="Adresse de facturation" value={fullAddress} />}
          {!!client.siret && <InfoRow icon="business-outline" label="SIRET" value={client.siret} />}
          {!!client.notes && <InfoRow icon="document-text-outline" label="Notes" value={client.notes} />}
        </Card>

        <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
          <Button label="Nouveau devis" onPress={() => navigation.navigate("QuoteForm", { clientId })} />
          {!!canManage && <Button label="Modifier la fiche" variant="secondary" onPress={() => navigation.navigate("ClientForm", { clientId })} />}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
