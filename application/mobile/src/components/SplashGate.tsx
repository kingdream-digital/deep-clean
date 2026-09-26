import React from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import { LogoMark } from "./LogoMark";

// Affiché pendant la restauration de session au démarrage (lecture du refresh
// token sécurisé + vérification auprès du serveur).
export function SplashGate() {
  const { colors, spacing } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LogoMark size={64} />
      <View style={{ height: spacing.xl }} />
      <ActivityIndicator color={colors.accent} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center" },
});
