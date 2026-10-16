import React from "react";
import { Image, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useTheme } from "../../theme/ThemeProvider";
import { PressableScale } from "../../components/PressableScale";
import { BrandEmblem } from "../../components/BrandEmblem";
import { Alert } from "../../utils/alert";
import { openDirectionsTo } from "../../utils/openMaps";
import { frenchDateFormat } from "../../utils/frenchDate";
import { COMPANY_CONTACT, PRIVACY_URL, SUPPORT_URL } from "../../config/links";
import { publicNewsCoverUrl, type PublicNews } from "../../api/public.api";
import type { PublicStackParamList } from "../../navigation/RootNavigator";

// Briques communes de l'accueil public (onglets Accueil, Services,
// Actualités, Contact).

export const NAVY = "#1F2D69";
export const newsDate = frenchDateFormat({ day: "numeric", month: "long", year: "numeric" });

export function usePublicNavigation() {
  return useNavigation<NativeStackNavigationProp<PublicStackParamList>>();
}

/** Appeler, écrire, itinéraire : les trois moyens de joindre DEEP CLEAN. */
export function useContactActions() {
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
  function directions() {
    void openDirectionsTo(COMPANY_CONTACT.address);
  }
  return { call: () => void call(), write, directions };
}

/** Grand titre d'un onglet (style iOS), sous la barre d'état. */
export function TabTitle({ title, subtitle, top }: { title: string; subtitle?: string; top: number }) {
  const { colors, spacing, type } = useTheme();
  return (
    <View style={{ paddingTop: top + spacing.md, paddingBottom: spacing.sm }}>
      <Text style={[type.largeTitle, { color: colors.ink }]}>{title}</Text>
      {!!subtitle && <Text style={[type.subhead, { color: colors.inkSecondary, marginTop: spacing.xxs }]}>{subtitle}</Text>}
    </View>
  );
}

export function SectionTitle({ overline, title, action, onAction }: { overline: string; title: string; action?: string; onAction?: () => void }) {
  const { colors, spacing, type } = useTheme();
  return (
    <View style={{ marginTop: spacing.xxl, marginBottom: spacing.md, flexDirection: "row", alignItems: "flex-end" }}>
      <View style={{ flex: 1 }}>
        <Text style={[type.overline, { color: colors.inkTertiary }]}>{overline}</Text>
        <Text style={[type.title2, { color: colors.ink, marginTop: spacing.xxs }]}>{title}</Text>
      </View>
      {!!action && !!onAction && (
        <Pressable onPress={onAction} accessibilityRole="button" hitSlop={8} style={{ marginLeft: spacing.sm, marginBottom: 3 }}>
          <Text style={[type.callout, { color: colors.accentText, fontFamily: "Inter_600SemiBold" }]}>{action}</Text>
        </Pressable>
      )}
    </View>
  );
}

export function ContactRow({ icon, label, detail, onPress, last }: { icon: keyof typeof Ionicons.glyphMap; label: string; detail?: string; onPress: () => void; last?: boolean }) {
  const { colors, spacing, radius, type } = useTheme();
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
        <View style={{ width: 34, height: 34, borderRadius: radius.sm, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name={icon} size={17} color={colors.accentText} />
        </View>
        <View style={{ flex: 1, marginLeft: spacing.sm }}>
          <Text style={[type.callout, { color: colors.ink }]}>{label}</Text>
          {!!detail && <Text style={[type.footnote, { color: colors.inkTertiary }]}>{detail}</Text>}
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.inkTertiary} />
      </View>
    </PressableScale>
  );
}

/** Mentions légales, confidentialité, assistance — accessibles sans compte. */
export function PublicLegalLinks() {
  const { colors, spacing, type } = useTheme();
  const navigation = usePublicNavigation();
  const links = [
    { label: "Mentions légales", open: () => navigation.navigate("Legal") },
    { label: "Confidentialité", open: () => void Linking.openURL(PRIVACY_URL) },
    { label: "Assistance", open: () => void Linking.openURL(SUPPORT_URL) },
  ];
  return (
    <View style={{ flexDirection: "row", justifyContent: "center", flexWrap: "wrap", marginTop: spacing.sm }}>
      {links.map((link, i) => (
        <React.Fragment key={link.label}>
          {i > 0 && <Text style={[type.caption, { color: colors.inkTertiary, marginHorizontal: spacing.xs }]}>·</Text>}
          <Pressable onPress={link.open} accessibilityRole="link" hitSlop={8}>
            <Text style={[type.caption, { color: colors.inkTertiary, textDecorationLine: "underline" }]}>{link.label}</Text>
          </Pressable>
        </React.Fragment>
      ))}
    </View>
  );
}

/** Bas de page des onglets publics : accès des collaborateurs + mentions. */
export function PublicFooter() {
  const { colors, spacing, type } = useTheme();
  const navigation = usePublicNavigation();
  return (
    <View style={{ marginTop: spacing.xxl, alignItems: "center" }}>
      <PressableScale onPress={() => navigation.navigate("Login", undefined, { pop: true })} accessibilityRole="button" style={{ padding: spacing.xs }}>
        <Text style={[type.footnote, { color: colors.inkSecondary, textAlign: "center" }]}>
          Vous faites partie de l'équipe Deep Clean ? <Text style={{ color: colors.accentText, fontWeight: "600" }}>Espace équipe</Text>
        </Text>
      </PressableScale>
      <PublicLegalLinks />
    </View>
  );
}

/** Visuel d'une actualité : sa photo, sinon un dégradé de la charte avec le médaillon. */
export function NewsCover({ news, height }: { news: PublicNews; height: number }) {
  if (news.hasCoverPhoto) {
    return (
      <Image
        source={{ uri: publicNewsCoverUrl(news.id) }}
        style={{ width: "100%", height, backgroundColor: "#E4E9F0" }}
        resizeMode="cover"
        accessibilityIgnoresInvertColors
      />
    );
  }
  return (
    <LinearGradient colors={["#1E9CC6", "#2A4F8E", NAVY]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: "100%", height, alignItems: "center", justifyContent: "center" }}>
      <View style={{ opacity: 0.95 }}>
        <BrandEmblem size={Math.min(64, height * 0.45)} />
      </View>
    </LinearGradient>
  );
}
