import React, { useEffect, useState } from "react";
import { BackHandler, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

// Menu de l'accueil public, dans l'ambiance « eau » de la marque : l'eau
// s'ouvre en cercle depuis le bouton du menu et des bulles remontent. Tous
// les services (chacun mène à sa page), le devis, deux repères de la page,
// puis tout en bas « Espace équipe ».

export const DIVE = {
  royal: "#184F91",
  navy: "#1F2C68",
  abyss: "#121A45",
  deep: "#0C1233",
  aquaGlow: "#4FD1F2",
  onDark: "rgba(234,246,251,0.8)",
};

interface Props {
  open: boolean;
  origin: { x: number; y: number };
  topInset: number;
  services: { service: string; title: string }[];
  sections: { key: string; label: string; icon: keyof typeof Ionicons.glyphMap }[];
  onService: (service: string) => void;
  onQuote: () => void;
  onSection: (key: string) => void;
  onTeamSpace: () => void;
  onLegal: () => void;
  onClose: () => void;
}

export function DiveMenu(props: Props) {
  const { open, origin, onClose } = props;
  const { width, height } = useWindowDimensions();
  const reduced = useReducedMotion();
  const progress = useSharedValue(0);
  const [mounted, setMounted] = useState(open);

  useEffect(() => {
    if (open) setMounted(true);
    progress.value = withTiming(
      open ? 1 : 0,
      { duration: reduced ? 180 : open ? 760 : 420, easing: Easing.out(Easing.cubic) },
      (finished) => {
        if (finished && !open) runOnJS(setMounted)(false);
      }
    );
  }, [open, reduced, progress]);

  // Retour Android : ferme le menu plutôt que de quitter l'écran.
  useEffect(() => {
    if (!open) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [open, onClose]);

  const diameter = Math.hypot(width, height) * 2.2;
  const circleStyle = useAnimatedStyle(() => ({ transform: [{ scale: Math.max(progress.value, 0.001) }] }));
  const contentStyle = useAnimatedStyle(() => ({ opacity: interpolate(progress.value, [0.45, 1], [0, 1], "clamp") }));

  if (!mounted) return null;

  return (
    // Pas d'accessibilityViewIsModal : il masquerait aussi l'en-tête et son
    // bouton « Fermer le menu » à VoiceOver. C'est la page, derrière, qui est
    // masquée pendant l'ouverture (voir PublicHomeScreen).
    <View style={StyleSheet.absoluteFill} pointerEvents={open ? "auto" : "none"} onAccessibilityEscape={onClose}>
      <Animated.View
        style={[
          { position: "absolute", width: diameter, height: diameter, borderRadius: diameter / 2, left: origin.x - diameter / 2, top: origin.y - diameter / 2, overflow: "hidden" },
          circleStyle,
        ]}
      >
        <LinearGradient colors={[DIVE.royal, DIVE.navy, DIVE.deep]} start={{ x: 0.75, y: 0.3 }} end={{ x: 0.35, y: 0.75 }} style={StyleSheet.absoluteFill} />
      </Animated.View>
      {!reduced && <Bubbles progress={progress} width={width} height={height} />}
      <Animated.View style={[StyleSheet.absoluteFill, contentStyle]}>
        <MenuContent {...props} progress={progress} />
        {/* Le texte qui défile s'efface sous l'en-tête au lieu d'y passer net. */}
        <LinearGradient colors={[DIVE.navy, "rgba(31,44,104,0)"]} style={{ position: "absolute", top: 0, left: 0, right: 0, height: props.topInset + 84 }} pointerEvents="none" />
      </Animated.View>
    </View>
  );
}

function MenuContent({ services, sections, onService, onQuote, onSection, onTeamSpace, onLegal, topInset, progress }: Props & { progress: SharedValue<number> }) {
  return (
    <ScrollView contentContainerStyle={{ paddingTop: topInset + 92, paddingHorizontal: 24, paddingBottom: 48 }} showsVerticalScrollIndicator={false}>
      <Rise index={0} progress={progress}>
        <Text style={styles.overline}>NOS SERVICES</Text>
      </Rise>
      {services.map((item, index) => (
        <Rise key={item.service} index={index + 1} progress={progress}>
          <Pressable onPress={() => onService(item.service)} accessibilityRole="link" style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}>
            <Text style={styles.link}>{item.title}</Text>
            <Ionicons name="arrow-forward" size={18} color={DIVE.aquaGlow} />
          </Pressable>
        </Rise>
      ))}

      <Rise index={services.length + 1} progress={progress}>
        <Pressable onPress={onQuote} accessibilityRole="button" style={({ pressed }) => [styles.quote, pressed && { opacity: 0.85 }]}>
          <Ionicons name="document-text-outline" size={19} color="#FFFFFF" />
          <Text style={styles.quoteText}>Demander un devis gratuit</Text>
        </Pressable>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 14 }}>
          {sections.map((section) => (
            <Pressable key={section.key} onPress={() => onSection(section.key)} accessibilityRole="link" style={({ pressed }) => [styles.action, pressed && { backgroundColor: "rgba(255,255,255,0.18)" }]}>
              <Ionicons name={section.icon} size={18} color={DIVE.aquaGlow} />
              <Text style={styles.actionText}>{section.label}</Text>
            </Pressable>
          ))}
        </View>
      </Rise>

      <Rise index={services.length + 2} progress={progress}>
        <Pressable onPress={onTeamSpace} accessibilityRole="button" style={({ pressed }) => [styles.team, pressed && { opacity: 0.85 }]}>
          <Ionicons name="person-circle-outline" size={22} color={DIVE.navy} />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={styles.teamTitle}>Espace équipe</Text>
            <Text style={styles.teamText}>Connexion des collaborateurs Deep Clean</Text>
          </View>
          <Ionicons name="arrow-forward" size={18} color={DIVE.navy} />
        </Pressable>
        <Pressable onPress={onLegal} accessibilityRole="link" hitSlop={8} style={{ alignSelf: "center", marginTop: 18 }}>
          <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: DIVE.onDark, textDecorationLine: "underline" }}>Mentions légales</Text>
        </Pressable>
      </Rise>
    </ScrollView>
  );
}

/** Chaque ligne remonte à la surface, l'une après l'autre. */
function Rise({ index, progress, children }: { index: number; progress: SharedValue<number>; children: React.ReactNode }) {
  const start = Math.min(0.42 + index * 0.035, 0.8);
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [start, Math.min(start + 0.25, 1)], [0, 1], "clamp"),
    transform: [{ translateY: interpolate(progress.value, [start, Math.min(start + 0.3, 1)], [22, 0], "clamp") }],
  }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

// Bulles : positions et vitesses fixes (pas de hasard à chaque rendu).
const BUBBLES = Array.from({ length: 14 }, (_, i) => ({
  x: ((i * 37) % 97) / 100,
  size: 5 + ((i * 7) % 12),
  duration: 5200 + ((i * 1300) % 4800),
  delay: (i * 610) % 3600,
}));

function Bubbles({ progress, width, height }: { progress: SharedValue<number>; width: number; height: number }) {
  const fade = useAnimatedStyle(() => ({ opacity: interpolate(progress.value, [0.6, 1], [0, 1], "clamp") }));
  return (
    <Animated.View style={[StyleSheet.absoluteFill, fade]} pointerEvents="none">
      {BUBBLES.map((b, i) => (
        <Bubble key={i} {...b} width={width} height={height} />
      ))}
    </Animated.View>
  );
}

function Bubble({ x, size, duration, delay, width, height }: { x: number; size: number; duration: number; delay: number; width: number; height: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(delay, withRepeat(withTiming(1, { duration, easing: Easing.linear }), -1, false));
  }, [t, delay, duration]);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(t.value, [0, 1], [height + 20, -40]) }, { translateX: Math.sin(t.value * Math.PI * 4) * 6 }],
    opacity: interpolate(t.value, [0, 0.1, 0.85, 1], [0, 0.55, 0.4, 0]),
  }));
  return (
    <Animated.View
      style={[
        { position: "absolute", left: x * width, width: size, height: size, borderRadius: size / 2, borderWidth: 1, borderColor: "rgba(160,225,245,0.7)", backgroundColor: "rgba(79,209,242,0.12)" },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  overline: { marginBottom: 6, fontFamily: "Inter_600SemiBold", fontSize: 11, letterSpacing: 1.1, color: DIVE.aquaGlow },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(255,255,255,0.12)" },
  link: { flex: 1, fontFamily: "Inter_700Bold", fontSize: 22, lineHeight: 28, letterSpacing: -0.4, color: "#FFFFFF" },
  quote: { flexDirection: "row", alignItems: "center", justifyContent: "center", marginTop: 26, height: 54, borderRadius: 27, backgroundColor: "#0479A3" },
  quoteText: { marginLeft: 8, fontFamily: "Inter_700Bold", fontSize: 16, color: "#FFFFFF" },
  action: { flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.08)" },
  actionText: { marginTop: 4, fontFamily: "Inter_600SemiBold", fontSize: 12, color: "#FFFFFF" },
  team: { flexDirection: "row", alignItems: "center", marginTop: 30, paddingHorizontal: 16, paddingVertical: 14, borderRadius: 999, backgroundColor: "#FFFFFF" },
  teamTitle: { fontFamily: "Inter_700Bold", fontSize: 16, color: DIVE.navy },
  teamText: { fontFamily: "Inter_500Medium", fontSize: 12, color: "#46527F", marginTop: 1 },
});
