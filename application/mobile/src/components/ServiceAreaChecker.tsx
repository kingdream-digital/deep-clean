import React, { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeProvider";
import { Card } from "./Card";
import { checkServiceArea, type ServiceAreaAnswer } from "../config/serviceArea";

// « Intervenez-vous chez moi ? » : réponse immédiate à partir du code postal,
// calculée sur l'appareil (rien n'est envoyé).
export function ServiceAreaChecker({ onRequestQuote }: { onRequestQuote: () => void }) {
  const { colors, spacing, radius, type } = useTheme();
  const [postalCode, setPostalCode] = useState("");
  const [answer, setAnswer] = useState<ServiceAreaAnswer | null>(null);

  function check() {
    setAnswer(checkServiceArea(postalCode));
  }

  const result =
    answer?.kind === "served"
      ? { icon: "checkmark-circle" as const, color: colors.success, text: `Bonne nouvelle : nous intervenons à ${answer.towns.join(" et ")}.` }
      : answer?.kind === "maybe"
        ? { icon: "help-circle" as const, color: colors.accentText, text: "Votre commune est peut-être dans notre zone (environ 20 minutes autour de Manosque). Demandez un devis : nous vous répondrons." }
        : answer?.kind === "outside"
          ? { icon: "information-circle" as const, color: colors.inkSecondary, text: "Vous semblez hors de notre zone habituelle (Manosque et alentours). Appelez-nous pour en parler." }
          : answer?.kind === "invalid"
            ? { icon: "alert-circle" as const, color: colors.danger, text: "Indiquez un code postal à 5 chiffres." }
            : null;

  return (
    <Card>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <View style={{ width: 36, height: 36, borderRadius: radius.sm, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="location-outline" size={18} color={colors.accentText} />
        </View>
        <View style={{ flex: 1, marginLeft: spacing.sm }}>
          <Text style={[type.headline, { color: colors.ink }]}>Intervenez-vous chez moi ?</Text>
          <Text style={[type.footnote, { color: colors.inkSecondary }]}>Réponse immédiate avec votre code postal.</Text>
        </View>
      </View>
      <View style={{ flexDirection: "row", marginTop: spacing.sm, gap: spacing.xs }}>
        <TextInput
          value={postalCode}
          onChangeText={(v) => {
            setPostalCode(v);
            setAnswer(null);
          }}
          onSubmitEditing={check}
          placeholder="Code postal"
          placeholderTextColor={colors.inkTertiary}
          keyboardType="number-pad"
          maxLength={5}
          autoComplete="postal-code"
          accessibilityLabel="Code postal"
          style={[
            type.callout,
            { flex: 1, color: colors.ink, backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: spacing.sm, paddingVertical: 10 },
          ]}
        />
        <Pressable
          onPress={check}
          accessibilityRole="button"
          style={({ pressed }) => ({ justifyContent: "center", paddingHorizontal: spacing.md, borderRadius: radius.md, backgroundColor: colors.accentFill, opacity: pressed ? 0.85 : 1 })}
        >
          <Text style={[type.callout, { color: colors.onAccent, fontFamily: "Inter_600SemiBold" }]}>Vérifier</Text>
        </Pressable>
      </View>
      {result && (
        <View style={{ flexDirection: "row", alignItems: "flex-start", marginTop: spacing.sm }}>
          <Ionicons name={result.icon} size={18} color={result.color} style={{ marginTop: 1 }} />
          <View style={{ flex: 1, marginLeft: spacing.xs }}>
            <Text style={[type.footnote, { color: colors.ink }]}>{result.text}</Text>
            {(answer?.kind === "served" || answer?.kind === "maybe") && (
              <Pressable onPress={onRequestQuote} accessibilityRole="button" hitSlop={6} style={{ marginTop: 4 }}>
                <Text style={[type.footnote, { color: colors.accentText, fontFamily: "Inter_600SemiBold" }]}>Demander un devis gratuit</Text>
              </Pressable>
            )}
          </View>
        </View>
      )}
    </Card>
  );
}
