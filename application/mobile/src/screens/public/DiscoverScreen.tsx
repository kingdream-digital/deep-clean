import React from "react";
import { Image, ImageSourcePropType, Linking, ScrollView, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInUp } from "react-native-reanimated";
import { useTheme } from "../../theme/ThemeProvider";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { PressableScale } from "../../components/PressableScale";
import { BrandEmblem } from "../../components/BrandEmblem";
import { openDirectionsTo } from "../../utils/openMaps";
import { Alert } from "../../utils/alert";
import { COMPANY_CONTACT } from "../../config/links";
import type { PublicStackParamList } from "../../navigation/RootNavigator";

// Espace public de l'application, accessible sans compte depuis l'écran de
// connexion : les particuliers et entreprises découvrent DEEP CLEAN et
// demandent un devis. Textes et photos repris du site de l'entreprise
// (deep-clean.fr) — rien d'inventé ; les comptes, eux, restent créés par la RH.

const SERVICES: { title: string; text: string; image: ImageSourcePropType }[] = [
  {
    title: "Nettoyage approfondi",
    text: "Une remise à neuf complète, pièce par pièce : sols, surfaces, vitres et recoins retrouvent un état impeccable.",
    image: require("../../../assets/discover/nettoyage-approfondi.jpg"),
  },
  {
    title: "Nettoyage standard",
    text: "Un entretien régulier et fiable qui préserve, semaine après semaine, la qualité d'un intérieur déjà soigné.",
    image: require("../../../assets/discover/nettoyage-standard.jpg"),
  },
  {
    title: "Bureaux & espaces professionnels",
    text: "Des locaux irréprochables du matin au soir, pour accueillir vos clients et vos équipes.",
    image: require("../../../assets/discover/bureaux.jpg"),
  },
  {
    title: "Nettoyage d'ameublement",
    text: "Canapés, fauteuils et assises traités en profondeur avec des méthodes respectueuses de chaque textile.",
    image: require("../../../assets/discover/ameublement.jpg"),
  },
  {
    title: "Nettoyage de matelas",
    text: "Un traitement en profondeur, respectueux des matières, pour un couchage plus sain nuit après nuit.",
    image: require("../../../assets/discover/matelas.jpg"),
  },
  {
    title: "Textiles, sols & vitres",
    text: "Sols retrouvés, vitres parfaitement claires, textiles ravivés jusque dans les finitions.",
    image: require("../../../assets/discover/sols-vitres.jpg"),
  },
];

const COMMITMENTS: { icon: keyof typeof Ionicons.glyphMap; title: string; text: string }[] = [
  { icon: "ribbon-outline", title: "Qualité", text: "Un niveau d'exigence constant, du premier geste au contrôle final." },
  { icon: "time-outline", title: "Ponctualité", text: "Des créneaux tenus avec sérieux : votre organisation est respectée." },
  { icon: "flask-outline", title: "Produits & matériel", text: "Des produits professionnels et un matériel entretenu, adaptés à chaque surface." },
  { icon: "people-outline", title: "Professionnalisme", text: "Une équipe discrète, formée et soigneuse." },
  { icon: "swap-horizontal-outline", title: "Flexibilité", text: "Des interventions adaptées à votre rythme et à vos imprévus." },
];

const METHOD = [
  { title: "Diagnostic", text: "Matériaux, textiles et points sensibles identifiés avant d'intervenir." },
  { title: "Protocole adapté", text: "Produits, méthodes et intensité choisis pour chaque surface." },
  { title: "Exécution soignée", text: "Un travail méthodique, sans précipitation." },
  { title: "Contrôle qualité", text: "Une vérification finale avant de considérer l'intervention terminée." },
];

const TOWNS = ["Manosque", "Forcalquier", "Volx", "Pierrevert", "Gréoux-les-Bains", "Sainte-Tulle", "Villeneuve", "Corbières"];

const FAQ = [
  {
    q: "Sous quel délai pouvez-vous intervenir ?",
    a: "Nous répondons à chaque demande sous 24 à 48 h avec une proposition de créneau, et nous nous adaptons aux besoins urgents (vente, état des lieux).",
  },
  {
    q: "Êtes-vous assurés ?",
    a: "Oui, notre activité est couverte par une assurance responsabilité civile professionnelle.",
  },
  {
    q: "En quoi consiste la conciergerie ?",
    a: "Un suivi régulier de votre bien : coordination des passages, attention portée aux détails entre deux séjours, vigilance sur l'état général du logement.",
  },
];

export function DiscoverScreen() {
  const { colors, spacing, radius, type } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<PublicStackParamList>>();

  async function call() {
    const url = `tel:${COMPANY_CONTACT.phoneE164}`;
    const supported = await Linking.canOpenURL(url).catch(() => false);
    if (!supported) {
      Alert.alert("Deep Clean", `Téléphone : ${COMPANY_CONTACT.phone}`);
      return;
    }
    await Linking.openURL(url);
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ paddingBottom: spacing.xxl + insets.bottom }}>
      {/* En-tête : photo de l'entreprise, voile marine de la charte. */}
      <View style={{ height: 300, overflow: "hidden" }}>
        <Image
          source={require("../../../assets/discover/hero.jpg")}
          style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }}
          resizeMode="cover"
          accessibilityIgnoresInvertColors
        />
        <LinearGradient
          colors={["rgba(31,45,105,0.15)", "rgba(31,45,105,0.55)", "rgba(31,45,105,0.97)"]}
          style={StyleSheet.absoluteFill}
        />
        <View style={{ flex: 1, justifyContent: "flex-end", padding: spacing.lg }}>
          <BrandEmblem size={58} />
          <Text style={[type.largeTitle, { color: "#FFFFFF", marginTop: spacing.sm }]}>Deep Clean</Text>
          <Text style={[type.overline, { color: "#BFE3F4", marginTop: spacing.xxs }]}>NETTOYAGE · CONCIERGERIE · ENTRETIEN</Text>
          <Text style={[type.callout, { color: "#FFFFFF", marginTop: spacing.sm, opacity: 0.92 }]}>
            Nettoyage haut de gamme et conciergerie à Manosque et alentours, pour les particuliers comme pour les professionnels.
          </Text>
        </View>
      </View>

      <View style={{ paddingHorizontal: spacing.lg }}>
        <Animated.View entering={FadeInUp.duration(500)} style={{ marginTop: spacing.lg }}>
          <Button label="Demander un devis" icon="document-text-outline" size="lg" onPress={() => navigation.navigate("QuoteRequest")} />
          <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm }}>
            <View style={{ flex: 1 }}>
              <Button label="Appeler" icon="call-outline" variant="secondary" onPress={() => void call()} />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                label="Écrire"
                icon="mail-outline"
                variant="secondary"
                onPress={() => void Linking.openURL(`mailto:${COMPANY_CONTACT.email}`).catch(() => Alert.alert("Deep Clean", COMPANY_CONTACT.email))}
              />
            </View>
          </View>
        </Animated.View>

        <SectionTitle overline="NOS PRESTATIONS" title="Un soin exigeant, pensé pour chaque surface" />
        {SERVICES.map((service) => (
          <Card key={service.title} padded={false} style={{ marginBottom: spacing.md, overflow: "hidden" }}>
            <Image source={service.image} style={{ width: "100%", height: 150 }} resizeMode="cover" accessibilityIgnoresInvertColors />
            <View style={{ padding: spacing.md }}>
              <Text style={[type.headline, { color: colors.ink }]}>{service.title}</Text>
              <Text style={[type.subhead, { color: colors.inkSecondary, marginTop: spacing.xxs }]}>{service.text}</Text>
            </View>
          </Card>
        ))}

        <SectionTitle overline="NOS ENGAGEMENTS" title="Cinq engagements à chaque intervention" />
        <Card>
          {COMMITMENTS.map((item, index) => (
            <View key={item.title} style={{ flexDirection: "row", alignItems: "flex-start", marginTop: index === 0 ? 0 : spacing.md }}>
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: radius.sm,
                  backgroundColor: colors.accentSoft,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name={item.icon} size={18} color={colors.accentText} />
              </View>
              <View style={{ flex: 1, marginLeft: spacing.sm }}>
                <Text style={[type.headline, { color: colors.ink }]}>{item.title}</Text>
                <Text style={[type.footnote, { color: colors.inkSecondary, marginTop: 2 }]}>{item.text}</Text>
              </View>
            </View>
          ))}
        </Card>

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

        <SectionTitle overline="ZONE D'INTERVENTION" title="Manosque et les communes alentour" />
        <Text style={[type.subhead, { color: colors.inkSecondary }]}>
          Basés à Manosque, nous intervenons chez les particuliers et les professionnels dans un rayon d'environ 20 minutes.
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: spacing.sm }}>
          {TOWNS.map((town) => (
            <View key={town} style={{ paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.accentSoft }}>
              <Text style={[type.footnote, { color: colors.accentText, fontWeight: "600" }]}>{town}</Text>
            </View>
          ))}
        </View>

        <SectionTitle overline="QUESTIONS FRÉQUENTES" title="Avant de nous confier votre intérieur" />
        {FAQ.map((item) => (
          <Card key={item.q} style={{ marginBottom: spacing.sm }}>
            <Text style={[type.headline, { color: colors.ink }]}>{item.q}</Text>
            <Text style={[type.subhead, { color: colors.inkSecondary, marginTop: spacing.xxs }]}>{item.a}</Text>
          </Card>
        ))}

        <SectionTitle overline="CONTACT" title="Parlons de votre projet" />
        <Card padded={false}>
          <ContactRow icon="call-outline" label={COMPANY_CONTACT.phone} onPress={() => void call()} />
          <ContactRow
            icon="mail-outline"
            label={COMPANY_CONTACT.email}
            onPress={() => void Linking.openURL(`mailto:${COMPANY_CONTACT.email}`).catch(() => undefined)}
          />
          <ContactRow icon="location-outline" label={COMPANY_CONTACT.address} onPress={() => void openDirectionsTo(COMPANY_CONTACT.address)} last />
        </Card>

        <View style={{ marginTop: spacing.xl }}>
          <Button label="Demander un devis" icon="document-text-outline" size="lg" onPress={() => navigation.navigate("QuoteRequest")} />
        </View>

        <PressableScale onPress={() => navigation.navigate("Login")} style={{ alignSelf: "center", marginTop: spacing.xl, padding: spacing.xs }} accessibilityRole="button">
          <Text style={[type.footnote, { color: colors.inkSecondary, textAlign: "center" }]}>
            Vous faites partie de l'équipe Deep Clean ?{" "}
            <Text style={{ color: colors.accentText, fontWeight: "600" }}>Se connecter</Text>
          </Text>
        </PressableScale>
      </View>
    </ScrollView>
  );
}

function SectionTitle({ overline, title }: { overline: string; title: string }) {
  const { colors, spacing, type } = useTheme();
  return (
    <View style={{ marginTop: spacing.xxl, marginBottom: spacing.md }}>
      <Text style={[type.overline, { color: colors.inkTertiary }]}>{overline}</Text>
      <Text style={[type.title2, { color: colors.ink, marginTop: spacing.xxs }]}>{title}</Text>
    </View>
  );
}

function ContactRow({ icon, label, onPress, last }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; last?: boolean }) {
  const { colors, spacing, type } = useTheme();
  return (
    <PressableScale onPress={onPress} accessibilityRole="button">
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.md,
          borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
        }}
      >
        <Ionicons name={icon} size={19} color={colors.accentText} />
        <Text style={[type.callout, { color: colors.ink, marginLeft: spacing.sm, flex: 1 }]}>{label}</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.inkTertiary} />
      </View>
    </PressableScale>
  );
}
