import React from "react";
import { ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { PressableScale } from "../../components/PressableScale";
import { useTheme } from "../../theme/ThemeProvider";
import type { MenuStackParamList } from "../../navigation/MenuStack";

interface CommercialEntry {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  message: string;
  screen: "ProspectsList" | "ClientsList" | "QuotesList";
}

// Point d'entrée du module commercial (cahier des charges "Module commercial
// / devis / chantiers / facturation", §5) — Prospects, Clients et Devis pour
// l'instant ; Chantiers commerciaux et Factures viendront s'y ajouter phase
// par phase, sans jamais automatiser la création de mission ou de planning
// (le client final n'a lui-même jamais accès à DeepClean, voir §4).
const ENTRIES: CommercialEntry[] = [
  { icon: "person-add-outline", label: "Prospects", message: "Prospection, suivi et relances", screen: "ProspectsList" },
  { icon: "briefcase-outline", label: "Clients", message: "Coordonnées, historique commercial", screen: "ClientsList" },
  { icon: "document-text-outline", label: "Devis", message: "Créer, envoyer, relancer, suivre l'acceptation", screen: "QuotesList" },
];

export function CommercialHomeScreen() {
  const { colors, spacing, radius, type } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<MenuStackParamList>>();

  return (
    <ScreenContainer>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: spacing.lg, paddingBottom: spacing.xxl }}>
        <Text style={[type.largeTitle, { color: colors.ink, marginBottom: spacing.xs }]}>Commercial</Text>
        <Text style={[type.footnote, { color: colors.inkSecondary, marginBottom: spacing.lg }]}>
          Le client final ne reçoit que des devis/factures par email — il n'a jamais accès à DeepClean.
        </Text>

        <Card padded={false}>
          {ENTRIES.map((entry, index) => (
            <PressableScale key={entry.screen} onPress={() => navigation.navigate(entry.screen)}>
              <View
                style={[
                  { flexDirection: "row", alignItems: "center", paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
                  index > 0 && { borderTopWidth: 1, borderTopColor: colors.border },
                ]}
              >
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: radius.md,
                    backgroundColor: colors.accentSoft,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons name={entry.icon} size={20} color={colors.accent} />
                </View>
                <View style={{ marginLeft: spacing.md, flex: 1 }}>
                  <Text style={[type.headline, { color: colors.ink }]}>{entry.label}</Text>
                  <Text style={[type.footnote, { color: colors.inkTertiary, marginTop: 2 }]} numberOfLines={1}>
                    {entry.message}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.inkTertiary} />
              </View>
            </PressableScale>
          ))}
        </Card>
      </ScrollView>
    </ScreenContainer>
  );
}
