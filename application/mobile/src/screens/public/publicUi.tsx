import React from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useTheme } from "../../theme/ThemeProvider";
import { PRIVACY_URL, SUPPORT_URL } from "../../config/links";
import type { PublicStackParamList } from "../../navigation/RootNavigator";

// Briques communes de l'accueil public.

export function usePublicNavigation() {
  return useNavigation<NativeStackNavigationProp<PublicStackParamList>>();
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
