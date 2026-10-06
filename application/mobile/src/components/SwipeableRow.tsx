import React, { useRef, useState } from "react";
import { PanResponder, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useTheme } from "../theme/ThemeProvider";

const ACTION_WIDTH = 84;

interface SwipeableRowProps {
  onDelete: () => void;
  children: React.ReactNode;
}

// Balayage vers la gauche pour révéler "Supprimer" (façon Mail/Notifications
// iOS) — implémenté avec PanResponder + Reanimated, déjà présents dans l'app
// (voir PressableScale.tsx), plutôt que d'ajouter react-native-gesture-handler
// pour ce seul besoin.
export function SwipeableRow({ onDelete, children }: SwipeableRowProps) {
  const { colors, radius, type } = useTheme();
  const translateX = useSharedValue(0);
  const startX = useRef(0);
  const [open, setOpen] = useState(false);

  const panResponder = useRef(
    PanResponder.create({
      // En phase de capture (évaluée AVANT que le Pressable enfant ne
      // revendique le geste) : sans ça, ce dernier "reprenait" parfois le
      // toucher en cours de glissement (le PanResponder recevait alors
      // onPanResponderTerminate et la case Supprimer se refermait aussitôt,
      // dès le moindre mouvement — bug remonté par le client).
      onMoveShouldSetPanResponderCapture: (_evt, gesture) =>
        Math.abs(gesture.dx) > 8 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5,
      onMoveShouldSetPanResponder: (_evt, gesture) =>
        Math.abs(gesture.dx) > 8 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5,
      // Une fois le geste accordé, ne jamais le rendre — même logique que
      // ci-dessus, pour qu'il n'y ait plus de "vol" du toucher en cours de
      // route.
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        startX.current = translateX.value;
      },
      onPanResponderMove: (_evt, gesture) => {
        const next = startX.current + gesture.dx;
        translateX.value = Math.max(-ACTION_WIDTH, Math.min(0, next));
      },
      onPanResponderRelease: (_evt, gesture) => {
        const shouldOpen = translateX.value < -ACTION_WIDTH / 2 || gesture.vx < -0.5;
        translateX.value = withTiming(shouldOpen ? -ACTION_WIDTH : 0, { duration: 200 });
        setOpen(shouldOpen);
      },
      onPanResponderTerminate: () => {
        translateX.value = withTiming(0, { duration: 200 });
        setOpen(false);
      },
    })
  ).current;

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  function close() {
    translateX.value = withTiming(0, { duration: 200 });
    setOpen(false);
  }

  function handleDelete() {
    translateX.value = withTiming(0, { duration: 150 });
    setOpen(false);
    onDelete();
  }

  return (
    <View style={[styles.wrapper, { borderRadius: radius.lg }]}>
      <View style={[StyleSheet.absoluteFill, styles.backdrop, { backgroundColor: colors.danger, borderRadius: radius.lg }]}>
        <Pressable onPress={handleDelete} style={styles.actionButton}>
          <Ionicons name="trash" size={20} color="#FFF" />
          <Text style={[type.caption, { color: "#FFF", marginTop: 3, fontWeight: "700" }]}>Supprimer</Text>
        </Pressable>
      </View>
      {/* Fond opaque sous la ligne : les teintes « non lu » du mode sombre
          sont translucides, et le rouge de « Supprimer » transparaissait à
          travers chaque ligne, même sans balayage (toutes les notifications
          s'affichaient en rouge). */}
      <Animated.View style={[rowStyle, { backgroundColor: colors.background, borderRadius: radius.lg }]} {...panResponder.panHandlers}>
        {children}
        {/* Capture le tap quand la ligne est ouverte pour la refermer, sans
            déclencher l'action normale de la ligne (marquer lu, naviguer...). */}
        {!!open && <Pressable style={StyleSheet.absoluteFill} onPress={close} />}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { overflow: "hidden" },
  backdrop: { alignItems: "flex-end", justifyContent: "center" },
  actionButton: { width: ACTION_WIDTH, height: "100%", alignItems: "center", justifyContent: "center" },
});
