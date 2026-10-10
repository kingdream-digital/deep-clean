import { View } from "react-native";
import { Check, Circle } from "lucide-react-native";
import { passwordProblems, PASSWORD_MIN_LENGTH } from "@aussitot/shared";
import { useTheme } from "@/theme/ThemeProvider";
import { Text } from "@/ui";

/** Règles du mot de passe vérifiées en direct (les mêmes que celles appliquées par le serveur). */
export function passwordChecks(next: string, confirm: string, context: string[]) {
  const problems = passwordProblems(next, context);
  const checks = [
    { label: `Au moins ${PASSWORD_MIN_LENGTH} caractères`, ok: next.length >= PASSWORD_MIN_LENGTH },
    {
      label: "Assez varié (3 types de caractères) ou une phrase de 16 caractères",
      ok: next.length >= PASSWORD_MIN_LENGTH && problems.every((p) => !p.startsWith("Mélangez")),
    },
    { label: "Sans votre nom ni votre identifiant", ok: next.length > 0 && problems.every((p) => !p.startsWith("Ne doit pas")) },
    { label: "Identique dans les deux champs", ok: next.length > 0 && next === confirm },
  ];
  return { checks, valid: problems.length === 0 && next === confirm };
}

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
