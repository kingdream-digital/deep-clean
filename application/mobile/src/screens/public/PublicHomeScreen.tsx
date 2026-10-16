import React, { useCallback, useState } from "react";
import { Image, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInUp } from "react-native-reanimated";
import { useTheme } from "../../theme/ThemeProvider";
import { Card } from "../../components/Card";
import { PressableScale } from "../../components/PressableScale";
import { BrandEmblem } from "../../components/BrandEmblem";
import { ServiceAreaChecker } from "../../components/ServiceAreaChecker";
import { listPublicNews, type PublicNews } from "../../api/public.api";
import { ABOUT, FACTS, UNIVERSES } from "./publicContent";
import { NewsCover, PublicFooter, SectionTitle, newsDate, useContactActions, usePublicNavigation } from "./publicUi";

// Accueil de l'application, premier écran à l'ouverture, pour tout le monde et
// sans compte (règle App Store 3.2) : qui est DEEP CLEAN, ce que l'entreprise
// fait, ses actualités (publiées par la RH ou la direction depuis leur
// espace), et comment la joindre. Les collaborateurs passent par
// « Espace équipe ».
export function PublicHomeScreen() {
  const { colors, spacing, radius, type } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = usePublicNavigation();
  const contact = useContactActions();
  const [news, setNews] = useState<PublicNews[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  // Actualités rechargées à chaque retour sur l'accueil ; sans réseau, la
  // section ne s'affiche simplement pas.
  const loadNews = useCallback(async () => {
    try {
      const { items } = await listPublicNews(1, 5);
      setNews(items);
    } catch {
      // Hors connexion ou serveur indisponible : le reste de l'accueil suffit.
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadNews();
    }, [loadNews])
  );

  async function refresh() {
    setRefreshing(true);
    await loadNews();
    setRefreshing(false);
  }

  const goTab = (screen: "PublicServices" | "PublicNews" | "PublicContact") => navigation.navigate("PublicTabs", { screen });
  const quickActions: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }[] = [
    { icon: "document-text-outline", label: "Devis gratuit", onPress: () => navigation.navigate("QuoteRequest") },
    { icon: "call-outline", label: "Appeler", onPress: contact.call },
    { icon: "sparkles-outline", label: "Services", onPress: () => goTab("PublicServices") },
    { icon: "navigate-outline", label: "Nous trouver", onPress: contact.directions },
  ];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingBottom: spacing.xxl }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor="#FFFFFF" />}
    >
      {/* Bandeau : photo du site officiel sous un voile marine de la charte. */}
      <View style={{ height: 360 + insets.top, overflow: "hidden" }}>
        <Image
          source={require("../../../assets/discover/hero.jpg")}
          style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }}
          resizeMode="cover"
          accessibilityIgnoresInvertColors
        />
        <LinearGradient colors={["rgba(31,45,105,0.35)", "rgba(31,45,105,0.62)", "rgba(31,45,105,0.98)"]} style={StyleSheet.absoluteFill} />
        <View style={{ flex: 1, justifyContent: "flex-end", padding: spacing.lg }}>
          <Text style={[type.overline, { color: "#BFE3F4" }]}>MANOSQUE & ALENTOURS</Text>
          <Text style={[type.largeTitle, { color: "#FFFFFF", marginTop: spacing.xxs }]}>Le propre, en profondeur.</Text>
          <Text style={[type.callout, { color: "#FFFFFF", marginTop: spacing.xs, opacity: 0.92 }]}>
            Nettoyage, entretien et conciergerie pour les particuliers, les professionnels et les propriétaires.
          </Text>
          <PressableScale onPress={() => navigation.navigate("QuoteRequest")} accessibilityRole="button" style={{ marginTop: spacing.lg }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 14, borderRadius: radius.pill, backgroundColor: "#FFFFFF" }}>
              <Ionicons name="document-text-outline" size={18} color="#1F2D69" />
              <Text style={[type.headline, { color: "#1F2D69", marginLeft: spacing.xs }]}>Demander un devis gratuit</Text>
            </View>
          </PressableScale>
        </View>
        {/* En dernier : posé au-dessus du bandeau, il reçoit bien l'appui. */}
        <View style={{ position: "absolute", top: insets.top + spacing.xs, left: spacing.lg, right: spacing.md, flexDirection: "row", alignItems: "center" }}>
          <BrandEmblem size={38} />
          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 17, color: "#FFFFFF", marginLeft: spacing.xs, letterSpacing: 0.6 }}>
            DEEP <Text style={{ color: "#7FD0EE" }}>CLEAN</Text>
          </Text>
          <View style={{ flex: 1 }} />
          <PressableScale onPress={() => navigation.navigate("Login", undefined, { pop: true })} accessibilityRole="button" accessibilityLabel="Espace équipe : connexion des collaborateurs">
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
      </View>

      <View style={{ paddingHorizontal: spacing.lg }}>
        {/* Raccourcis : ce qu'on vient faire dans l'app, en un appui. */}
        <Animated.View entering={FadeInUp.duration(450)} style={{ flexDirection: "row", justifyContent: "space-between", marginTop: spacing.lg }}>
          {quickActions.map((action) => (
            <PressableScale key={action.label} onPress={action.onPress} accessibilityRole="button" style={{ alignItems: "center", width: "24%" }}>
              <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name={action.icon} size={24} color={colors.accentText} />
              </View>
              <Text style={[type.caption, { color: colors.ink, marginTop: spacing.xs, textAlign: "center" }]} numberOfLines={1}>
                {action.label}
              </Text>
            </PressableScale>
          ))}
        </Animated.View>

        {news.length > 0 && (
          <>
            <SectionTitle overline="ACTUALITÉS" title="Les nouvelles de Deep Clean" action="Tout voir" onAction={() => goTab("PublicNews")} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -spacing.lg }} contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.sm }}>
              {news.map((item) => (
                <PressableScale key={item.id} onPress={() => navigation.navigate("PublicNewsDetail", { newsId: item.id })} accessibilityRole="button">
                  <Card padded={false} style={{ width: 260, overflow: "hidden" }}>
                    <NewsCover news={item} height={130} />
                    <View style={{ padding: spacing.md }}>
                      <Text style={[type.caption, { color: colors.inkTertiary }]}>{newsDate.format(new Date(item.publishedAt))}</Text>
                      <Text style={[type.headline, { color: colors.ink, marginTop: 2 }]} numberOfLines={2}>
                        {item.title}
                      </Text>
                    </View>
                  </Card>
                </PressableScale>
              ))}
            </ScrollView>
          </>
        )}

        <SectionTitle overline="QUI SOMMES-NOUS" title="Une entreprise de Manosque" />
        <Card>
          <Text style={[type.title3, { color: colors.ink, fontStyle: "italic" }]}>« {ABOUT.quote} »</Text>
          <Text style={[type.footnote, { color: colors.accentText, marginTop: spacing.xs, fontFamily: "Inter_600SemiBold" }]}>
            {ABOUT.author} · {ABOUT.role}
          </Text>
          {ABOUT.paragraphs.map((paragraph) => (
            <Text key={paragraph} style={[type.subhead, { color: colors.inkSecondary, marginTop: spacing.sm }]}>
              {paragraph}
            </Text>
          ))}
        </Card>
        <View style={{ flexDirection: "row", gap: spacing.xs, marginTop: spacing.sm }}>
          {FACTS.map((fact) => (
            <View key={fact.value} style={{ flex: 1, padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.accentSoft }}>
              <Text style={[type.headline, { color: colors.accentText }]}>{fact.value}</Text>
              <Text style={[type.caption, { color: colors.inkSecondary, marginTop: 2 }]}>{fact.label}</Text>
            </View>
          ))}
        </View>

        <SectionTitle overline="NOS UNIVERS" title="Ce que nous faisons" action="Détails" onAction={() => goTab("PublicServices")} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -spacing.lg }} contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.sm }}>
          {UNIVERSES.map((item) => (
            <PressableScale key={item.title} onPress={() => goTab("PublicServices")} accessibilityRole="button">
              <View style={{ width: 200, height: 240, borderRadius: radius.lg, overflow: "hidden" }}>
                <Image source={item.image} style={{ position: "absolute", width: "100%", height: "100%" }} resizeMode="cover" accessibilityIgnoresInvertColors />
                <LinearGradient colors={["rgba(31,45,105,0)", "rgba(31,45,105,0.92)"]} style={StyleSheet.absoluteFill} />
                <View style={{ flex: 1, justifyContent: "flex-end", padding: spacing.md }}>
                  <Text style={[type.headline, { color: "#FFFFFF" }]}>{item.title}</Text>
                  <Text style={[type.caption, { color: "#DDF0FA", marginTop: 2 }]} numberOfLines={1}>
                    {item.tags.join(" · ")}
                  </Text>
                </View>
              </View>
            </PressableScale>
          ))}
        </ScrollView>

        <View style={{ marginTop: spacing.xxl }}>
          <ServiceAreaChecker onRequestQuote={() => navigation.navigate("QuoteRequest")} />
        </View>

        <PublicFooter />
      </View>
    </ScrollView>
  );
}
