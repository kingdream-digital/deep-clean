import React, { useCallback, useState } from "react";
import { Linking, ScrollView, Text, View } from "react-native";
import { Alert } from "../../utils/alert";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { StateView } from "../../components/StateView";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { PressableScale } from "../../components/PressableScale";
import { ProspectStatusBadge } from "../../components/ProspectStatusBadge";
import { useTheme } from "../../theme/ThemeProvider";
import { extractErrorMessage } from "../../api/client";
import { convertProspectToClient, getProspect } from "../../api/prospects.api";
import type { Prospect } from "../../api/prospects.api";
import type { MenuStackParamList } from "../../navigation/MenuStack";

type Route = RouteProp<MenuStackParamList, "ProspectDetail">;
const dateFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" });

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

export function ProspectDetailScreen() {
  const { colors, spacing, type } = useTheme();
  const route = useRoute<Route>();
  const navigation = useNavigation<NativeStackNavigationProp<MenuStackParamList>>();
  const { prospectId } = route.params;

  const [prospect, setProspect] = useState<Prospect | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [converting, setConverting] = useState(false);

  const load = useCallback(async () => {
    try {
      setState("loading");
      setProspect(await getProspect(prospectId));
      setState("ready");
    } catch {
      setState("error");
    }
  }, [prospectId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  async function handleConvert() {
    if (!prospect) return;
    Alert.alert(
      "Transformer en client ?",
      `Les coordonnées de "${prospect.companyName}" seront reprises telles quelles pour créer sa fiche client — vous n'aurez rien à ressaisir.`,
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Transformer",
          onPress: async () => {
            setConverting(true);
            try {
              const client = await convertProspectToClient(prospect.id);
              navigation.replace("ClientDetail", { clientId: client.id });
            } catch (err) {
              Alert.alert("Transformation impossible", extractErrorMessage(err));
            } finally {
              setConverting(false);
            }
          },
        },
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
  if (state === "error" || !prospect) {
    return (
      <ScreenContainer>
        <StateView kind="error" onRetry={load} />
      </ScreenContainer>
    );
  }

  const contactName = [prospect.contactFirstName, prospect.contactLastName].filter(Boolean).join(" ");
  const fullAddress = [prospect.address, [prospect.postalCode, prospect.city].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");

  return (
    <ScreenContainer style={{ paddingTop: spacing.md }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: spacing.xxxl }}>
        <Card>
          <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
            <View style={{ flex: 1, marginRight: spacing.sm }}>
              <Text style={[type.title2, { color: colors.ink }]}>{prospect.companyName}</Text>
              {contactName && (
                <Text style={[type.callout, { color: colors.inkSecondary, marginTop: 2 }]}>
                  {contactName}
                  {prospect.jobTitle ? ` · ${prospect.jobTitle}` : ""}
                </Text>
              )}
            </View>
            <ProspectStatusBadge status={prospect.status} />
          </View>

          {prospect.phone && (
            <PressableScale onPress={() => Linking.openURL(`tel:${prospect.phone}`)}>
              <InfoRow icon="call-outline" label="Téléphone" value={prospect.phone} />
            </PressableScale>
          )}
          {prospect.email && (
            <PressableScale onPress={() => Linking.openURL(`mailto:${prospect.email}`)}>
              <InfoRow icon="mail-outline" label="Email" value={prospect.email} />
            </PressableScale>
          )}
          {fullAddress && <InfoRow icon="location-outline" label="Adresse" value={fullAddress} />}
          {prospect.siret && <InfoRow icon="business-outline" label="SIRET" value={prospect.siret} />}
          {prospect.source && <InfoRow icon="compass-outline" label="Source" value={prospect.source} />}
          {prospect.serviceType && <InfoRow icon="sparkles-outline" label="Type de prestation" value={prospect.serviceType} />}
          {prospect.need && <InfoRow icon="chatbubble-ellipses-outline" label="Besoin" value={prospect.need} />}
          {prospect.nextFollowUpAt && (
            <InfoRow icon="alarm-outline" label="Prochaine relance" value={dateFmt.format(new Date(prospect.nextFollowUpAt))} />
          )}
          {prospect.assignedUser && (
            <InfoRow
              icon="person-outline"
              label="Commercial responsable"
              value={`${prospect.assignedUser.firstName} ${prospect.assignedUser.lastName}`}
            />
          )}
          {prospect.notes && <InfoRow icon="document-text-outline" label="Notes" value={prospect.notes} />}
        </Card>

        <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
          <Button label="Modifier la fiche" variant="secondary" onPress={() => navigation.navigate("ProspectForm", { prospectId })} />
          {prospect.hasClient ? (
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: spacing.sm }}>
              <Ionicons name="checkmark-circle" size={16} color={colors.success} />
              <Text style={[type.footnote, { color: colors.success, marginLeft: 6, fontWeight: "600" }]}>
                Déjà transformé en client
              </Text>
            </View>
          ) : (
            <Button label="Transformer en client" onPress={handleConvert} loading={converting} />
          )}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
