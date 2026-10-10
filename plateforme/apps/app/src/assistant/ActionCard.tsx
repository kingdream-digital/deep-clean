import { View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { CircleCheck, CircleX, ShieldCheck, Clock } from "lucide-react-native";
import type { AssistantCard, PendingActionDto } from "@aussitot/shared";
import { useTheme } from "@/theme/ThemeProvider";
import { Button, Text } from "@/ui";
import { ResultCard } from "./ResultCard";

/**
 * Demande de confirmation : l'assistant ne fait RIEN qui sorte de
 * l'entreprise ou engage légalement sans ce « oui ». Le détail montré ici
 * (destinataire, montant…) est calculé par le serveur à partir des données
 * réelles, pas par le modèle.
 */
export function ActionCard({ action, resultSummary, card, busy, onConfirm, onCancel }: { action: PendingActionDto; resultSummary?: string; card?: AssistantCard; busy?: boolean; onConfirm: () => void; onCancel: () => void }) {
  const { colors, radius } = useTheme();
  const pending = action.status === "PENDING";
  const ok = action.status === "CONFIRMED";
  const Icon = pending ? ShieldCheck : ok ? CircleCheck : action.status === "EXPIRED" ? Clock : CircleX;
  const tone = pending ? colors.accentText : ok ? colors.success : colors.textSecondary;
  return (
    <Animated.View entering={FadeInDown.duration(220)} style={{ gap: 10 }}>
      <View
        accessibilityRole={pending ? "alert" : undefined}
        style={{
          borderRadius: radius.lg,
          borderWidth: pending ? 1.5 : 1,
          borderColor: pending ? colors.accent : colors.border,
          backgroundColor: pending ? colors.accentSoft : colors.surface,
          padding: 16,
          gap: 12,
        }}
      >
        <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
          <Icon size={20} color={tone} />
          <Text variant="headline" style={{ flex: 1 }}>
            {action.title}
          </Text>
        </View>
        <View style={{ gap: 4 }}>
          {action.details.map((line) => (
            <Text key={line} variant="subhead" tone="secondary">
              {line}
            </Text>
          ))}
        </View>
        {pending ? (
          <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
            <Button label={action.confirmLabel} onPress={onConfirm} loading={busy} testID="assistant-confirm" />
            <Button label="Annuler" onPress={onCancel} variant="secondary" disabled={busy} testID="assistant-cancel" />
          </View>
        ) : (
          <Text variant="footnote" weight="semibold" style={{ color: tone }}>
            {resultSummary ?? (ok ? "Fait." : action.status === "EXPIRED" ? "Demande expirée : rien n'a été fait." : "Annulé : rien n'a été fait.")}
          </Text>
        )}
        {pending ? (
          <Text variant="caption" tone="tertiary">
            Vous pouvez aussi répondre « oui » ou « non » à la voix.
          </Text>
        ) : null}
      </View>
      {card ? <ResultCard card={card} /> : null}
    </Animated.View>
  );
}
