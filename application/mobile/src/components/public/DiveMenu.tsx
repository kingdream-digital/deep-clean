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

// Menu « plongée » de l'accueil public, comme celui du site deep-clean.fr :
// l'eau s'ouvre en cercle depuis le bouton du menu, des bulles remontent,
// chaque partie de la page est repérée par sa profondeur (−8 m, −14 m…).
// En bas : tous les services ouverts au public, puis « Espace équipe ».

export const DIVE = {
  royal: "#184F91",
  navy: "#1F2C68",
  abyss: "#121A45",
  deep: "#0C1233",
  aquaGlow: "#4FD1F2",
  onDark: "rgba(234,246,251,0.8)",
};

export interface DiveMenuItem {
  key: string;
  depth: number;
  label: string;
}

interface Props {
  open: boolean;
  origin: { x: number; y: number };
  topInset: number;
  items: DiveMenuItem[];
  services: readonly string[];
  onSelect: (key: string) => void;
  onService: (service: string) => void;
  onCall: () => void;
  onWrite: () => void;
  onDirections: () => void;
  onTeamSpace: () => void;
  onLegal: () => void;
  onClose: () => void;
}

export function DiveMenu(props: Props) {
  const { open, origin, topInset, onClose } = props;
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
        <MenuContent {...props} topInset={topInset} progress={progress} />
        {/* Le texte qui défile s'efface sous l'en-tête au lieu d'y passer net. */}
        <LinearGradient colors={[DIVE.navy, "rgba(31,44,104,0)"]} style={{ position: "absolute", top: 0, left: 0, right: 0, height: topInset + 84 }} pointerEvents="none" />
      </Animated.View>
    </View>
  );
}

function MenuContent({ items, services, onSelect, onService, onCall, onWrite, onDirections, onTeamSpace, onLegal, topInset, progress }: Props & { progress: SharedValue<number> }) {
  return (
    <ScrollView contentContainerStyle={{ paddingTop: topInset + 92, paddingHorizontal: 24, paddingBottom: 48 }} showsVerticalScrollIndicator={false}>
      {items.map((item, index) => (
        <Rise key={item.key} index={index} progress={progress}>
          <Pressable onPress={() => onSelect(item.key)} accessibilityRole="link" style={({ pressed }) => ({ flexDirection: "row", alignItems: "baseline", paddingVertical: 7, opacity: pressed ? 0.6 : 1 })}>
            <Text style={styles.depth}>{item.depth === 0 ? "0 m" : `−${item.depth} m`}</Text>
            <Text style={styles.link}>{item.label}</Text>
          </Pressable>
        </Rise>
      ))}

      <Rise index={items.length} progress={progress}>
        <Text style={styles.overline}>VOS SERVICES — DEVIS GRATUIT</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {services.map((service) => (
            <Pressable key={service} onPress={() => onService(service)} accessibilityRole="button" style={({ pressed }) => [styles.chip, pressed && { backgroundColor: "rgba(255,255,255,0.2)" }]}>
              <Text style={styles.chipText}>{service}</Text>
            </Pressable>
          ))}
        </View>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 16 }}>
          <Action icon="call-outline" label="Appeler" onPress={onCall} />
          <Action icon="mail-outline" label="Écrire" onPress={onWrite} />
          <Action icon="navigate-outline" label="Itinéraire" onPress={onDirections} />
        </View>
      </Rise>

      <Rise index={items.length + 1} progress={progress}>
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

function Action({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.action, pressed && { backgroundColor: "rgba(255,255,255,0.18)" }]}>
      <Ionicons name={icon} size={18} color={DIVE.aquaGlow} />
      <Text style={styles.actionText}>{label}</Text>
    </Pressable>
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
  depth: { width: 58, fontFamily: "Inter_700Bold", fontSize: 12, color: DIVE.aquaGlow, fontVariant: ["tabular-nums"] },
  link: { flex: 1, fontFamily: "Inter_700Bold", fontSize: 27, lineHeight: 33, letterSpacing: -0.6, color: "#FFFFFF" },
  overline: { marginTop: 30, marginBottom: 12, fontFamily: "Inter_600SemiBold", fontSize: 11, letterSpacing: 1.1, color: DIVE.aquaGlow },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.1)", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.28)" },
  chipText: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: "#FFFFFF" },
  action: { flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.08)" },
  actionText: { marginTop: 4, fontFamily: "Inter_600SemiBold", fontSize: 12, color: "#FFFFFF" },
  team: { flexDirection: "row", alignItems: "center", marginTop: 30, paddingHorizontal: 16, paddingVertical: 14, borderRadius: 999, backgroundColor: "#FFFFFF" },
  teamTitle: { fontFamily: "Inter_700Bold", fontSize: 16, color: DIVE.navy },
  teamText: { fontFamily: "Inter_500Medium", fontSize: 12, color: "#46527F", marginTop: 1 },
});

// Parties de l'accueil, avec leur profondeur (mêmes repères que le site).
export const DIVE_ITEMS: DiveMenuItem[] = [
  { key: "surface", depth: 0, label: "Accueil" },
  { key: "news", depth: 2, label: "Actualités" },
  { key: "univers", depth: 8, label: "Nos univers" },
  { key: "pieces", depth: 14, label: "Pièce par pièce" },
  { key: "methode", depth: 20, label: "Notre méthode" },
  { key: "engagements", depth: 26, label: "Engagements" },
  { key: "fondateur", depth: 30, label: "Qui sommes-nous" },
  { key: "zone", depth: 34, label: "Zone d'intervention" },
  { key: "faq", depth: 41, label: "Questions" },
  { key: "contact", depth: 44, label: "Contact & devis" },
];
