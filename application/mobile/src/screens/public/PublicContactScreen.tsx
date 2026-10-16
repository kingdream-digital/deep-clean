import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../../theme/ThemeProvider";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { ServiceAreaChecker } from "../../components/ServiceAreaChecker";
import { COMPANY_CONTACT } from "../../config/links";
import { SERVICE_TOWNS } from "../../config/serviceArea";
import { FAQ } from "./publicContent";
import { ContactRow, PublicFooter, SectionTitle, TabTitle, useContactActions, usePublicNavigation } from "./publicUi";

// Onglet « Contact » de l'accueil public : devis, téléphone, e-mail,
// itinéraire, zone d'intervention et questions fréquentes.
export function PublicContactScreen() {
  const { colors, spacing, type } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = usePublicNavigation();
  const contact = useContactActions();
  const [openQuestion, setOpenQuestion] = useState<string | null>(FAQ[0]?.q ?? null);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl }} keyboardShouldPersistTaps="handled">
      <TabTitle title="Contact" subtitle="Une question, un projet ? Nous répondons sous 24 à 48 h." top={insets.top} />

      <View style={{ marginTop: spacing.md }}>
        <Button label="Demander un devis gratuit" icon="document-text-outline" size="lg" onPress={() => navigation.navigate("QuoteRequest")} />
      </View>
      <Card padded={false} style={{ marginTop: spacing.md }}>
        <ContactRow icon="call-outline" label={COMPANY_CONTACT.phone} detail="Appeler" onPress={contact.call} />
        <ContactRow icon="mail-outline" label={COMPANY_CONTACT.email} detail="Écrire" onPress={contact.write} />
        <ContactRow icon="navigate-outline" label={COMPANY_CONTACT.address} detail="Itinéraire" onPress={contact.directions} last />
      </Card>

      <SectionTitle overline="ZONE D'INTERVENTION" title="Manosque et alentours" />
      <ServiceAreaChecker onRequestQuote={() => navigation.navigate("QuoteRequest")} />
      <Card padded={false} style={{ marginTop: spacing.sm }}>
        {SERVICE_TOWNS.map((town, index) => (
          <View
            key={town.name}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.sm,
              borderTopWidth: index === 0 ? 0 : StyleSheet.hairlineWidth,
              borderTopColor: colors.border,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Ionicons name={index === 0 ? "home-outline" : "location-outline"} size={16} color={colors.accentText} />
              <Text style={[type.callout, { color: colors.ink, marginLeft: spacing.xs }]}>{town.name}</Text>
            </View>
            <Text style={[type.footnote, { color: colors.inkTertiary }]}>{town.distance}</Text>
          </View>
        ))}
      </Card>
      <Text style={[type.caption, { color: colors.inkTertiary, marginTop: spacing.xs }]}>
        Distances à vol d'oiseau depuis Manosque. Votre commune n'apparaît pas ? Demandez-nous.
      </Text>

      <SectionTitle overline="QUESTIONS FRÉQUENTES" title="Tout savoir avant de plonger" />
      {FAQ.map((item) => {
        const open = openQuestion === item.q;
        return (
          <Card key={item.q} style={{ marginBottom: spacing.sm }}>
            <Pressable onPress={() => setOpenQuestion(open ? null : item.q)} accessibilityRole="button" accessibilityState={{ expanded: open }} style={{ flexDirection: "row", alignItems: "center" }}>
              <Text style={[type.headline, { color: colors.ink, flex: 1 }]}>{item.q}</Text>
              <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color={colors.inkTertiary} />
            </Pressable>
            {open && <Text style={[type.subhead, { color: colors.inkSecondary, marginTop: spacing.xs }]}>{item.a}</Text>}
          </Card>
        );
      })}

      <PublicFooter />
    </ScrollView>
  );
}
