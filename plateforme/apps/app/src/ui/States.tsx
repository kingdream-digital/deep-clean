import { useEffect, type ComponentType } from "react";
import { ActivityIndicator, View, type DimensionValue } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming, FadeIn } from "react-native-reanimated";
import { CloudOff, Inbox, ShieldAlert, TriangleAlert, type LucideProps } from "lucide-react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { Text } from "./Text";
import { Button } from "./Button";
import type { ApiError } from "@/api/client";

/** État vide : une icône, un vrai titre, une phrase utile, et l'action qui débloque. */
export function EmptyState({
  icon: Icon = Inbox,
  title,
  message,
  actionLabel,
  onAction,
  tone = "accent",
}: {
  icon?: ComponentType<LucideProps>;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  tone?: "accent" | "warning" | "danger" | "spark";
}) {
  const { colors } = useTheme();
  const [bg, fg] = {
    accent: [colors.accentSoft, colors.accentText],
    warning: [colors.warningSoft, colors.warning],
    danger: [colors.dangerSoft, colors.danger],
    spark: [colors.sparkSoft, colors.sparkText],
  }[tone];
  return (
    <Animated.View entering={FadeIn.duration(220)} style={{ alignItems: "center", paddingVertical: 40, paddingHorizontal: 24, gap: 10 }}>
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: 18,
          backgroundColor: bg,
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 6,
        }}
      >
        <Icon size={26} color={fg} strokeWidth={2} />
      </View>
      <Text variant="title3" align="center" accessibilityRole="header">
        {title}
      </Text>
      {message ? (
        <Text variant="callout" tone="secondary" align="center" style={{ maxWidth: 420 }}>
          {message}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} variant="secondary" style={{ marginTop: 8, alignSelf: "center" }} />
      ) : null}
    </Animated.View>
  );
}

/** Erreur : message compréhensible, jamais de détail technique, et « Réessayer ». */
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const apiError = error as ApiError | undefined;
  const offline = apiError?.code === "NETWORK";
  const forbidden = apiError?.status === 403;
  return (
    <EmptyState
      icon={offline ? CloudOff : forbidden ? ShieldAlert : TriangleAlert}
      tone={offline ? "warning" : "danger"}
      title={offline ? "Pas de connexion" : forbidden ? "Accès refusé" : "Un problème est survenu"}
      message={offline ? "Vérifiez votre connexion internet, puis réessayez." : (apiError?.message ?? "Réessayez dans un instant.")}
      actionLabel={onRetry && !forbidden ? "Réessayer" : undefined}
      onAction={onRetry}
    />
  );
}

export function LoadingState({ label = "Chargement…" }: { label?: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ paddingVertical: 48, alignItems: "center", gap: 12 }} accessibilityLabel={label} accessibilityRole="progressbar">
      <ActivityIndicator color={colors.accent} />
      <Text variant="footnote" tone="tertiary">
        {label}
      </Text>
    </View>
  );
}

/** Squelette de chargement (respire doucement, immobile si mouvements réduits). */
export function Skeleton({ width = "100%", height = 16, radius = 8 }: { width?: DimensionValue; height?: number; radius?: number }) {
  const { colors, reduceMotion } = useTheme();
  const opacity = useSharedValue(0.55);
  useEffect(() => {
    if (!reduceMotion) opacity.value = withRepeat(withTiming(1, { duration: 750 }), -1, true);
  }, [opacity, reduceMotion]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[{ width, height, borderRadius: radius, backgroundColor: colors.surfaceMuted }, style]} />;
}

export function SkeletonList({ rows = 4 }: { rows?: number }) {
  const { colors, radius } = useTheme();
  return (
    <View
      style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 18 }}
      accessibilityLabel="Chargement"
    >
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
          <Skeleton width={34} height={34} radius={10} />
          <View style={{ flex: 1, gap: 8 }}>
            <Skeleton width="60%" height={13} />
            <Skeleton width="35%" height={11} />
          </View>
        </View>
      ))}
    </View>
  );
}
