import { useEffect, useState } from "react";
import { View } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { CloudOff } from "lucide-react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { Text } from "./Text";

/** Bandeau hors connexion : les données déjà chargées restent consultables. */
export function OfflineBanner() {
  const { colors } = useTheme();
  const [offline, setOffline] = useState(false);
  useEffect(() => NetInfo.addEventListener((state) => setOffline(state.isConnected === false)), []);
  if (!offline) return null;
  return (
    <View accessibilityRole="alert" style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 8, paddingHorizontal: 16, backgroundColor: colors.warningSoft }}>
      <CloudOff size={16} color={colors.warning} />
      <Text variant="footnote" tone="warning" weight="semibold">
        Hors connexion — affichage des dernières données chargées
      </Text>
    </View>
  );
}
