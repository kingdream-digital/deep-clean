import React, { useCallback, useRef, useState } from "react";
import {
  Image,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { PressableScale } from "../../components/PressableScale";
import { BrandWordmark } from "../../components/BrandWordmark";
import { ServiceAreaChecker } from "../../components/ServiceAreaChecker";
import { DIVE, DIVE_ITEMS, DiveMenu } from "../../components/public/DiveMenu";
import { listPublicNews, PUBLIC_SERVICES, type PublicService, type PublicNews } from "../../api/public.api";
import { COMPANY_CONTACT } from "../../config/links";
import { SERVICE_TOWNS } from "../../config/serviceArea";
import { ABOUT, COMMITMENTS, FACTS, FAQ, METHOD, ROOMS, SPECIFIC_CARE, UNIVERSES } from "./publicContent";
import { NewsCover, PublicLegalLinks, newsDate, useContactActions, usePublicNavigation } from "./publicUi";

// Accueil de l'application, premier écran à l'ouverture, pour tout le monde et
// sans compte (règle App Store 3.2) — même « plongée » que le site officiel
// deep-clean.fr : en-tête blanc avec le logo, compteur de profondeur, menu
// « eau », et une page qui descend de la surface (clair) jusqu'au fond
// (marine). Les actualités sont publiées par la RH ou la direction depuis leur
// espace ; les collaborateurs passent par « Espace équipe » (bas du menu).

const INK = "#1F2C68";
const INK_SOFT = "#46527F";
const AQUA_BTN = "#0479A3";
const AQUA_TEXT = "#036A90";

type SectionKey = "surface" | "news" | "promesse" | "univers" | "pieces" | "methode" | "engagements" | "fondateur" | "zone" | "faq" | "contact";

// Profondeur (m) et couleur de chaque partie, comme sur le site.
const SECTIONS: Record<SectionKey, { depth: number; bg: string; dark: boolean }> = {
  surface: { depth: 0, bg: DIVE.navy, dark: true },
  news: { depth: 2, bg: "#F3FAFD", dark: false },
  promesse: { depth: 4, bg: "#CBE9F4", dark: false },
  univers: { depth: 8, bg: "#EAF6FB", dark: false },
  pieces: { depth: 14, bg: "#D3ECF6", dark: false },
  methode: { depth: 20, bg: DIVE.royal, dark: true },
  engagements: { depth: 26, bg: DIVE.navy, dark: true },
  fondateur: { depth: 30, bg: DIVE.navy, dark: true },
  zone: { depth: 34, bg: DIVE.abyss, dark: true },
  faq: { depth: 41, bg: DIVE.abyss, dark: true },
  contact: { depth: 44, bg: DIVE.deep, dark: true },
};

export function PublicHomeScreen() {
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isFocused = useIsFocused();
  const navigation = usePublicNavigation();
  const contact = useContactActions();
  const scrollRef = useRef<ScrollView>(null);
  const positions = useRef<Partial<Record<SectionKey, number>>>({});
  const [news, setNews] = useState<PublicNews[]>([]);
  const [depth, setDepth] = useState(0);
  const [darkNow, setDarkNow] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [room, setRoom] = useState(ROOMS[0]!.name);
  const [openQuestion, setOpenQuestion] = useState<string | null>(FAQ[0]?.q ?? null);

  const headerTop = insets.top + 8;
  const headerBottom = headerTop + 56;
  // Centre du bouton du menu : l'eau s'ouvre depuis lui.
  const burger = { x: windowWidth - 12 - 6 - 22, y: headerTop + 28 };
  const logoHeight = windowWidth < 360 ? 28 : 34;

  // Actualités rechargées à chaque retour sur l'accueil ; sans réseau, la
  // partie ne s'affiche simplement pas.
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      listPublicNews(1, 6)
        .then(({ items }) => alive && setNews(items))
        .catch(() => undefined);
      return () => {
        alive = false;
      };
    }, [])
  );

  const track = (key: SectionKey) => (event: LayoutChangeEvent) => {
    positions.current[key] = event.nativeEvent.layout.y;
  };

  // Compteur de profondeur : interpolé entre les parties, sous l'en-tête.
  function onScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const probe = event.nativeEvent.contentOffset.y + headerBottom;
    const marks = (Object.keys(SECTIONS) as SectionKey[])
      .filter((key) => positions.current[key] !== undefined)
      .map((key) => ({ key, y: positions.current[key]!, ...SECTIONS[key] }))
      .sort((a, b) => a.y - b.y);
    let index = 0;
    while (index + 1 < marks.length && marks[index + 1]!.y <= probe) index++;
    const current = marks[index];
    if (!current) return;
    const next = marks[index + 1];
    const value = next ? current.depth + ((next.depth - current.depth) * Math.max(0, probe - current.y)) / Math.max(1, next.y - current.y) : current.depth;
    const rounded = Math.round(value);
    if (rounded !== depth) setDepth(rounded);
    if (current.dark !== darkNow) setDarkNow(current.dark);
  }

  function goTo(key: string) {
    setMenuOpen(false);
    if (key === "news" && news.length === 0) {
      navigation.navigate("PublicNews");
      return;
    }
    const y = positions.current[key as SectionKey];
    if (y === undefined) return;
    scrollRef.current?.scrollTo({ y: key === "surface" ? 0 : Math.max(0, y - headerBottom + 1), animated: true });
  }

  const requestQuote = (service?: PublicService) => {
    setMenuOpen(false);
    navigation.navigate("QuoteRequest", service ? { service } : undefined);
  };
  const teamSpace = () => {
    setMenuOpen(false);
    // pop : revient à la connexion si elle est déjà dans la pile.
    navigation.navigate("Login", undefined, { pop: true });
  };
  const currentRoom = ROOMS.find((r) => r.name === room) ?? ROOMS[0]!;

  return (
    <View style={{ flex: 1, backgroundColor: DIVE.deep }}>
      {/* Seulement à l'écran : sinon il imposerait sa barre d'état aux écrans ouverts par-dessus. */}
      {isFocused && <StatusBar style={menuOpen || darkNow ? "light" : "dark"} />}
      <ScrollView
        ref={scrollRef}
        onScroll={onScroll}
        scrollEventThrottle={32}
        style={{ flex: 1, backgroundColor: "#F3FAFD" }}
        contentContainerStyle={{ backgroundColor: DIVE.deep }}
        // Menu ouvert : la page derrière est retirée des lecteurs d'écran.
        accessibilityElementsHidden={menuOpen}
        importantForAccessibility={menuOpen ? "no-hide-descendants" : "auto"}
      >
        {/* SURFACE — photo du site sous un voile marine. */}
        <View onLayout={track("surface")} style={{ height: Math.max(560, windowHeight * 0.82), overflow: "hidden", backgroundColor: DIVE.navy }}>
          <Image source={require("../../../assets/discover/hero.jpg")} style={s.fill} resizeMode="cover" accessibilityIgnoresInvertColors />
          <LinearGradient colors={["rgba(12,18,51,0.30)", "rgba(31,44,104,0.55)", "rgba(12,18,51,0.96)"]} style={StyleSheet.absoluteFill} />
          <View style={{ flex: 1, justifyContent: "flex-end", paddingHorizontal: 22, paddingBottom: 26 }}>
            <Text style={[s.overline, { color: DIVE.aquaGlow }]}>MANOSQUE & ALENTOURS</Text>
            <Text style={s.heroTitle}>Le propre,{"\n"}en profondeur.</Text>
            <Text style={[s.lead, { color: "rgba(255,255,255,0.9)", marginTop: 10 }]}>
              Nettoyage, entretien et conciergerie pour les particuliers, les professionnels et les propriétaires — à Manosque et dans les communes alentour.
            </Text>
            <View style={{ flexDirection: "row", gap: 6, marginTop: 14 }}>
              {["Particuliers", "Professionnels", "Propriétaires"].map((who) => (
                <View key={who} style={s.heroChip}>
                  <Text style={s.heroChipText}>{who}</Text>
                </View>
              ))}
            </View>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 20 }}>
              <PrimaryButton label="Demander un devis gratuit" icon="document-text-outline" onPress={() => requestQuote()} style={{ flex: 1 }} />
              <PressableScale onPress={contact.call} accessibilityRole="button" accessibilityLabel={`Appeler le ${COMPANY_CONTACT.phone}`}>
                <View style={s.heroCall}>
                  <Ionicons name="call" size={20} color="#FFFFFF" />
                </View>
              </PressableScale>
            </View>
            <Pressable onPress={() => goTo("promesse")} accessibilityRole="button" style={{ alignSelf: "center", alignItems: "center", marginTop: 22 }}>
              <Text style={[s.overline, { color: "rgba(255,255,255,0.75)" }]}>PLONGEZ</Text>
              <Ionicons name="chevron-down" size={18} color="rgba(255,255,255,0.75)" />
            </Pressable>
          </View>
        </View>

        {/* ACTUALITÉS — publiées par la RH ou la direction. */}
        {news.length > 0 && (
          <Section k="news" prev={SECTIONS.surface.bg} onLayout={track("news")}>
            <Heading overline="ACTUALITÉS" title="Les nouvelles de Deep Clean" action="Tout voir" onAction={() => navigation.navigate("PublicNews")} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -22 }} contentContainerStyle={{ paddingHorizontal: 22, gap: 12 }}>
              {news.map((item) => (
                <PressableScale key={item.id} onPress={() => navigation.navigate("PublicNewsDetail", { newsId: item.id })} accessibilityRole="button">
                  <View style={[s.lightCard, { width: 260, overflow: "hidden", padding: 0 }]}>
                    <NewsCover news={item} height={130} />
                    <View style={{ padding: 14 }}>
                      <Text style={[s.caption, { color: INK_SOFT }]}>{newsDate.format(new Date(item.publishedAt))}</Text>
                      <Text style={[s.cardTitle, { color: INK, marginTop: 2 }]} numberOfLines={2}>
                        {item.title}
                      </Text>
                    </View>
                  </View>
                </PressableScale>
              ))}
            </ScrollView>
          </Section>
        )}

        {/* NOTRE PROMESSE */}
        <Section k="promesse" prev={news.length > 0 ? SECTIONS.news.bg : SECTIONS.surface.bg} onLayout={track("promesse")}>
          <Heading overline="NOTRE PROMESSE" title="On ne nettoie pas en surface." />
          <Text style={[s.lead, { color: INK_SOFT }]}>
            Un intérieur bien entretenu se remarque. Un intérieur entretenu avec exigence se ressent : des produits professionnels, des gestes précis et un contrôle avant chaque départ.
          </Text>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 18 }}>
            {FACTS.map((fact) => (
              <View key={fact.value} style={[s.lightCard, { flex: 1, padding: 12 }]}>
                <Text style={[s.cardTitle, { color: AQUA_TEXT }]}>{fact.value}</Text>
                <Text style={[s.caption, { color: INK_SOFT, marginTop: 2 }]}>{fact.label}</Text>
              </View>
            ))}
          </View>
        </Section>

        {/* NOS UNIVERS + SOINS SPÉCIFIQUES */}
        <Section k="univers" prev={SECTIONS.promesse.bg} onLayout={track("univers")}>
          <Heading overline="NOS UNIVERS" title="Quatre façons de faire briller votre intérieur" />
          <Text style={[s.lead, { color: INK_SOFT, marginBottom: 16 }]}>Une même équipe, une même méthode, un même niveau de finition — chez vous, dans vos locaux ou dans votre bien en location.</Text>
          {UNIVERSES.map((item, index) => (
            <PressableScale key={item.title} onPress={() => requestQuote(item.service)} accessibilityRole="button" style={{ marginBottom: 14 }}>
              <View style={{ height: 230, borderRadius: 22, overflow: "hidden", backgroundColor: DIVE.navy }}>
                <Image source={item.image} style={s.fill} resizeMode="cover" accessibilityIgnoresInvertColors />
                <LinearGradient colors={["rgba(12,18,51,0)", "rgba(12,18,51,0.35)", "rgba(12,18,51,0.92)"]} style={StyleSheet.absoluteFill} />
                <View style={{ flex: 1, justifyContent: "flex-end", padding: 16 }}>
                  <Text style={[s.caption, { color: DIVE.aquaGlow }]}>{String(index + 1).padStart(2, "0")}</Text>
                  <Text style={[s.h3, { color: "#FFFFFF" }]}>{item.title}</Text>
                  <Text style={[s.small, { color: "rgba(255,255,255,0.88)", marginTop: 4 }]} numberOfLines={2}>
                    {item.text}
                  </Text>
                  <View style={{ flexDirection: "row", alignItems: "center", marginTop: 10 }}>
                    <Text style={[s.small, { color: "#FFFFFF", fontFamily: "Inter_700Bold" }]}>Demander un devis</Text>
                    <Ionicons name="arrow-forward" size={14} color="#FFFFFF" style={{ marginLeft: 4 }} />
                  </View>
                </View>
              </View>
            </PressableScale>
          ))}
          <Text style={[s.h3, { color: INK, marginTop: 10, marginBottom: 10 }]}>Et nos soins spécifiques</Text>
          {SPECIFIC_CARE.map((item) => (
            <PressableScale key={item.title} onPress={() => requestQuote(item.service)} accessibilityRole="button" style={{ marginBottom: 10 }}>
              <View style={[s.lightCard, { flexDirection: "row", alignItems: "center" }]}>
                <Image source={item.image} style={{ width: 60, height: 60, borderRadius: 14 }} resizeMode="cover" accessibilityIgnoresInvertColors />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={[s.cardTitle, { color: INK }]}>{item.title}</Text>
                  <Text style={[s.small, { color: INK_SOFT, marginTop: 2 }]}>{item.text}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={INK_SOFT} />
              </View>
            </PressableScale>
          ))}
        </Section>

        {/* PIÈCE PAR PIÈCE */}
        <Section k="pieces" prev={SECTIONS.univers.bg} onLayout={track("pieces")}>
          <Heading overline="PIÈCE PAR PIÈCE" title="Jusqu'au moindre recoin" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -22 }} contentContainerStyle={{ paddingHorizontal: 22, gap: 8 }}>
            {ROOMS.map((r) => {
              const selected = r.name === room;
              return (
                <Pressable
                  key={r.name}
                  onPress={() => setRoom(r.name)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  style={[s.roomChip, selected && { backgroundColor: INK, borderColor: INK }]}
                >
                  <Ionicons name={r.icon} size={15} color={selected ? "#FFFFFF" : INK} />
                  <Text style={[s.roomChipText, { color: selected ? "#FFFFFF" : INK }]}>{r.name}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <View style={[s.lightCard, { marginTop: 12 }]}>
            {currentRoom.points.map((point, index) => (
              <View key={point.label} style={{ flexDirection: "row", alignItems: "center", marginTop: index === 0 ? 0 : 12 }}>
                <Ionicons name="checkmark-circle" size={19} color={AQUA_BTN} />
                <Text style={[s.body, { color: INK, marginLeft: 8, flex: 1 }]}>{point.label}</Text>
                {point.onQuote && <Text style={[s.caption, { color: INK_SOFT }]}>Sur devis</Text>}
              </View>
            ))}
          </View>
          <Text style={[s.caption, { color: INK_SOFT, marginTop: 8 }]}>
            Exemples de points traités lors d'un nettoyage en profondeur. Le contenu exact de chaque intervention est défini avec vous lors du devis.
          </Text>
        </Section>

        {/* NOTRE MÉTHODE — on passe sous la surface : fond sombre. */}
        <Section k="methode" prev={SECTIONS.pieces.bg} onLayout={track("methode")}>
          <Heading overline="NOTRE MÉTHODE" title="Une méthode, pas une routine" dark />
          <Text style={[s.lead, { color: DIVE.onDark, marginBottom: 16 }]}>Chaque intervention suit le même protocole, pensé pour protéger vos surfaces autant que pour les révéler.</Text>
          {METHOD.map((step, index) => (
            <View key={step.title} style={[s.darkCard, { flexDirection: "row", marginBottom: 10 }]}>
              <Text style={[s.h3, { color: DIVE.aquaGlow, width: 40 }]}>{String(index + 1).padStart(2, "0")}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[s.cardTitle, { color: "#FFFFFF" }]}>{step.title}</Text>
                <Text style={[s.small, { color: DIVE.onDark, marginTop: 3 }]}>{step.text}</Text>
              </View>
            </View>
          ))}
        </Section>

        {/* NOS ENGAGEMENTS */}
        <Section k="engagements" prev={SECTIONS.methode.bg} onLayout={track("engagements")}>
          <Heading overline="NOS ENGAGEMENTS" title="Cinq engagements qui ne changent jamais" dark />
          {COMMITMENTS.map((item) => (
            <View key={item.title} style={{ flexDirection: "row", alignItems: "flex-start", marginTop: 14 }}>
              <View style={s.darkIcon}>
                <Ionicons name={item.icon} size={18} color={DIVE.aquaGlow} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[s.cardTitle, { color: "#FFFFFF" }]}>{item.title}</Text>
                <Text style={[s.small, { color: DIVE.onDark, marginTop: 2 }]}>{item.text}</Text>
              </View>
            </View>
          ))}
        </Section>

        {/* QUI SOMMES-NOUS — le fondateur (même fond, sans vague). */}
        <View onLayout={track("fondateur")} style={{ backgroundColor: SECTIONS.fondateur.bg, paddingHorizontal: 22, paddingTop: 18, paddingBottom: 40 }}>
          <Text style={[s.overline, { color: DIVE.aquaGlow }]}>QUI SOMMES-NOUS</Text>
          <Text style={s.quote}>« {ABOUT.quote} »</Text>
          <Text style={[s.small, { color: DIVE.aquaGlow, fontFamily: "Inter_700Bold", marginTop: 12 }]}>{ABOUT.author}</Text>
          <Text style={[s.caption, { color: DIVE.onDark }]}>{ABOUT.role}</Text>
          {ABOUT.paragraphs.map((paragraph) => (
            <Text key={paragraph} style={[s.body, { color: DIVE.onDark, marginTop: 12 }]}>
              {paragraph}
            </Text>
          ))}
        </View>

        {/* ZONE D'INTERVENTION */}
        <Section k="zone" prev={SECTIONS.fondateur.bg} onLayout={track("zone")}>
          <Heading overline="ZONE D'INTERVENTION" title="Manosque et alentours" dark />
          <Text style={[s.lead, { color: DIVE.onDark, marginBottom: 16 }]}>Basés à Manosque, nous intervenons chez les particuliers et les professionnels dans un rayon d'environ 20 minutes.</Text>
          <ServiceAreaChecker onRequestQuote={() => requestQuote()} />
          <View style={[s.darkCard, { marginTop: 12, paddingVertical: 4 }]}>
            {SERVICE_TOWNS.map((town, index) => (
              <View key={town.name} style={[s.townRow, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(255,255,255,0.12)" }]}>
                <Ionicons name={index === 0 ? "home-outline" : "location-outline"} size={15} color={DIVE.aquaGlow} />
                <Text style={[s.body, { color: "#FFFFFF", marginLeft: 8, flex: 1 }]}>{town.name}</Text>
                <Text style={[s.caption, { color: DIVE.onDark }]}>{town.distance}</Text>
              </View>
            ))}
          </View>
          <Text style={[s.caption, { color: DIVE.onDark, marginTop: 8 }]}>Distances à vol d'oiseau depuis Manosque. Votre commune n'apparaît pas ? Demandez-nous.</Text>
        </Section>

        {/* QUESTIONS */}
        <View onLayout={track("faq")} style={{ backgroundColor: SECTIONS.faq.bg, paddingHorizontal: 22, paddingTop: 10, paddingBottom: 40 }}>
          <Heading overline="QUESTIONS" title="Tout savoir avant de plonger" dark />
          {FAQ.map((item) => {
            const open = openQuestion === item.q;
            return (
              <Pressable key={item.q} onPress={() => setOpenQuestion(open ? null : item.q)} accessibilityRole="button" accessibilityState={{ expanded: open }} style={[s.darkCard, { marginBottom: 10 }]}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Text style={[s.cardTitle, { color: "#FFFFFF", flex: 1 }]}>{item.q}</Text>
                  <Ionicons name={open ? "remove" : "add"} size={20} color={DIVE.aquaGlow} />
                </View>
                {open && <Text style={[s.small, { color: DIVE.onDark, marginTop: 8 }]}>{item.a}</Text>}
              </Pressable>
            );
          })}
        </View>

        {/* LE FOND — CONTACT & DEVIS */}
        <Section k="contact" prev={SECTIONS.faq.bg} onLayout={track("contact")}>
          <Heading overline="CONTACT & DEVIS" title="Parlons de votre projet" dark />
          <Text style={[s.lead, { color: DIVE.onDark, marginBottom: 16 }]}>Devis gratuit, réponse sous 24 à 48 h.</Text>
          <PrimaryButton label="Demander un devis gratuit" icon="document-text-outline" onPress={() => requestQuote()} />
          <View style={[s.darkCard, { marginTop: 12, paddingVertical: 2 }]}>
            <ContactLine icon="call-outline" label={COMPANY_CONTACT.phone} onPress={contact.call} />
            <ContactLine icon="mail-outline" label={COMPANY_CONTACT.email} onPress={contact.write} divider />
            <ContactLine icon="navigate-outline" label={COMPANY_CONTACT.address} onPress={contact.directions} divider />
          </View>
          <PressableScale onPress={teamSpace} accessibilityRole="button" style={{ marginTop: 30 }}>
            <View style={s.teamButton}>
              <Ionicons name="person-circle-outline" size={20} color="#FFFFFF" />
              <Text style={[s.cardTitle, { color: "#FFFFFF", marginLeft: 8 }]}>Espace équipe</Text>
            </View>
          </PressableScale>
          <PublicLegalLinks tone="dark" />
          <Text style={[s.caption, { color: "rgba(234,246,251,0.45)", textAlign: "center", marginTop: 14, marginBottom: insets.bottom + 8 }]}>Vous êtes au fond · −44 m</Text>
        </Section>
      </ScrollView>

      <DiveMenu
        open={menuOpen}
        origin={burger}
        topInset={insets.top}
        items={DIVE_ITEMS}
        services={PUBLIC_SERVICES}
        onSelect={goTo}
        onService={(service) => requestQuote(service as PublicService)}
        onCall={contact.call}
        onWrite={contact.write}
        onDirections={contact.directions}
        onTeamSpace={teamSpace}
        onLegal={() => {
          setMenuOpen(false);
          navigation.navigate("Legal");
        }}
        onClose={() => setMenuOpen(false)}
      />

      {/* En-tête : pilule blanche, comme le site (le logo garde ses couleurs). */}
      <View style={[s.head, { top: headerTop }]}>
        <Pressable onPress={() => goTo("surface")} accessibilityRole="button" accessibilityLabel="Deep Clean — retour en haut" style={{ flexShrink: 1 }}>
          <BrandWordmark height={logoHeight} />
        </Pressable>
        <View style={{ flex: 1 }} />
        <View style={s.depthChip} accessibilityLabel={`Profondeur ${depth} mètres`}>
          <Ionicons name="arrow-down" size={11} color={AQUA_BTN} />
          <Text style={s.depthText}>{depth} m</Text>
        </View>
        <Pressable onPress={() => setMenuOpen((v) => !v)} accessibilityRole="button" accessibilityLabel={menuOpen ? "Fermer le menu" : "Ouvrir le menu"} style={s.burger}>
          <Ionicons name={menuOpen ? "close" : "menu"} size={22} color="#FFFFFF" />
        </Pressable>
      </View>
    </View>
  );
}

function Section({ k, prev, onLayout, children }: { k: SectionKey; prev: string; onLayout: (e: LayoutChangeEvent) => void; children: React.ReactNode }) {
  const bg = SECTIONS[k].bg;
  return (
    <View onLayout={onLayout} style={{ backgroundColor: bg }}>
      <Wave from={prev} to={bg} />
      <View style={{ paddingHorizontal: 22, paddingTop: 8, paddingBottom: 40 }}>{children}</View>
    </View>
  );
}

/** Vague de passage d'une profondeur à l'autre. */
function Wave({ from, to }: { from: string; to: string }) {
  return (
    <View style={{ height: 26, backgroundColor: from }}>
      <Svg width="100%" height={26} viewBox="0 0 360 26" preserveAspectRatio="none">
        <Path d="M0 13 C 45 2, 90 2, 135 13 S 225 24, 270 13 S 335 4, 360 9 L 360 26 L 0 26 Z" fill={to} />
      </Svg>
    </View>
  );
}

function Heading({ overline, title, dark, action, onAction }: { overline: string; title: string; dark?: boolean; action?: string; onAction?: () => void }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", marginTop: 14, marginBottom: 14 }}>
      <View style={{ flex: 1 }}>
        <Text style={[s.overline, { color: dark ? DIVE.aquaGlow : AQUA_TEXT }]}>{overline}</Text>
        <Text style={[s.h2, { color: dark ? "#FFFFFF" : INK }]}>{title}</Text>
      </View>
      {!!action && !!onAction && (
        <Pressable onPress={onAction} accessibilityRole="button" hitSlop={8} style={{ marginLeft: 10, marginBottom: 4 }}>
          <Text style={[s.small, { color: AQUA_TEXT, fontFamily: "Inter_700Bold" }]}>{action}</Text>
        </Pressable>
      )}
    </View>
  );
}

function PrimaryButton({ label, icon, onPress, style }: { label: string; icon: keyof typeof Ionicons.glyphMap; onPress: () => void; style?: object }) {
  return (
    <PressableScale onPress={onPress} accessibilityRole="button" style={style}>
      <View style={s.primary}>
        <Ionicons name={icon} size={18} color="#FFFFFF" />
        <Text style={[s.cardTitle, { color: "#FFFFFF", marginLeft: 8 }]}>{label}</Text>
      </View>
    </PressableScale>
  );
}

function ContactLine({ icon, label, onPress, divider }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; divider?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [s.townRow, { paddingVertical: 14, opacity: pressed ? 0.7 : 1 }, divider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(255,255,255,0.12)" }]}>
      <Ionicons name={icon} size={18} color={DIVE.aquaGlow} />
      <Text style={[s.body, { color: "#FFFFFF", marginLeft: 10, flex: 1 }]}>{label}</Text>
      <Ionicons name="chevron-forward" size={15} color={DIVE.onDark} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  // Image plein cadre : taille explicite (sur le web, absoluteFill seul la laisse à sa hauteur naturelle).
  fill: { position: "absolute", top: 0, left: 0, width: "100%", height: "100%" },
  overline: { fontFamily: "Inter_600SemiBold", fontSize: 11, lineHeight: 14, letterSpacing: 1.2 },
  heroTitle: { fontFamily: "Inter_700Bold", fontSize: 42, lineHeight: 46, letterSpacing: -1.2, color: "#FFFFFF", marginTop: 6 },
  h2: { fontFamily: "Inter_700Bold", fontSize: 27, lineHeight: 32, letterSpacing: -0.6, marginTop: 4 },
  h3: { fontFamily: "Inter_700Bold", fontSize: 20, lineHeight: 25, letterSpacing: -0.3 },
  quote: { fontFamily: "Inter_700Bold", fontSize: 25, lineHeight: 32, letterSpacing: -0.4, color: "#FFFFFF", marginTop: 8 },
  lead: { fontFamily: "Inter_400Regular", fontSize: 16, lineHeight: 23 },
  body: { fontFamily: "Inter_400Regular", fontSize: 15, lineHeight: 21 },
  small: { fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: "Inter_500Medium", fontSize: 12, lineHeight: 16 },
  cardTitle: { fontFamily: "Inter_600SemiBold", fontSize: 16, lineHeight: 21 },
  heroChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.14)", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.35)" },
  heroChipText: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: "#FFFFFF" },
  heroCall: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.16)", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.45)" },
  primary: { height: 52, borderRadius: 26, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingHorizontal: 18, backgroundColor: AQUA_BTN },
  lightCard: { padding: 14, borderRadius: 18, backgroundColor: "#FFFFFF", shadowColor: "#121A45", shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  darkCard: { padding: 14, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.14)" },
  darkIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(79,209,242,0.12)" },
  roomChip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "rgba(31,44,104,0.12)" },
  roomChipText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  townRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 4, paddingVertical: 10 },
  teamButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", height: 50, borderRadius: 25, borderWidth: 1, borderColor: "rgba(255,255,255,0.5)" },
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
    backgroundColor: "rgba(255,255,255,0.95)",
    shadowColor: "#121A45",
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  depthChip: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, backgroundColor: "#E3F3FA", marginRight: 6 },
  depthText: { fontFamily: "Inter_700Bold", fontSize: 12, color: INK, fontVariant: ["tabular-nums"] },
  burger: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: INK },
});
