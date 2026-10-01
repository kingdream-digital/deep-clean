import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeIn } from "react-native-reanimated";
import { useTheme } from "../theme/ThemeProvider";
import type { Palette } from "../theme/colors";
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

// Pastille teintée derrière l'icône (comme les écrans vides d'iOS) : un
// écran vide se reconnaît d'un coup d'œil — bleu pour « rien ici », rouge
// pour une erreur, orange hors connexion — au lieu d'une icône grise isolée.
function badgeColors(kind: Kind, colors: Palette): { fg: string; bg: string } {
  switch (kind) {
    case "error":
      return { fg: colors.danger, bg: colors.dangerSoft };
    case "offline":
      return { fg: colors.warning, bg: colors.warningSoft };
    case "sessionExpired":
      return { fg: colors.info, bg: colors.infoSoft };
    case "forbidden":
      return { fg: colors.inkSecondary, bg: colors.surfaceAlt };
    default:
      return { fg: colors.accentText, bg: colors.accentSoft };
  }
}

export function StateView({ kind, title, message, icon, retryLabel = "Réessayer", onRetry }: StateViewProps) {
  const { colors, spacing, type } = useTheme();
  const preset = PRESETS[kind];

  // État vide sans titre dédié : la phrase propre à l'écran (« Aucun compte
  // pour le moment. ») devient le titre. Avant, chaque écran vide affichait
  // un « Rien à afficher » générique, suivi de la même idée en plus petit.
  // Une deuxième phrase éventuelle (« Créez d'abord un chantier. ») reste en
  // dessous, comme explication.
  let heading = title ?? preset.title;
  let body = message ?? preset.message;
  if (kind === "empty" && !title && message) {
    const cut = message.indexOf(". ");
    heading = (cut === -1 ? message : message.slice(0, cut)).replace(/\.$/, "");
    body = cut === -1 ? "" : message.slice(cut + 2);
  }

  const badge = badgeColors(kind, colors);

  if (kind === "loading") {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <Animated.View entering={FadeIn.duration(220)} style={[styles.center, { padding: spacing.xxl }]}>
      <View style={[styles.badge, { backgroundColor: badge.bg }]}>
        <Ionicons name={icon ?? preset.icon} size={34} color={badge.fg} />
      </View>
      <Text style={[type.headline, { color: colors.ink, marginTop: spacing.lg, textAlign: "center" }]}>
        {heading}
      </Text>
      {body ? (
        <Text
          style={[
            type.subhead,
            { color: colors.inkSecondary, marginTop: spacing.xxs, textAlign: "center", maxWidth: 320 },
          ]}
        >
          {body}
        </Text>
      ) : null}
      {onRetry && (
        <View style={{ marginTop: spacing.lg, width: 160 }}>
          <Button label={retryLabel} variant="secondary" onPress={onRetry} size="md" />
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  badge: { width: 76, height: 76, borderRadius: 38, alignItems: "center", justifyContent: "center" },
});
