import React, { useEffect, useState } from "react";
import { Image, ImageSourcePropType, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
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
import { COMPANY_CONTACT, PRIVACY_URL } from "../../config/links";
import { SERVICE_TOWNS } from "../../config/serviceArea";
import { getWelcomeOffer, type WelcomeOffer } from "../../api/public.api";
import { WelcomeOfferCard } from "../../components/WelcomeOfferCard";
import { ServiceAreaChecker } from "../../components/ServiceAreaChecker";
import type { PublicStackParamList } from "../../navigation/RootNavigator";

// Accueil public de l'application — premier écran à l'ouverture, sans compte
// (règle App Store 3.2) : les particuliers, professionnels et propriétaires
// découvrent DEEP CLEAN, vérifient la zone d'intervention, profitent de
// l'offre de bienvenue en cours et demandent un devis. Les collaborateurs
// passent par « Espace équipe ». Textes et photos repris du site officiel
// (deep-clean.fr, version « La Plongée » — dossier v2/ du dépôt ; photos
// Pexels sous licence libre, voir v2/assets/photos/CREDITS.md). Rien
// d'inventé ; les comptes des collaborateurs restent créés par la RH.

const UNIVERSES: { title: string; text: string; tags: string[]; image: ImageSourcePropType }[] = [
  {
    title: "Nettoyage en profondeur",
    text: "Une remise à neuf complète, pièce par pièce : sols, surfaces, vitres et recoins retrouvent un état impeccable, digne d'un intérieur neuf.",
    tags: ["Cuisine", "Salle de bain", "Avant une vente ou un état des lieux"],
    image: require("../../../assets/discover/profondeur.jpg"),
  },
  {
    title: "Entretien régulier",
    text: "Un entretien régulier et fiable qui préserve, semaine après semaine, la qualité d'un intérieur déjà soigné.",
    tags: ["Hebdomadaire", "Ponctuel", "Selon votre rythme"],
    image: require("../../../assets/discover/entretien.jpg"),
  },
  {
    title: "Bureaux & espaces professionnels",
    text: "Des locaux irréprochables du matin au soir, pour accueillir vos clients et vos équipes dans un cadre à la hauteur de votre image.",
    tags: ["Bureaux", "Accueil", "Horaires adaptés"],
    image: require("../../../assets/discover/bureaux.jpg"),
  },
  {
    title: "Conciergerie",
    text: "Un bien impeccable entre deux séjours : suivi régulier, coordination des passages et vigilance sur l'état général du logement.",
    tags: ["Entre deux séjours", "Clés & accès", "Suivi régulier"],
    image: require("../../../assets/discover/conciergerie.jpg"),
  },
];

const SPECIFIC_CARE: { title: string; text: string; image: ImageSourcePropType }[] = [
  { title: "Canapés & fauteuils", text: "Assises traitées en profondeur, dans le respect de chaque textile.", image: require("../../../assets/discover/canape.jpg") },
  { title: "Matelas", text: "Un traitement respectueux des matières, pour un couchage plus sain.", image: require("../../../assets/discover/matelas.jpg") },
  { title: "Textiles, sols & vitres", text: "Sols retrouvés, vitres parfaitement claires, textiles ravivés.", image: require("../../../assets/discover/vitres.jpg") },
];

const METHOD = [
  { title: "Diagnostic", text: "Matériaux, textiles et points sensibles identifiés un à un avant d'intervenir." },
  { title: "Protocole adapté", text: "Produits, méthodes et intensité choisis pour chaque surface, jamais standardisés." },
  { title: "Exécution soignée", text: "Un travail méthodique, sans précipitation, du premier au dernier geste." },
  { title: "Contrôle qualité", text: "Une vérification finale avant de considérer l'intervention terminée." },
];

const COMMITMENTS: { icon: keyof typeof Ionicons.glyphMap; title: string; text: string }[] = [
  { icon: "ribbon-outline", title: "Qualité", text: "Un niveau d'exigence constant, du premier geste au contrôle final." },
  { icon: "time-outline", title: "Ponctualité", text: "Des créneaux tenus avec sérieux : votre organisation est respectée." },
  { icon: "flask-outline", title: "Produits & matériel", text: "Des produits professionnels et un matériel entretenu." },
  { icon: "people-outline", title: "Professionnalisme", text: "Une équipe discrète, formée et soigneuse." },
  { icon: "swap-horizontal-outline", title: "Flexibilité", text: "Des interventions adaptées à votre rythme et à vos imprévus." },
];

const FACTS = [
  { value: "24–48 h", label: "pour vous proposer un créneau" },
  { value: "100 %", label: "de produits professionnels" },
  { value: "RC Pro", label: "activité assurée" },
];

const FAQ = [
  {
    q: "Sous quel délai pouvez-vous intervenir ?",
    a: "Nous répondons à chaque demande sous 24 à 48 h avec une proposition de créneau, et nous nous adaptons aux besoins urgents (vente, état des lieux).",
  },
  {
    q: "Le devis est-il gratuit ?",
    a: "Oui. Décrivez votre besoin par téléphone ou via le formulaire : nous revenons vers vous avec une proposition adaptée.",
  },
  {
    q: "Êtes-vous assurés ?",
    a: "Oui, notre activité est couverte par une assurance responsabilité civile professionnelle.",
  },
  {
    q: "En quoi consiste votre volet conciergerie ?",
    a: "Un suivi régulier de votre bien : coordination des passages, attention portée aux détails entre deux séjours, vigilance sur l'état général du logement.",
  },
];

export function DiscoverScreen() {
  const { colors, spacing, radius, type } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<PublicStackParamList>>();
  const [offer, setOffer] = useState<WelcomeOffer | null>(null);

  // Offre de bienvenue réglée par la Direction : absente (ou hors ligne), la
  // carte ne s'affiche simplement pas.
  useEffect(() => {
    let alive = true;
    getWelcomeOffer()
      .then((current) => alive && setOffer(current))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  async function call() {
    const url = `tel:${COMPANY_CONTACT.phoneE164}`;
    const supported = await Linking.canOpenURL(url).catch(() => false);
    if (!supported) {
      Alert.alert("Deep Clean", `Téléphone : ${COMPANY_CONTACT.phone}`);
      return;
    }
    await Linking.openURL(url);
  }

  function write() {
    void Linking.openURL(`mailto:${COMPANY_CONTACT.email}`).catch(() => Alert.alert("Deep Clean", COMPANY_CONTACT.email));
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ paddingBottom: spacing.xxl + insets.bottom }}>
      {/* En-tête : photo du site, voile marine de la charte. */}
      <View style={{ height: 300 + insets.top, overflow: "hidden" }}>
        <Image
          source={require("../../../assets/discover/hero.jpg")}
          style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }}
          resizeMode="cover"
          accessibilityIgnoresInvertColors
        />
        <LinearGradient
          colors={["rgba(31,45,105,0.10)", "rgba(31,45,105,0.55)", "rgba(31,45,105,0.97)"]}
          style={StyleSheet.absoluteFill}
        />
        <View style={{ position: "absolute", top: insets.top + spacing.xs, right: spacing.md }}>
          <PressableScale onPress={() => navigation.navigate("Login")} accessibilityRole="button" accessibilityLabel="Espace équipe : connexion des collaborateurs">
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: spacing.sm,
                paddingVertical: 7,
                borderRadius: radius.pill,
                backgroundColor: "rgba(255,255,255,0.18)",
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: "rgba(255,255,255,0.45)",
              }}
            >
              <Ionicons name="person-circle-outline" size={17} color="#FFFFFF" />
              <Text style={[type.footnote, { color: "#FFFFFF", marginLeft: 5, fontFamily: "Inter_600SemiBold" }]}>Espace équipe</Text>
            </View>
          </PressableScale>
        </View>
        <View style={{ flex: 1, justifyContent: "flex-end", padding: spacing.lg }}>
          <BrandEmblem size={54} />
          <Text style={[type.overline, { color: "#BFE3F4", marginTop: spacing.sm }]}>MANOSQUE & ALENTOURS</Text>
          <Text style={[type.largeTitle, { color: "#FFFFFF", marginTop: spacing.xxs }]}>Le propre, en profondeur.</Text>
          <Text style={[type.callout, { color: "#FFFFFF", marginTop: spacing.xs, opacity: 0.92 }]}>
            Nettoyage, entretien et conciergerie pour les particuliers, les professionnels et les propriétaires.
          </Text>
        </View>
      </View>

      <View style={{ paddingHorizontal: spacing.lg }}>
        <Animated.View entering={FadeInUp.duration(500)} style={{ marginTop: spacing.lg }}>
          <Button label="Demander un devis gratuit" icon="document-text-outline" size="lg" onPress={() => navigation.navigate("QuoteRequest")} />
          <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm }}>
            <View style={{ flex: 1 }}>
              <Button label="Appeler" icon="call-outline" variant="secondary" onPress={() => void call()} />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="Écrire" icon="mail-outline" variant="secondary" onPress={write} />
            </View>
          </View>
        </Animated.View>

        {offer && (
          <Animated.View entering={FadeInUp.duration(500)} style={{ marginTop: spacing.lg }}>
            <WelcomeOfferCard offer={offer} onRequestQuote={() => navigation.navigate("QuoteRequest")} />
          </Animated.View>
        )}

        <View style={{ marginTop: spacing.lg }}>
          <ServiceAreaChecker onRequestQuote={() => navigation.navigate("QuoteRequest")} />
        </View>

        <SectionTitle overline="NOTRE PROMESSE" title="On ne nettoie pas en surface." />
        <Text style={[type.callout, { color: colors.inkSecondary }]}>
          Un intérieur bien entretenu se remarque. Un intérieur entretenu avec exigence se ressent : des produits professionnels, des
          gestes précis et un contrôle avant chaque départ.
        </Text>
        <View style={{ flexDirection: "row", gap: spacing.xs, marginTop: spacing.md }}>
          {FACTS.map((fact) => (
            <View key={fact.value} style={{ flex: 1, padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.accentSoft }}>
              <Text style={[type.headline, { color: colors.accentText }]}>{fact.value}</Text>
              <Text style={[type.caption, { color: colors.inkSecondary, marginTop: 2 }]}>{fact.label}</Text>
            </View>
          ))}
        </View>

        <SectionTitle overline="NOS UNIVERS" title="Quatre façons de faire briller votre intérieur" />
        {UNIVERSES.map((item) => (
          <Card key={item.title} padded={false} style={{ marginBottom: spacing.md, overflow: "hidden" }}>
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
            </View>
          </Card>
        ))}

        <Text style={[type.headline, { color: colors.ink, marginTop: spacing.sm, marginBottom: spacing.sm }]}>Et nos soins spécifiques</Text>
        {SPECIFIC_CARE.map((item) => (
          <Card key={item.title} style={{ marginBottom: spacing.sm, flexDirection: "row", alignItems: "center" }}>
            <Image source={item.image} style={{ width: 64, height: 64, borderRadius: radius.md }} resizeMode="cover" accessibilityIgnoresInvertColors />
            <View style={{ flex: 1, marginLeft: spacing.sm }}>
              <Text style={[type.headline, { color: colors.ink }]}>{item.title}</Text>
              <Text style={[type.footnote, { color: colors.inkSecondary, marginTop: 2 }]}>{item.text}</Text>
            </View>
          </Card>
        ))}

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

        <SectionTitle overline="ZONE D'INTERVENTION" title="Manosque et alentours" />
        <Text style={[type.subhead, { color: colors.inkSecondary, marginBottom: spacing.sm }]}>
          Basés à Manosque, nous intervenons chez les particuliers et les professionnels dans un rayon d'environ 20 minutes.
        </Text>
        <Card padded={false}>
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
        {FAQ.map((item) => (
          <Card key={item.q} style={{ marginBottom: spacing.sm }}>
            <Text style={[type.headline, { color: colors.ink }]}>{item.q}</Text>
            <Text style={[type.subhead, { color: colors.inkSecondary, marginTop: spacing.xxs }]}>{item.a}</Text>
          </Card>
        ))}

        <SectionTitle overline="CONTACT & DEVIS" title="Parlons de votre projet" />
        <Card padded={false}>
          <ContactRow icon="call-outline" label={COMPANY_CONTACT.phone} onPress={() => void call()} />
          <ContactRow icon="mail-outline" label={COMPANY_CONTACT.email} onPress={write} />
          <ContactRow icon="location-outline" label={COMPANY_CONTACT.address} onPress={() => void openDirectionsTo(COMPANY_CONTACT.address)} last />
        </Card>

        <View style={{ marginTop: spacing.xl }}>
          <Button label="Demander un devis gratuit" icon="document-text-outline" size="lg" onPress={() => navigation.navigate("QuoteRequest")} />
        </View>

        <PressableScale onPress={() => navigation.navigate("Login")} style={{ alignSelf: "center", marginTop: spacing.xl, padding: spacing.xs }} accessibilityRole="button">
          <Text style={[type.footnote, { color: colors.inkSecondary, textAlign: "center" }]}>
            Vous faites partie de l'équipe Deep Clean ? <Text style={{ color: colors.accentText, fontWeight: "600" }}>Espace équipe</Text>
          </Text>
        </PressableScale>
        <View style={{ flexDirection: "row", justifyContent: "center", marginTop: spacing.xs }}>
          <Pressable onPress={() => navigation.navigate("Legal")} accessibilityRole="link" hitSlop={8}>
            <Text style={[type.caption, { color: colors.inkTertiary, textDecorationLine: "underline" }]}>Mentions légales</Text>
          </Pressable>
          <Text style={[type.caption, { color: colors.inkTertiary, marginHorizontal: spacing.xs }]}>·</Text>
          <Pressable onPress={() => void Linking.openURL(PRIVACY_URL)} accessibilityRole="link" hitSlop={8}>
            <Text style={[type.caption, { color: colors.inkTertiary, textDecorationLine: "underline" }]}>Confidentialité</Text>
          </Pressable>
        </View>
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
