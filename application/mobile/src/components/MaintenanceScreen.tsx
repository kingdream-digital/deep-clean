import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  ZoomIn,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { BrandEmblem, TitlePart, TITLE_RATIO } from "./BrandEmblem";
import { AnimatedWaves } from "./AnimatedWaves";
import { fontFamily } from "../theme/typography";

// Écran de maintenance (retour explicite du client) : pendant une mise à
// jour, un écran soigné aux couleurs du logo plutôt qu'une erreur — on
// s'excuse, on dit quand revenir, et l'application se rouvre toute seule
// dès que c'est fini (vérification automatique, ou bouton « Réessayer »).

export const MAINTENANCE_FALLBACK_MESSAGE =
  "Nous améliorons Deep Clean pour vous. Désolés pour la gêne occasionnée, réessayez dans quelques instants.";

/** « 14:30 » ou date ISO → « vers 14 h 30 », « demain vers 9 h », « le 16 octobre vers 8 h ». */
export function formatUntil(until: string | null, now = new Date()): string | null {
  if (!until) return null;
  const hm = /^(\d{1,2}):(\d{2})$/.exec(until);
  const hour = (h: number, m: number) => `${h} h${m ? ` ${String(m).padStart(2, "0")}` : ""}`;
  if (hm) return `Retour prévu vers ${hour(Number(hm[1]), Number(hm[2]))}`;
  const d = new Date(until);
  if (Number.isNaN(d.getTime())) return null;
  const at = hour(d.getHours(), d.getMinutes());
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(d) - day(now)) / 86_400_000);
  if (diff <= 0) return `Retour prévu vers ${at}`;
  if (diff === 1) return `Retour prévu demain vers ${at}`;
  const months = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  return `Retour prévu le ${d.getDate()} ${months[d.getMonth()]} vers ${at}`;
}

interface Props {
  message: string | null;
  until: string | null;
  onRetry: () => Promise<boolean>;
  /** Accès discret de l'admin technique, seul autorisé pendant la maintenance. */
  onAdminAccess?: () => void;
}

export function MaintenanceScreen({ message, until, onRetry, onAdminAccess }: Props) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const [checking, setChecking] = useState(false);
  const [stillDown, setStillDown] = useState(false);

  const emblem = Math.min(width * 0.36, height * 0.2, 150);
  const titleWidth = Math.min(width * 0.62, 280);
  const cardWidth = Math.min(width - 40, 440);
  const returnAt = formatUntil(until);

  // Médaillon qui flotte et émet des ondes, comme à la connexion ; barre
  // lumineuse qui balaie la carte : « on travaille ».
  const float = useSharedValue(0);
  const ripple = useSharedValue(0);
  const sweep = useSharedValue(0);
  useEffect(() => {
    if (reduced) return undefined;
    float.value = withRepeat(withSequence(withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.sin) }), withTiming(0, { duration: 2600, easing: Easing.inOut(Easing.sin) })), -1, false);
    ripple.value = withRepeat(withTiming(1, { duration: 2800, easing: Easing.out(Easing.quad) }), -1, false);
    sweep.value = withRepeat(withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.cubic) }), -1, false);
    return () => {
      cancelAnimation(float);
      cancelAnimation(ripple);
      cancelAnimation(sweep);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);
  const floatStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -6 + float.value * 12 }] }));
  const rippleStyle = useAnimatedStyle(() => ({ opacity: (1 - ripple.value) * 0.45, transform: [{ scale: 1 + ripple.value * 0.6 }] }));
  const sweepStyle = useAnimatedStyle(() => ({ transform: [{ translateX: -cardWidth * 0.4 + sweep.value * cardWidth * 1.4 }] }));

  const retry = async () => {
    setChecking(true);
    setStillDown(false);
    const reopened = await onRetry();
    setChecking(false);
    if (!reopened) setStillDown(true);
  };

  return (
    <View style={StyleSheet.absoluteFill} accessibilityViewIsModal>
      <LinearGradient colors={["#1F2D69", "#243F86", "#1E86B8"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={[styles.glow, { top: -90, left: -70, width: 260, height: 260 }]} />
      <View style={[styles.glow, { bottom: 60, right: -100, width: 320, height: 320, opacity: 0.07 }]} />

      <ScrollView
        contentContainerStyle={{ flexGrow: 1, alignItems: "center", justifyContent: "center", paddingTop: insets.top + 32, paddingBottom: insets.bottom + 96, paddingHorizontal: 20 }}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={reduced ? undefined : ZoomIn.duration(650).springify().damping(14)} style={{ width: emblem, height: emblem }}>
          <Animated.View style={[StyleSheet.absoluteFill, styles.ripple, { borderRadius: emblem / 2 }, rippleStyle]} />
          <Animated.View style={[styles.shadow, { borderRadius: emblem / 2 }, floatStyle]}>
            <BrandEmblem size={emblem} />
          </Animated.View>
        </Animated.View>

        <Animated.View entering={reduced ? undefined : FadeInDown.duration(600).delay(200)} style={{ width: titleWidth, height: titleWidth / TITLE_RATIO, marginTop: emblem * 0.18 }}>
          <View style={StyleSheet.absoluteFill}>
            <TitlePart part="deep" width={titleWidth} deepColor="#FFFFFF" />
          </View>
          <View style={StyleSheet.absoluteFill}>
            <TitlePart part="clean" width={titleWidth} cleanColor="#7FD3F2" />
          </View>
        </Animated.View>

        <Animated.View entering={reduced ? undefined : FadeInDown.duration(650).delay(380)} style={[styles.card, { width: cardWidth }]}>
          <View style={styles.badge}>
            <Ionicons name="sparkles" size={14} color="#7FD3F2" />
            <Text style={styles.badgeText}>MISE À JOUR EN COURS</Text>
          </View>

          <Text style={styles.title} accessibilityRole="header">
            On fait peau neuve
          </Text>
          <Text style={styles.message}>{message || MAINTENANCE_FALLBACK_MESSAGE}</Text>

          {returnAt && (
            <View style={styles.until}>
              <Ionicons name="time-outline" size={16} color="#FFFFFF" />
              <Text style={styles.untilText}>{returnAt}</Text>
            </View>
          )}

          <View style={styles.track}>
            <Animated.View style={[styles.sweep, { width: cardWidth * 0.4 }, reduced ? { opacity: 0.6 } : sweepStyle]}>
              <LinearGradient colors={["rgba(127,211,242,0)", "#7FD3F2", "rgba(127,211,242,0)"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
            </Animated.View>
          </View>

          <Pressable
            onPress={retry}
            disabled={checking}
            accessibilityRole="button"
            accessibilityLabel="Réessayer"
            style={({ pressed }) => [styles.button, pressed && { transform: [{ scale: 0.97 }], opacity: 0.92 }]}
          >
            {checking ? <ActivityIndicator color="#1F2D69" /> : <Ionicons name="refresh" size={18} color="#1F2D69" />}
            <Text style={styles.buttonText}>{checking ? "Vérification…" : "Réessayer"}</Text>
          </Pressable>

          {stillDown ? (
            <Animated.Text entering={FadeIn.duration(250)} style={styles.hint}>
              Encore quelques instants, merci de votre patience.
            </Animated.Text>
          ) : (
            <Text style={styles.hint}>L'application se rouvrira toute seule dès que tout sera prêt. Vos données sont en sécurité.</Text>
          )}
        </Animated.View>

        {onAdminAccess && (
          <Pressable onPress={onAdminAccess} accessibilityRole="button" hitSlop={10} style={{ marginTop: 22 }}>
            <Text style={styles.admin}>Accès administrateur technique</Text>
          </Pressable>
        )}
      </ScrollView>

      <View style={styles.waves} pointerEvents="none">
        <AnimatedWaves height={72} pageColor="rgba(255,255,255,0.10)" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  glow: { position: "absolute", borderRadius: 999, backgroundColor: "#FFFFFF", opacity: 0.06 },
  ripple: { borderWidth: 2, borderColor: "rgba(127,211,242,0.9)" },
  shadow: { shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 10 },
  card: {
    marginTop: 28,
    padding: 24,
    borderRadius: 26,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
  },
  badge: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: "rgba(127,211,242,0.14)" },
  badgeText: { color: "#7FD3F2", fontFamily: fontFamily.bold, fontSize: 11, letterSpacing: 1.2 },
  title: { color: "#FFFFFF", fontFamily: fontFamily.bold, fontSize: 26, lineHeight: 32, letterSpacing: -0.3, marginTop: 16, textAlign: "center" },
  message: { color: "rgba(255,255,255,0.86)", fontFamily: fontFamily.regular, fontSize: 16, lineHeight: 23, marginTop: 10, textAlign: "center" },
  until: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 16, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.12)" },
  untilText: { color: "#FFFFFF", fontFamily: fontFamily.semibold, fontSize: 14 },
  track: { alignSelf: "stretch", height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.14)", marginTop: 22, overflow: "hidden" },
  sweep: { height: 4 },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    alignSelf: "stretch",
    height: 52,
    marginTop: 22,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
  },
  buttonText: { color: "#1F2D69", fontFamily: fontFamily.semibold, fontSize: 16 },
  hint: { color: "rgba(255,255,255,0.7)", fontFamily: fontFamily.regular, fontSize: 13, lineHeight: 18, marginTop: 14, textAlign: "center" },
  admin: { color: "rgba(255,255,255,0.55)", fontFamily: fontFamily.medium, fontSize: 13, textDecorationLine: "underline" },
  waves: { position: "absolute", left: 0, right: 0, bottom: 0 },
});
