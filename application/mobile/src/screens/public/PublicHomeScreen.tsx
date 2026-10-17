import React, { useRef, useState } from "react";
import {
  Image,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { useIsFocused } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PressableScale } from "../../components/PressableScale";
import { BrandWordmark } from "../../components/BrandWordmark";
import { AnimatedWaves } from "../../components/AnimatedWaves";
import { DIVE, DiveMenu } from "../../components/public/DiveMenu";
import type { PublicService } from "../../api/public.api";
import { SERVICE_TOWNS, checkServiceArea, type ServiceAreaAnswer } from "../../config/serviceArea";
import { FAQ, HOW_IT_WORKS, METHOD, SERVICE_SHEETS } from "./publicContent";
import { PublicLegalLinks, usePublicNavigation } from "./publicUi";
import { PUB } from "./publicTheme";

// Accueil de l'application, premier écran à l'ouverture, pour tout le monde et
// sans compte (règle App Store 3.2). Simple et direct (retour explicite du
// client) : ce que fait DEEP CLEAN, un service par tuile (chacun a sa page),
// et un bouton pour demander un devis, toujours à portée de pouce. L'ambiance
// de la marque (l'eau, le marine, le logo) sans reprendre le site. Les
// collaborateurs passent par « Espace équipe » (menu et bas de page).

// Questions retenues pour l'accueil (les plus utiles avant une demande).
const HOME_FAQ = FAQ.filter((item) => /délai|gratuit|assurés/i.test(item.q));

export function PublicHomeScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isFocused = useIsFocused();
  const navigation = usePublicNavigation();
  const scrollRef = useRef<ScrollView>(null);
  const anchors = useRef<Record<string, number>>({});
  const [menuOpen, setMenuOpen] = useState(false);
  const [onHero, setOnHero] = useState(true);
  const [openQuestion, setOpenQuestion] = useState<string | null>(null);

  const headerTop = insets.top + 8;
  const heroHeight = insets.top + 470;
  const tile = (width - 22 * 2 - 12) / 2;
  // Centre du bouton du menu : l'eau s'ouvre depuis lui.
  const burger = { x: width - 12 - 6 - 22, y: headerTop + 28 };

  function onScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const over = event.nativeEvent.contentOffset.y < heroHeight - 120;
    if (over !== onHero) setOnHero(over);
  }

  const anchor = (key: string) => (event: LayoutChangeEvent) => {
    anchors.current[key] = event.nativeEvent.layout.y;
  };
  function goTo(key: string) {
    setMenuOpen(false);
    const y = anchors.current[key];
    if (y !== undefined) scrollRef.current?.scrollTo({ y: Math.max(0, y - insets.top - 80), animated: true });
  }

  const openService = (service: string) => {
    setMenuOpen(false);
    navigation.navigate("PublicService", { service: service as PublicService });
  };
  const requestQuote = (service?: PublicService) => {
    setMenuOpen(false);
    navigation.navigate("QuoteRequest", service ? { service } : undefined);
  };
  const teamSpace = () => {
    setMenuOpen(false);
    // pop : revient à la connexion si elle est déjà dans la pile.
    navigation.navigate("Login", undefined, { pop: true });
  };

  return (
    <View style={{ flex: 1, backgroundColor: PUB.page }}>
      {/* Seulement à l'écran : sinon il imposerait sa barre d'état aux écrans ouverts par-dessus. */}
      {isFocused && <StatusBar style={menuOpen || onHero ? "light" : "dark"} />}
      <ScrollView
        ref={scrollRef}
        onScroll={onScroll}
        scrollEventThrottle={48}
        contentContainerStyle={{ paddingBottom: insets.bottom + 110 }}
        // Menu ouvert : la page derrière est retirée des lecteurs d'écran.
        accessibilityElementsHidden={menuOpen}
        importantForAccessibility={menuOpen ? "no-hide-descendants" : "auto"}
      >
        {/* Ouverture : l'eau de la marque, la promesse, le devis. */}
        <LinearGradient colors={[DIVE.deep, DIVE.navy, DIVE.royal]} start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 1 }} style={{ minHeight: heroHeight, paddingTop: insets.top + 96 }}>
          <View style={{ paddingHorizontal: 24 }}>
            <Text style={s.eyebrow}>MANOSQUE & ALENTOURS</Text>
            <Text style={s.heroTitle}>
              Le propre,{"\n"}
              <Text style={s.heroAccent}>en profondeur.</Text>
            </Text>
            <Text style={s.heroLead}>Nettoyage, entretien et conciergerie pour les particuliers, les professionnels et les propriétaires.</Text>
            <PressableScale onPress={() => requestQuote()} accessibilityRole="button" style={{ marginTop: 24 }}>
              <View style={s.heroButton}>
                <Text style={[s.button, { color: DIVE.navy }]}>Demander un devis gratuit</Text>
                <Ionicons name="arrow-forward" size={18} color={DIVE.navy} style={{ marginLeft: 8 }} />
              </View>
            </PressableScale>
            <View style={s.trustRow}>
              {["Devis gratuit", "Réponse sous 24–48 h", "Assurés RC Pro"].map((item) => (
                <View key={item} style={s.trust}>
                  <Ionicons name="checkmark-circle" size={14} color={DIVE.aquaGlow} />
                  <Text style={s.trustText}>{item}</Text>
                </View>
              ))}
            </View>
          </View>
          <View style={{ marginTop: 26 }}>
            <AnimatedWaves height={64} pageColor={PUB.page} />
          </View>
        </LinearGradient>

        <View style={{ paddingHorizontal: 22 }}>
          {/* Les services : une tuile par service, chacune ouvre sa page. */}
          <View onLayout={anchor("services")}>
            <Title eyebrow="NOS SERVICES" title="Que pouvons-nous faire pour vous ?" />
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
            {SERVICE_SHEETS.map((sheet) => (
              <PressableScale key={sheet.service} onPress={() => openService(sheet.service)} accessibilityRole="button" accessibilityLabel={`${sheet.title} : ${sheet.short}`}>
                <View style={[s.tile, { width: tile, height: tile * 1.18 }]}>
                  <Image source={sheet.image} style={s.fill} resizeMode="cover" accessibilityIgnoresInvertColors />
                  <LinearGradient colors={["rgba(12,18,51,0)", "rgba(12,18,51,0.25)", "rgba(12,18,51,0.9)"]} style={StyleSheet.absoluteFill} />
                  <View style={{ flex: 1, justifyContent: "flex-end", padding: 12 }}>
                    <Text style={s.tileTitle}>{sheet.title}</Text>
                    <Text style={s.tileText} numberOfLines={1}>
                      {sheet.short}
                    </Text>
                  </View>
                </View>
              </PressableScale>
            ))}
            <PressableScale onPress={() => requestQuote("Autre demande")} accessibilityRole="button">
              <View style={[s.tile, s.otherTile, { width: tile, height: tile * 1.18 }]}>
                <View style={s.otherIcon}>
                  <Ionicons name="chatbubble-ellipses-outline" size={22} color="#FFFFFF" />
                </View>
                <Text style={[s.tileTitle, { marginTop: 12 }]}>Autre demande</Text>
                <Text style={[s.tileText, { textAlign: "center" }]}>Dites-nous tout</Text>
              </View>
            </PressableScale>
          </View>

          {/* Comment ça marche */}
          <View onLayout={anchor("how")}>
            <Title eyebrow="COMMENT ÇA MARCHE" title="Votre devis en trois étapes" />
          </View>
          <View style={s.card}>
            {HOW_IT_WORKS.map((stepItem, index) => (
              <View key={stepItem.title} style={{ flexDirection: "row", marginTop: index === 0 ? 0 : 18 }}>
                <View style={{ alignItems: "center" }}>
                  <View style={s.stepNumber}>
                    <Text style={s.stepNumberText}>{index + 1}</Text>
                  </View>
                  {index < HOW_IT_WORKS.length - 1 && <View style={s.stepLine} />}
                </View>
                <View style={{ flex: 1, marginLeft: 14 }}>
                  <Text style={s.cardTitle}>{stepItem.title}</Text>
                  <Text style={[s.body, { marginTop: 2 }]}>{stepItem.text}</Text>
                </View>
              </View>
            ))}
          </View>

          {/* La méthode, à faire défiler. */}
          <Title eyebrow="NOTRE MÉTHODE" title="Une méthode, pas une routine" />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} decelerationRate="fast" snapToInterval={width * 0.72 + 12} contentContainerStyle={{ paddingHorizontal: 22, gap: 12 }}>
          {METHOD.map((m, index) => (
            <View key={m.title} style={[s.card, { width: width * 0.72, padding: 0, overflow: "hidden" }]}>
              <Image source={m.image} style={{ width: "100%", height: 150 }} resizeMode="cover" accessibilityIgnoresInvertColors />
              <View style={{ padding: 16 }}>
                <Text style={s.stepIndex}>{String(index + 1).padStart(2, "0")}</Text>
                <Text style={s.cardTitle}>{m.title}</Text>
                <Text style={[s.body, { marginTop: 4 }]}>{m.text}</Text>
              </View>
            </View>
          ))}
        </ScrollView>

        <View style={{ paddingHorizontal: 22 }}>
          {/* Zone d'intervention */}
          <View onLayout={anchor("zone")}>
            <Title eyebrow="ZONE D'INTERVENTION" title="Intervenez-vous chez moi ?" />
          </View>
          <AreaCheck onQuote={() => requestQuote()} />
          <Text style={[s.small, { marginTop: 10 }]}>
            {SERVICE_TOWNS.map((t) => t.name).join(" · ")} — environ 20 minutes autour de Manosque.
          </Text>

          {/* Quelques questions */}
          <Title eyebrow="QUESTIONS" title="Avant de demander" />
          <View style={[s.card, { paddingVertical: 4 }]}>
            {HOME_FAQ.map((item, index) => {
              const open = openQuestion === item.q;
              return (
                <Pressable
                  key={item.q}
                  onPress={() => setOpenQuestion(open ? null : item.q)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: open }}
                  style={[{ paddingVertical: 14 }, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: PUB.line }]}
                >
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Text style={[s.cardTitle, { flex: 1, marginRight: 10 }]}>{item.q}</Text>
                    <Ionicons name={open ? "remove-circle-outline" : "add-circle-outline"} size={22} color={PUB.aqua} />
                  </View>
                  {open && <Text style={[s.body, { marginTop: 8 }]}>{item.a}</Text>}
                </Pressable>
              );
            })}
          </View>

          {/* Espace équipe : à part, pour les collaborateurs. */}
          <PressableScale onPress={teamSpace} accessibilityRole="button" style={{ marginTop: 34 }}>
            <View style={s.team}>
              <Ionicons name="person-circle-outline" size={22} color={DIVE.navy} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={[s.cardTitle, { fontFamily: "Inter_700Bold" }]}>Espace équipe</Text>
                <Text style={s.small}>Vous faites partie de l'équipe Deep Clean ? Connectez-vous ici.</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={PUB.inkSoft} />
            </View>
          </PressableScale>
          <PublicLegalLinks />
        </View>
      </ScrollView>

      {/* Le devis, toujours à portée de pouce — dès que le bouton de l'ouverture n'est plus visible. */}
      {!menuOpen && !onHero && (
        <View style={[s.bar, { bottom: insets.bottom + 12 }]} pointerEvents="box-none">
          <PressableScale onPress={() => requestQuote()} accessibilityRole="button">
            <View style={s.barButton}>
              <Ionicons name="document-text-outline" size={19} color="#FFFFFF" />
              <Text style={[s.button, { color: "#FFFFFF", marginLeft: 8 }]}>Demander un devis gratuit</Text>
            </View>
          </PressableScale>
        </View>
      )}

      <DiveMenu
        open={menuOpen}
        origin={burger}
        topInset={insets.top}
        services={SERVICE_SHEETS.map((sheet) => ({ service: sheet.service, title: sheet.title }))}
        sections={[
          { key: "how", label: "Comment ça marche", icon: "help-buoy-outline" },
          { key: "zone", label: "Zone", icon: "location-outline" },
        ]}
        onService={openService}
        onQuote={() => requestQuote()}
        onSection={goTo}
        onTeamSpace={teamSpace}
        onLegal={() => {
          setMenuOpen(false);
          navigation.navigate("Legal");
        }}
        onClose={() => setMenuOpen(false)}
      />

      {/* En-tête : le logo officiel dans une pilule blanche, et le menu. */}
      <View style={[s.head, { top: headerTop }]}>
        <Pressable onPress={() => scrollRef.current?.scrollTo({ y: 0, animated: true })} accessibilityRole="button" accessibilityLabel="Deep Clean — retour en haut" style={{ flexShrink: 1 }}>
          <BrandWordmark height={width < 360 ? 28 : 34} />
        </Pressable>
        <View style={{ flex: 1 }} />
        <Pressable onPress={() => setMenuOpen((v) => !v)} accessibilityRole="button" accessibilityLabel={menuOpen ? "Fermer le menu" : "Ouvrir le menu"} style={s.burger}>
          <Ionicons name={menuOpen ? "close" : "menu"} size={22} color="#FFFFFF" />
        </Pressable>
      </View>
    </View>
  );
}

function Title({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <View style={{ marginTop: 34, marginBottom: 14 }}>
      <Text style={[s.eyebrow, { color: PUB.aquaInk }]}>{eyebrow}</Text>
      <Text style={s.title} accessibilityRole="header">
        {title}
      </Text>
    </View>
  );
}

/** « Intervenez-vous chez moi ? » : réponse calculée sur l'appareil, rien n'est envoyé. */
function AreaCheck({ onQuote }: { onQuote: () => void }) {
  const [postalCode, setPostalCode] = useState("");
  const [answer, setAnswer] = useState<ServiceAreaAnswer | null>(null);
  const text =
    answer?.kind === "served"
      ? `Bonne nouvelle : nous intervenons à ${answer.towns.join(" et ")}.`
      : answer?.kind === "maybe"
        ? "Votre commune est peut-être dans notre zone (environ 20 minutes autour de Manosque). Demandez un devis : nous vous répondrons."
        : answer?.kind === "outside"
          ? "Vous semblez hors de notre zone habituelle (Manosque et alentours)."
          : answer?.kind === "invalid"
            ? "Indiquez un code postal à 5 chiffres."
            : null;
  const ok = answer?.kind === "served" || answer?.kind === "maybe";
  return (
    <View style={s.card}>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <TextInput
          value={postalCode}
          onChangeText={(v) => {
            setPostalCode(v);
            setAnswer(null);
          }}
          onSubmitEditing={() => setAnswer(checkServiceArea(postalCode))}
          placeholder="Votre code postal"
          placeholderTextColor={PUB.inkMuted}
          keyboardType="number-pad"
          maxLength={5}
          autoComplete="postal-code"
          accessibilityLabel="Code postal"
          style={s.input}
        />
        <Pressable onPress={() => setAnswer(checkServiceArea(postalCode))} accessibilityRole="button" style={({ pressed }) => [s.check, pressed && { opacity: 0.85 }]}>
          <Text style={[s.button, { color: "#FFFFFF", fontSize: 15 }]}>Vérifier</Text>
        </Pressable>
      </View>
      {!!text && (
        <View style={{ flexDirection: "row", marginTop: 12 }}>
          <Ionicons name={ok ? "checkmark-circle" : "information-circle"} size={19} color={ok ? PUB.success : PUB.aqua} />
          <View style={{ flex: 1, marginLeft: 8 }}>
            <Text style={[s.body, { color: PUB.ink }]}>{text}</Text>
            {ok && (
              <Pressable onPress={onQuote} accessibilityRole="button" hitSlop={6} style={{ marginTop: 6 }}>
                <Text style={[s.body, { color: PUB.aquaInk, fontFamily: "Inter_700Bold" }]}>Demander un devis gratuit</Text>
              </Pressable>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  // Image plein cadre : taille explicite (sur le web, absoluteFill seul la laisse à sa hauteur naturelle).
  fill: { position: "absolute", top: 0, left: 0, width: "100%", height: "100%" },
  eyebrow: { fontFamily: "Inter_700Bold", fontSize: 11, lineHeight: 14, letterSpacing: 1.3, color: DIVE.aquaGlow },
  heroTitle: { fontFamily: "Inter_700Bold", fontSize: 42, lineHeight: 47, letterSpacing: -1.3, color: "#FFFFFF", marginTop: 10 },
  heroAccent: { fontFamily: "Inter_700Bold_Italic", color: DIVE.aquaGlow },
  heroLead: { fontFamily: "Inter_500Medium", fontSize: 16, lineHeight: 24, color: "rgba(234,246,251,0.86)", marginTop: 12 },
  heroButton: { height: 56, borderRadius: 28, flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF" },
  trustRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 16 },
  trust: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.1)" },
  trustText: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: "#FFFFFF" },
  title: { fontFamily: "Inter_700Bold", fontSize: 26, lineHeight: 31, letterSpacing: -0.6, color: PUB.ink, marginTop: 6 },
  tile: { borderRadius: 22, overflow: "hidden", backgroundColor: DIVE.navy },
  tileTitle: { fontFamily: "Inter_700Bold", fontSize: 16, lineHeight: 20, color: "#FFFFFF" },
  tileText: { fontFamily: "Inter_500Medium", fontSize: 12, lineHeight: 16, color: "rgba(234,246,251,0.85)", marginTop: 2 },
  otherTile: { alignItems: "center", justifyContent: "center", padding: 12, backgroundColor: DIVE.royal },
  otherIcon: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.14)" },
  card: { padding: 18, borderRadius: 22, backgroundColor: "#FFFFFF", shadowColor: DIVE.abyss, shadowOpacity: 0.07, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 2 },
  cardTitle: { fontFamily: "Inter_600SemiBold", fontSize: 16, lineHeight: 21, color: PUB.ink },
  body: { fontFamily: "Inter_400Regular", fontSize: 14, lineHeight: 20, color: PUB.inkSoft },
  small: { fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 17, color: PUB.inkSoft },
  button: { fontFamily: "Inter_700Bold", fontSize: 16, lineHeight: 20 },
  stepNumber: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: PUB.aquaBtn },
  stepNumberText: { fontFamily: "Inter_700Bold", fontSize: 14, color: "#FFFFFF" },
  stepLine: { width: 2, flex: 1, minHeight: 18, marginTop: 4, borderRadius: 1, backgroundColor: "#CDE9F4" },
  stepIndex: { fontFamily: "Inter_700Bold", fontSize: 12, color: PUB.aquaInk, marginBottom: 2 },
  input: { flex: 1, height: 48, paddingHorizontal: 14, borderRadius: 14, fontFamily: "Inter_500Medium", fontSize: 16, color: PUB.ink, backgroundColor: PUB.field },
  check: { height: 48, paddingHorizontal: 18, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: DIVE.navy },
  team: { flexDirection: "row", alignItems: "center", padding: 16, borderRadius: 20, borderWidth: 1, borderColor: PUB.line, backgroundColor: "#FFFFFF" },
  bar: { position: "absolute", left: 16, right: 16 },
  barButton: {
    height: 56,
    borderRadius: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: PUB.aquaBtn,
    shadowColor: DIVE.abyss,
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  head: {
    position: "absolute",
    left: 12,
    right: 12,
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 14,
    paddingRight: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.96)",
    shadowColor: DIVE.abyss,
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  burger: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: DIVE.navy },
});
