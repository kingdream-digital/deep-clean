import { View } from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Keyboard } from "lucide-react-native";
import { useAuth } from "@/auth/AuthProvider";
import { useBreakpoint, useTheme } from "@/theme/ThemeProvider";
import { PressableScale, Text } from "@/ui";
import { useAssistantSession } from "./AssistantProvider";
import { VoiceOrb } from "./VoiceOrb";
import { suggestionsFor } from "./suggestions";

/** Invitation à parler à l'assistant, en tête de l'accueil. */
export function AssistantHero() {
  const { colors, radius } = useTheme();
  const { isWide } = useBreakpoint();
  const router = useRouter();
  const { can } = useAuth();
  const { setPanelOpen, requestListen, send, prefill } = useAssistantSession();
  const examples = suggestionsFor(can, 3);

  const open = (listen: boolean) => {
    if (listen) requestListen();
    if (isWide) setPanelOpen(true);
    else router.push("/assistant");
  };

  return (
    <View style={{ borderRadius: radius.xl, overflow: "hidden", borderWidth: 1, borderColor: colors.border }}>
      <LinearGradient
        colors={colors.mode === "dark" ? ["#16204A", "#1A1630", "#2A1A16"] : ["#EEF2FF", "#F4F0FF", "#FFF2EC"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ padding: 20, gap: 16 }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
          <View style={{ flex: 1, gap: 6 }}>
            <Text variant="title3">Dites-le, c'est fait.</Text>
            <Text variant="subhead" tone="secondary">
              Un devis, une facture, une mission, une question : parlez ou écrivez, je m'occupe du reste.
            </Text>
          </View>
          <VoiceOrb size={64} listening={false} onPress={() => open(true)} label="Parler à l'assistant" />
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {examples.map((s) => (
            <PressableScale
              key={s.label}
              onPress={() => {
                if (s.mode === "send") void send(s.text, "text", "/");
                else prefill(s.text);
                open(false);
              }}
              accessibilityHint={s.mode === "send" ? "Pose la question à l'assistant" : "Ouvre l'assistant"}
              style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.mode === "dark" ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.75)", borderWidth: 1, borderColor: colors.border }}
            >
              <Text variant="footnote" weight="medium">
                {s.label}
              </Text>
            </PressableScale>
          ))}
          <PressableScale
            onPress={() => open(false)}
            accessibilityLabel="Écrire à l'assistant"
            style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill }}
          >
            <Keyboard size={15} color={colors.accentText} />
            <Text variant="footnote" weight="semibold" tone="accent">
              Écrire
            </Text>
          </PressableScale>
        </View>
      </LinearGradient>
    </View>
  );
}
