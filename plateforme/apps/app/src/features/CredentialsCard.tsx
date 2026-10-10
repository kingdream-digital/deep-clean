import { useState } from "react";
import { View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { Check, Copy, ShieldAlert } from "lucide-react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { Card, PressableScale, Text } from "@/ui";
import { fonts } from "@/theme/tokens";

/**
 * Informations de connexion d'un compte qui vient d'être créé ou réinitialisé.
 * Le mot de passe temporaire n'est affiché qu'ici, une seule fois : le serveur
 * n'en garde qu'une empreinte et la personne devra le changer.
 */
export function CredentialsCard({
  organization,
  username,
  temporaryPassword,
  personName,
}: {
  organization: string;
  username: string;
  temporaryPassword: string;
  personName: string;
}) {
  const { colors, radius } = useTheme();
  return (
    <Card padding={18} elevated>
      <View style={{ gap: 14 }}>
        <View style={{ flexDirection: "row", gap: 10, padding: 12, borderRadius: radius.md, backgroundColor: colors.warningSoft }}>
          <ShieldAlert size={18} color={colors.warning} />
          <Text variant="subhead" style={{ flex: 1, color: colors.text }}>
            Transmettez ces informations à {personName} de vive voix ou par un canal sûr. Le mot de passe temporaire ne sera plus jamais
            affiché ; il devra être changé à la première connexion.
          </Text>
        </View>
        <CopyRow label="Code entreprise" value={organization} />
        <CopyRow label="Identifiant" value={username} />
        <CopyRow label="Mot de passe temporaire" value={temporaryPassword} secret />
      </View>
    </Card>
  );
}

function CopyRow({ label, value, secret }: { label: string; value: string; secret?: boolean }) {
  const { colors, radius } = useTheme();
  const [copied, setCopied] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <Text variant="overline" tone="tertiary" uppercase>
        {label}
      </Text>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          padding: 12,
          borderRadius: radius.md,
          backgroundColor: colors.surfaceMuted,
        }}
      >
        <Text
          selectable
          style={{ flex: 1, fontFamily: fonts.semibold, fontSize: secret ? 18 : 16, letterSpacing: secret ? 1 : 0, color: colors.text }}
          testID={`credential-${label}`}
        >
          {value}
        </Text>
        <PressableScale
          onPress={async () => {
            await Clipboard.setStringAsync(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
          accessibilityLabel={copied ? `${label} copié` : `Copier ${label.toLowerCase()}`}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            paddingHorizontal: 10,
            paddingVertical: 8,
            borderRadius: radius.sm,
            backgroundColor: colors.surface,
          }}
        >
          {copied ? <Check size={16} color={colors.success} /> : <Copy size={16} color={colors.textSecondary} />}
          <Text variant="footnote" weight="semibold" tone={copied ? "success" : "secondary"}>
            {copied ? "Copié" : "Copier"}
          </Text>
        </PressableScale>
      </View>
    </View>
  );
}
