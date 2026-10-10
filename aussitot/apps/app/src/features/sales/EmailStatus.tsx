import { View } from "react-native";
import { CircleAlert, MailCheck, Send } from "lucide-react-native";
import type { EmailStatus as Status } from "@aussitot/shared";
import { formatInstant } from "@/lib/format";
import { useOrgTimezone } from "@/lib/today";
import { useTheme } from "@/theme/ThemeProvider";
import { Text } from "@/ui";

/** Dernier envoi par email d'un document : en file d'attente, envoyé, ou échec (avec la raison lisible). */
export function EmailStatusLine({ email }: { email: { status: Status; to: string; at: string; error: string | null } | null }) {
  const { colors, radius } = useTheme();
  const timezone = useOrgTimezone();
  if (!email) return null;
  const failed = email.status === "FAILED";
  const Icon = failed ? CircleAlert : email.status === "SENT" ? MailCheck : Send;
  const color = failed ? colors.danger : email.status === "SENT" ? colors.success : colors.textSecondary;
  const label = failed ? "Échec de l'envoi" : email.status === "SENT" ? "Envoyé" : "Envoi en cours";
  return (
    <View
      accessibilityRole={failed ? "alert" : undefined}
      style={{
        flexDirection: "row",
        gap: 10,
        alignItems: "flex-start",
        padding: 12,
        borderRadius: radius.md,
        backgroundColor: failed ? colors.dangerSoft : colors.surfaceMuted,
      }}
    >
      <Icon size={17} color={color} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="subhead" weight="semibold" style={{ color }}>
          {label} à {email.to}
        </Text>
        <Text variant="footnote" tone="secondary">
          {failed && email.error ? email.error : formatInstant(email.at, timezone)}
        </Text>
      </View>
    </View>
  );
}
