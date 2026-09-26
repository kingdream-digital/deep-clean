import React from "react";
import { Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ScreenContainer } from "./ScreenContainer";
import { StateView } from "./StateView";
import { useTheme } from "../theme/ThemeProvider";

interface ComingSoonScreenProps {
  title: string;
  message: string;
  icon: keyof typeof Ionicons.glyphMap;
}

// Écran-gabarit pour les modules dont la structure de navigation est posée
// mais dont les fonctionnalités seront développées dans une prochaine itération.
export function ComingSoonScreen({ title, message, icon }: ComingSoonScreenProps) {
  const { colors, spacing, type } = useTheme();

  return (
    <ScreenContainer>
      <Text style={[type.largeTitle, { color: colors.ink, marginTop: spacing.lg }]}>{title}</Text>
      <StateView kind="empty" icon={icon} title="Bientôt disponible" message={message} />
    </ScreenContainer>
  );
}
