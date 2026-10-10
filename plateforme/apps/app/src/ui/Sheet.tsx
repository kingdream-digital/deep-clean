import type { ReactNode } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X } from "lucide-react-native";
import { useBreakpoint, useTheme } from "@/theme/ThemeProvider";
import { Text } from "./Text";
import { IconButton } from "./IconButton";

/**
 * Feuille modale : glisse depuis le bas sur téléphone, boîte de dialogue
 * centrée sur grand écran. Fermeture par le bouton, le fond ou la touche Échap.
 */
export function Sheet({ visible, onClose, title, subtitle, children, footer }: { visible: boolean; onClose: () => void; title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  const { colors, radius } = useTheme();
  const { isCompact } = useBreakpoint();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType={isCompact ? "slide" : "fade"} onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={{ flex: 1, justifyContent: isCompact ? "flex-end" : "center", alignItems: "center" }}>
          <Pressable accessibilityLabel="Fermer" onPress={onClose} style={{ position: "absolute", inset: 0, backgroundColor: colors.overlay } as never} />
          <View
            accessibilityViewIsModal
            style={{
              width: isCompact ? "100%" : 520,
              maxHeight: "90%",
              backgroundColor: colors.surfaceRaised,
              borderTopLeftRadius: radius.xl,
              borderTopRightRadius: radius.xl,
              borderBottomLeftRadius: isCompact ? 0 : radius.xl,
              borderBottomRightRadius: isCompact ? 0 : radius.xl,
              paddingBottom: isCompact ? insets.bottom + 12 : 20,
              shadowColor: colors.shadow,
              shadowOpacity: 0.25,
              shadowRadius: 30,
              shadowOffset: { width: 0, height: 12 },
              elevation: 12,
            }}
          >
            {isCompact ? <View style={{ alignSelf: "center", width: 40, height: 5, borderRadius: 3, backgroundColor: colors.borderStrong, marginTop: 8 }} /> : null}
            <View style={{ flexDirection: "row", alignItems: "flex-start", paddingHorizontal: 20, paddingTop: 14, gap: 8 }}>
              <View style={{ flex: 1, paddingTop: 6, gap: 2 }}>
                <Text variant="title3" accessibilityRole="header">
                  {title}
                </Text>
                {subtitle ? (
                  <Text variant="subhead" tone="secondary">
                    {subtitle}
                  </Text>
                ) : null}
              </View>
              <IconButton icon={X} label="Fermer" onPress={onClose} variant="tinted" size={36} />
            </View>
            <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} keyboardShouldPersistTaps="handled">
              {children}
            </ScrollView>
            {footer ? <View style={{ paddingHorizontal: 20, gap: 10 }}>{footer}</View> : null}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
