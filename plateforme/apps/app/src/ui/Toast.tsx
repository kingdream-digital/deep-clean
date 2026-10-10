import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { AccessibilityInfo, Platform, View } from "react-native";
import Animated, { FadeInUp, FadeOutUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CircleCheck, CircleAlert, Info } from "lucide-react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { Text } from "./Text";
import { PressableScale } from "./PressableScale";

type ToastTone = "success" | "error" | "info";
interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
  onPress?: () => void;
}

const ToastContext = createContext<(message: string, tone?: ToastTone, onPress?: () => void) => void>(() => undefined);

/** Confirmation éphémère (« Devis envoyé »), annoncée aussi au lecteur d'écran. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const { colors, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const show = useCallback((message: string, tone: ToastTone = "success", onPress?: () => void) => {
    const id = nextId.current++;
    setItems((current) => [...current.slice(-2), { id, message, tone, onPress }]);
    AccessibilityInfo.announceForAccessibility(message);
    setTimeout(() => setItems((current) => current.filter((t) => t.id !== id)), 3800);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <View pointerEvents="box-none" style={{ position: "absolute", top: insets.top + (Platform.OS === "web" ? 16 : 8), left: 0, right: 0, alignItems: "center", gap: 8 }}>
        {items.map((item) => {
          const Icon = item.tone === "success" ? CircleCheck : item.tone === "error" ? CircleAlert : Info;
          const fg = item.tone === "success" ? colors.success : item.tone === "error" ? colors.danger : colors.accent;
          return (
            <Animated.View key={item.id} entering={FadeInUp.springify().damping(18)} exiting={FadeOutUp.duration(180)} style={{ maxWidth: 520, width: "92%" }}>
              <PressableScale
                onPress={() => {
                  item.onPress?.();
                  setItems((current) => current.filter((t) => t.id !== item.id));
                }}
                accessibilityRole="alert"
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  paddingHorizontal: 16,
                  paddingVertical: 13,
                  borderRadius: radius.lg,
                  backgroundColor: colors.surfaceRaised,
                  borderWidth: 1,
                  borderColor: colors.border,
                  shadowColor: colors.shadow,
                  shadowOpacity: colors.mode === "dark" ? 0.5 : 0.12,
                  shadowRadius: 20,
                  shadowOffset: { width: 0, height: 10 },
                  elevation: 6,
                }}
              >
                <Icon size={20} color={fg} />
                <Text variant="callout" weight="medium" style={{ flex: 1 }}>
                  {item.message}
                </Text>
              </PressableScale>
            </Animated.View>
          );
        })}
      </View>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
