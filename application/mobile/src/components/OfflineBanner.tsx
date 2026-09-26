import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeProvider";

interface OfflineBannerProps {
  cachedAt: string | null;
}

const timeFormatter = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });

// Affiché quand un écran sert des données mises en cache faute de connexion —
// jamais silencieux : l'utilisateur doit savoir que ce qu'il voit peut être daté.
export function OfflineBanner({ cachedAt }: OfflineBannerProps) {
  const { colors, spacing, radius, type } = useTheme();

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.warningSoft, borderRadius: radius.md, padding: spacing.sm, marginBottom: spacing.md },
      ]}
    >
      <Ionicons name="cloud-offline-outline" size={16} color={colors.warning} />
      <Text style={[type.footnote, { color: colors.warning, marginLeft: spacing.xs, flex: 1 }]}>
        Hors connexion — données du {cachedAt ? timeFormatter.format(new Date(cachedAt)) : "cache local"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: "row", alignItems: "center" },
});
