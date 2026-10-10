import { View } from "react-native";
import { useRouter } from "expo-router";
import { Compass } from "lucide-react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { EmptyState } from "@/ui";

export default function NotFound() {
  const { colors } = useTheme();
  const router = useRouter();
  return (
    <View style={{ flex: 1, justifyContent: "center", backgroundColor: colors.bg }}>
      <EmptyState
        icon={Compass}
        title="Page introuvable"
        message="Ce lien ne mène nulle part, ou l'élément n'existe plus."
        actionLabel="Revenir à l'accueil"
        onAction={() => router.replace("/")}
      />
    </View>
  );
}
