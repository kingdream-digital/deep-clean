import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeProvider";
import { frenchDateFormat } from "../utils/frenchDate";

interface OfflineBannerProps {
  cachedAt: string | null;
}

const timeFormatter = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });
const dayFormatter = frenchDateFormat({ day: "numeric", month: "short" });

// « à 13:47 » pour une mise à jour du jour, « le 30 sept. à 13:47 » sinon :
// une heure seule laisserait croire que des données de la veille sont du jour.
function lastUpdateLabel(cachedAt: string): string {
  const date = new Date(cachedAt);
  const time = timeFormatter.format(date);
  return date.toDateString() === new Date().toDateString() ? `à ${time}` : `le ${dayFormatter.format(date)} à ${time}`;
}

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
        {/* « données du 13:47 » se lisait mal : l'heure de la dernière mise à
            jour, dite simplement. */}
        {cachedAt ? `Hors connexion · mis à jour ${lastUpdateLabel(cachedAt)}` : "Hors connexion · données enregistrées"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: "row", alignItems: "center" },
});
