import React, { useState } from "react";
import { Image, Pressable, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../../theme/ThemeProvider";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { PressableScale } from "../../components/PressableScale";
import { COMMITMENTS, METHOD, ROOMS, SPECIFIC_CARE, UNIVERSES } from "./publicContent";
import { PublicFooter, SectionTitle, TabTitle, usePublicNavigation } from "./publicUi";

// Onglet « Services » de l'accueil public : les univers de DEEP CLEAN, les
// soins spécifiques, le détail pièce par pièce, la méthode et les engagements.
// Chaque prestation mène à la demande de devis, déjà présélectionnée.
export function PublicServicesScreen() {
  const { colors, spacing, radius, type } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = usePublicNavigation();
  const [room, setRoom] = useState(ROOMS[0]!.name);
  const currentRoom = ROOMS.find((r) => r.name === room) ?? ROOMS[0]!;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl }}>
      <TabTitle title="Nos services" subtitle="Une même équipe, une même méthode, un même niveau de finition." top={insets.top} />

      {UNIVERSES.map((item) => (
        <Card key={item.title} padded={false} style={{ marginTop: spacing.md, overflow: "hidden" }}>
          <Image source={item.image} style={{ width: "100%", height: 170 }} resizeMode="cover" accessibilityIgnoresInvertColors />
          <View style={{ padding: spacing.md }}>
            <Text style={[type.headline, { color: colors.ink }]}>{item.title}</Text>
            <Text style={[type.subhead, { color: colors.inkSecondary, marginTop: spacing.xxs }]}>{item.text}</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xxs, marginTop: spacing.sm }}>
              {item.tags.map((tag) => (
                <View key={tag} style={{ paddingHorizontal: spacing.xs, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: colors.surface }}>
                  <Text style={[type.caption, { color: colors.inkSecondary }]}>{tag}</Text>
                </View>
              ))}
            </View>
            <Pressable onPress={() => navigation.navigate("QuoteRequest", { service: item.service })} accessibilityRole="button" hitSlop={6} style={{ marginTop: spacing.sm, flexDirection: "row", alignItems: "center" }}>
              <Text style={[type.callout, { color: colors.accentText, fontFamily: "Inter_600SemiBold" }]}>Demander un devis</Text>
              <Ionicons name="arrow-forward" size={15} color={colors.accentText} style={{ marginLeft: 4 }} />
            </Pressable>
          </View>
        </Card>
      ))}

      <SectionTitle overline="SOINS SPÉCIFIQUES" title="Et nos soins sur mesure" />
      {SPECIFIC_CARE.map((item) => (
        <PressableScale key={item.title} onPress={() => navigation.navigate("QuoteRequest", { service: item.service })} accessibilityRole="button">
          <Card style={{ marginBottom: spacing.sm, flexDirection: "row", alignItems: "center" }}>
            <Image source={item.image} style={{ width: 64, height: 64, borderRadius: radius.md }} resizeMode="cover" accessibilityIgnoresInvertColors />
            <View style={{ flex: 1, marginLeft: spacing.sm }}>
              <Text style={[type.headline, { color: colors.ink }]}>{item.title}</Text>
              <Text style={[type.footnote, { color: colors.inkSecondary, marginTop: 2 }]}>{item.text}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.inkTertiary} />
          </Card>
        </PressableScale>
      ))}

      <SectionTitle overline="PIÈCE PAR PIÈCE" title="Jusqu'au moindre recoin" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -spacing.lg }} contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.xs }}>
        {ROOMS.map((r) => {
          const selected = r.name === room;
          return (
            <Pressable
              key={r.name}
              onPress={() => setRoom(r.name)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: spacing.sm,
                paddingVertical: 8,
                borderRadius: radius.pill,
                backgroundColor: selected ? colors.accentFill : colors.backgroundElevated,
                borderWidth: 1,
                borderColor: selected ? colors.accentFill : colors.border,
              }}
            >
              <Ionicons name={r.icon} size={15} color={selected ? colors.onAccent : colors.inkSecondary} />
              <Text style={[type.footnote, { color: selected ? colors.onAccent : colors.ink, marginLeft: 5, fontFamily: "Inter_600SemiBold" }]}>{r.name}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <Card style={{ marginTop: spacing.sm }}>
        {currentRoom.points.map((point, index) => (
          <View key={point.label} style={{ flexDirection: "row", alignItems: "center", marginTop: index === 0 ? 0 : spacing.sm }}>
            <Ionicons name="checkmark-circle" size={18} color={colors.accentText} />
            <Text style={[type.callout, { color: colors.ink, marginLeft: spacing.xs, flex: 1 }]}>{point.label}</Text>
            {point.onQuote && <Text style={[type.caption, { color: colors.inkTertiary }]}>Sur devis</Text>}
          </View>
        ))}
      </Card>
      <Text style={[type.caption, { color: colors.inkTertiary, marginTop: spacing.xs }]}>
        Exemples de points traités lors d'un nettoyage en profondeur. Le contenu exact de chaque intervention est défini avec vous lors du devis.
      </Text>

      <SectionTitle overline="NOTRE MÉTHODE" title="Une méthode, pas une routine" />
      <Card>
        {METHOD.map((step, index) => (
          <View key={step.title} style={{ flexDirection: "row", marginTop: index === 0 ? 0 : spacing.md }}>
            <Text style={[type.title3, { color: colors.accentText, width: 34 }]}>{String(index + 1).padStart(2, "0")}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[type.headline, { color: colors.ink }]}>{step.title}</Text>
              <Text style={[type.footnote, { color: colors.inkSecondary, marginTop: 2 }]}>{step.text}</Text>
            </View>
          </View>
        ))}
      </Card>

      <SectionTitle overline="NOS ENGAGEMENTS" title="Cinq engagements qui ne changent jamais" />
      <Card>
        {COMMITMENTS.map((item, index) => (
          <View key={item.title} style={{ flexDirection: "row", alignItems: "flex-start", marginTop: index === 0 ? 0 : spacing.md }}>
            <View style={{ width: 36, height: 36, borderRadius: radius.sm, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name={item.icon} size={18} color={colors.accentText} />
            </View>
            <View style={{ flex: 1, marginLeft: spacing.sm }}>
              <Text style={[type.headline, { color: colors.ink }]}>{item.title}</Text>
              <Text style={[type.footnote, { color: colors.inkSecondary, marginTop: 2 }]}>{item.text}</Text>
            </View>
          </View>
        ))}
      </Card>

      <View style={{ marginTop: spacing.xl }}>
        <Button label="Demander un devis gratuit" icon="document-text-outline" size="lg" onPress={() => navigation.navigate("QuoteRequest")} />
      </View>
      <PublicFooter />
    </ScrollView>
  );
}
