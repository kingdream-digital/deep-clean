import type { ReactNode } from "react";
import { RefreshControl, ScrollView, View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { useBreakpoint, useTheme } from "@/theme/ThemeProvider";
import { contentMaxWidth } from "@/theme/tokens";
import { Text } from "./Text";
import { IconButton } from "./IconButton";
import { OfflineBanner } from "./OfflineBanner";

export interface ScreenProps {
  title?: string;
  subtitle?: string | ReactNode;
  /** Titre compact avec bouton retour (écrans de détail). */
  back?: boolean | string;
  actions?: ReactNode;
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  scroll?: boolean;
  /** Barre fixée en bas (actions principales d'un formulaire). */
  footer?: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  maxWidth?: number;
  testID?: string;
}

/**
 * Gabarit d'écran : zone sûre, grand titre (accueil, listes) ou titre compact
 * avec retour (détails), contenu centré et limité en largeur sur grand écran,
 * tirer-pour-actualiser, bandeau hors connexion.
 */
export function Screen({
  title,
  subtitle,
  back,
  actions,
  children,
  refreshing = false,
  onRefresh,
  scroll = true,
  footer,
  contentStyle,
  maxWidth = contentMaxWidth,
  testID,
}: ScreenProps) {
  const { colors } = useTheme();
  const { isCompact, isWide } = useBreakpoint();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const padH = isCompact ? 16 : isWide ? 40 : 28;

  const header = title ? (
    <View style={{ gap: 4, marginBottom: back ? 4 : 8 }}>
      {back ? (
        <View style={{ flexDirection: "row", alignItems: "center", marginLeft: -10, marginBottom: 4 }}>
          <IconButton
            icon={ChevronLeft}
            label={typeof back === "string" ? `Retour à ${back}` : "Retour"}
            onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
            size={40}
          />
          {typeof back === "string" ? (
            <Text variant="callout" tone="accent" onPress={() => router.back()}>
              {back}
            </Text>
          ) : null}
        </View>
      ) : null}
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 12 }}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text variant={back ? "title1" : "display"} accessibilityRole="header" numberOfLines={3}>
            {title}
          </Text>
          {typeof subtitle === "string" ? (
            <Text variant="callout" tone="secondary">
              {subtitle}
            </Text>
          ) : (
            subtitle
          )}
        </View>
        {actions ? <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>{actions}</View> : null}
      </View>
    </View>
  ) : null;

  const body = (
    <View style={[{ width: "100%", maxWidth, alignSelf: "center", paddingHorizontal: padH, gap: 20 }, contentStyle]}>
      {header}
      {children}
    </View>
  );

  return (
    <View testID={testID} style={{ flex: 1, backgroundColor: colors.bg }}>
      <OfflineBanner />
      {scroll ? (
        <ScrollView
          contentContainerStyle={{ paddingTop: insets.top + (isCompact ? 12 : 32), paddingBottom: (footer ? 24 : 120) + insets.bottom }}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} /> : undefined
          }
        >
          {body}
        </ScrollView>
      ) : (
        <View style={{ flex: 1, paddingTop: insets.top + (isCompact ? 12 : 32) }}>{body}</View>
      )}
      {footer ? (
        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: colors.border,
            backgroundColor: colors.surface,
            paddingHorizontal: padH,
            paddingTop: 12,
            paddingBottom: insets.bottom + 12,
          }}
        >
          <View style={{ width: "100%", maxWidth, alignSelf: "center" }}>{footer}</View>
        </View>
      ) : null}
    </View>
  );
}

/** Titre de section dans un écran. */
export function SectionTitle({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: -8 }}>
      <Text variant="title3" accessibilityRole="header">
        {title}
      </Text>
      {action}
    </View>
  );
}
