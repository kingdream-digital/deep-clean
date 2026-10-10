import { View } from "react-native";
import { Check, Circle } from "lucide-react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { Text } from "@/ui";

export { passwordChecks } from "./password";

export function PasswordChecklist({ checks }: { checks: { label: string; ok: boolean }[] }) {
  const { colors, radius } = useTheme();
  return (
    <View
      style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 10 }}
      accessibilityLabel="Règles du mot de passe"
    >
      {checks.map((c) => (
        <View
          key={c.label}
          style={{ flexDirection: "row", gap: 10, alignItems: "center" }}
          accessibilityLabel={`${c.label} : ${c.ok ? "respecté" : "pas encore"}`}
        >
          {c.ok ? <Check size={16} color={colors.success} strokeWidth={2.8} /> : <Circle size={16} color={colors.textTertiary} />}
          <Text variant="subhead" tone={c.ok ? "primary" : "secondary"} style={{ flex: 1 }}>
            {c.label}
          </Text>
        </View>
      ))}
    </View>
  );
}
