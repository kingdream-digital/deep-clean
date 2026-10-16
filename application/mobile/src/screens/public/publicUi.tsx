import React from "react";
import { Image, Linking, Pressable, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useTheme } from "../../theme/ThemeProvider";
import { BrandEmblem } from "../../components/BrandEmblem";
import { Alert } from "../../utils/alert";
import { openDirectionsTo } from "../../utils/openMaps";
import { frenchDateFormat } from "../../utils/frenchDate";
import { COMPANY_CONTACT, PRIVACY_URL, SUPPORT_URL } from "../../config/links";
import { publicNewsCoverUrl, type PublicNews } from "../../api/public.api";
import type { PublicStackParamList } from "../../navigation/RootNavigator";

// Briques communes de l'accueil public et des actualités publiques.

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

/** Mentions légales, confidentialité, assistance — accessibles sans compte. */
export function PublicLegalLinks({ tone = "light" }: { tone?: "light" | "dark" }) {
  const { colors, spacing, type } = useTheme();
  const ink = tone === "dark" ? "rgba(234,246,251,0.7)" : colors.inkTertiary;
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
          {i > 0 && <Text style={[type.caption, { color: ink, marginHorizontal: spacing.xs }]}>·</Text>}
          <Pressable onPress={link.open} accessibilityRole="link" hitSlop={8}>
            <Text style={[type.caption, { color: ink, textDecorationLine: "underline" }]}>{link.label}</Text>
          </Pressable>
        </React.Fragment>
      ))}
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
