import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeProvider";
import { Button } from "./Button";

type Kind = "loading" | "empty" | "error" | "offline" | "forbidden" | "sessionExpired";

interface StateViewProps {
  kind: Kind;
  title?: string;
  message?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  retryLabel?: string;
  onRetry?: () => void;
}

// Centralise les états prévus par le cahier des charges (chargement, succès, erreur,
// aucune donnée, absence de connexion, serveur indisponible, session expirée, accès refusé)
// pour un rendu cohérent sur tout l'écran, sans jamais afficher de détail technique sensible.
const PRESETS: Record<Kind, { icon: keyof typeof Ionicons.glyphMap; title: string; message: string }> = {
  loading: { icon: "ellipsis-horizontal", title: "Chargement…", message: "" },
  empty: { icon: "file-tray-outline", title: "Rien à afficher", message: "Aucune donnée pour le moment." },
  error: {
    icon: "alert-circle-outline",
    title: "Un problème est survenu",
    message: "Réessayez dans un instant. Si le problème persiste, contactez la RH.",
  },
  offline: {
    icon: "cloud-offline-outline",
    title: "Pas de connexion",
    message: "Vérifiez votre connexion internet et réessayez.",
  },
  forbidden: {
    icon: "lock-closed-outline",
    title: "Accès refusé",
    message: "Vous n'avez pas les droits nécessaires pour consulter cette information.",
  },
  sessionExpired: {
    icon: "time-outline",
    title: "Session expirée",
    message: "Merci de vous reconnecter pour continuer.",
  },
};

export function StateView({ kind, title, message, icon, retryLabel = "Réessayer", onRetry }: StateViewProps) {
  const { colors, spacing, type } = useTheme();
  const preset = PRESETS[kind];

  if (kind === "loading") {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={[styles.center, { padding: spacing.xxl }]}>
      <Ionicons name={icon ?? preset.icon} size={40} color={colors.inkTertiary} />
      <Text style={[type.headline, { color: colors.ink, marginTop: spacing.md, textAlign: "center" }]}>
        {title ?? preset.title}
      </Text>
      <Text
        style={[
          type.subhead,
          { color: colors.inkSecondary, marginTop: spacing.xxs, textAlign: "center" },
        ]}
      >
        {message ?? preset.message}
      </Text>
      {onRetry && (
        <View style={{ marginTop: spacing.lg, width: 160 }}>
          <Button label={retryLabel} variant="secondary" onPress={onRetry} size="md" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});
