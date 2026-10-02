import React, { useEffect, useRef, useState } from "react";
import { Modal, Text, useWindowDimensions, View } from "react-native";
import Svg, { Mask, Rect } from "react-native-svg";
import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeProvider";
import { useAuth } from "../auth/AuthContext";
import { useOnboarding } from "../onboarding/OnboardingContext";
import { getOnboardingSteps, type OnboardingStep } from "../onboarding/onboardingContent";
import { useOnboardingTargetRegistry, type TargetRect } from "../onboarding/OnboardingTargetContext";
import { navigationRef } from "../navigation/navigationRef";
import { Button } from "./Button";
import { PressableScale } from "./PressableScale";

const AnimatedRect = Animated.createAnimatedComponent(Rect);

// Marge visuelle autour de l'élément ciblé — le "trou" de surbrillance est un
// peu plus grand que l'élément lui-même, jamais collé à ses bords.
const HOLE_PADDING = 10;
const HOLE_RADIUS = 16;
// Nombre de tentatives et intervalle pour retrouver l'élément ciblé après un
// changement d'onglet : le temps que la navigation, le rendu de la liste et
// la mise en page se stabilisent (données réseau incluses sur certains
// écrans) — jamais un simple `setTimeout` unique, trop fragile.
const MEASURE_ATTEMPTS = 16;
const MEASURE_INTERVAL_MS = 180;
// Zone "sûre" dans laquelle un élément ciblé doit tomber pour rester
// entièrement visible ET laisser assez de place à la carte du tutoriel —
// un élément plus bas dans une liste longue (ex. un outil de Menu pour un
// rôle qui en a beaucoup) est sinon hors champ, invisible pour l'utilisateur.
const TOP_SAFE_MARGIN = 100;
const CARD_SAFE_HEIGHT = 260;
const BOTTOM_SAFE_MARGIN = CARD_SAFE_HEIGHT + 40;

export function OnboardingOverlay() {
  const { colors, spacing, radius, type } = useTheme();
  const { user } = useAuth();
  const { visible, dismiss } = useOnboarding();
  const { measure, scrollBy } = useOnboardingTargetRegistry();
  const { width: winW, height: winH } = useWindowDimensions();

  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<TargetRect | null>(null);
  const [settled, setSettled] = useState(false);

  const holeX = useSharedValue(0);
  const holeY = useSharedValue(0);
  const holeW = useSharedValue(0);
  const holeH = useSharedValue(0);
  const contentOpacity = useSharedValue(0);

  const steps: OnboardingStep[] = user ? getOnboardingSteps(user.role) : [];
  const step = steps[Math.min(stepIndex, Math.max(steps.length - 1, 0))];
  const isLast = stepIndex >= steps.length - 1;

  // Reset propre à chaque ouverture (première apparition automatique ou
  // "Revoir le tutoriel" depuis Profil) : on repart toujours de l'étape 0.
  useEffect(() => {
    if (visible) setStepIndex(0);
  }, [visible]);

  // Le cœur de l'immersion : à chaque étape, on navigue réellement vers
  // l'onglet/l'écran concerné (comme un appui de l'utilisateur), puis on
  // retrouve la position à l'écran du VRAI élément à mettre en avant.
  useEffect(() => {
    if (!visible || !step) return;
    let cancelled = false;
    setSettled(false);
    contentOpacity.value = withTiming(0, { duration: 120 });

    async function run() {
      if (step.tab && navigationRef.isReady()) {
        // Nom d'onglet ET d'écran imbriqué dynamiques (dérivés du contenu du
        // tutoriel, pas d'une route statique connue à la compilation) —
        // React Navigation ne peut pas résoudre la bonne surcharge ici, même
        // motif que HomeScreen.tsx::openSection.
        (navigationRef.navigate as (name: string, params?: object) => void)(
          step.tab,
          step.screen ? { screen: step.screen } : undefined
        );
      }

      if (!step.targetId) {
        if (!cancelled) {
          setRect(null);
          setSettled(true);
          contentOpacity.value = withTiming(1, { duration: 280 });
        }
        return;
      }

      for (let attempt = 0; attempt < MEASURE_ATTEMPTS; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, MEASURE_INTERVAL_MS));
        if (cancelled) return;
        const measured = await measure(step.targetId);
        if (measured) {
          let target = measured;
          // L'élément est mesuré, mais peut-être hors de la zone sûre (plus
          // bas dans une liste qui défile) — on fait défiler l'écran pour
          // l'y ramener avant de mettre en surbrillance, comme le ferait un
          // utilisateur qui cherche cet élément lui-même.
          const outOfSafeZone = measured.y < TOP_SAFE_MARGIN || measured.y + measured.height > winH - BOTTOM_SAFE_MARGIN;
          if (outOfSafeZone && step.screen) {
            const safeZoneHeight = winH - BOTTOM_SAFE_MARGIN - TOP_SAFE_MARGIN;
            const desiredY =
              measured.height <= safeZoneHeight
                ? TOP_SAFE_MARGIN + (safeZoneHeight - measured.height) / 2
                : TOP_SAFE_MARGIN;
            scrollBy(step.screen, measured.y - desiredY);
            await new Promise((resolve) => setTimeout(resolve, 380));
            if (cancelled) return;
            const corrected = await measure(step.targetId);
            if (corrected) target = corrected;
          }
          if (!cancelled) {
            setRect(target);
            setSettled(true);
            contentOpacity.value = withTiming(1, { duration: 280 });
          }
          return;
        }
      }
      // Élément introuvable après toutes les tentatives (donnée absente,
      // liste vide...) : on ne bloque jamais le tutoriel, la carte repasse
      // simplement en mode centré, sans surbrillance.
      if (!cancelled) {
        setRect(null);
        setSettled(true);
        contentOpacity.value = withTiming(1, { duration: 280 });
      }
    }
    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, stepIndex, user?.role]);

  useEffect(() => {
    if (!rect) return;
    holeX.value = withTiming(rect.x - HOLE_PADDING, { duration: 380 });
    holeY.value = withTiming(rect.y - HOLE_PADDING, { duration: 380 });
    holeW.value = withTiming(rect.width + HOLE_PADDING * 2, { duration: 380 });
    holeH.value = withTiming(rect.height + HOLE_PADDING * 2, { duration: 380 });
  }, [rect, holeX, holeY, holeW, holeH]);

  const holeProps = useAnimatedProps(() => ({
    x: holeX.value,
    y: holeY.value,
    width: holeW.value,
    height: holeH.value,
  }));

  const contentStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
    transform: [{ translateY: (1 - contentOpacity.value) * 8 }],
  }));

  if (!visible || !user || !step) return null;

  function handleClose() {
    dismiss();
  }

  function handleNext() {
    if (isLast) {
      handleClose();
    } else {
      setStepIndex((i) => i + 1);
    }
  }

  function handleBack() {
    setStepIndex((i) => Math.max(0, i - 1));
  }

  // Positionnement de la carte : sous l'élément ciblé s'il y a la place,
  // sinon au-dessus. Toujours exprimé en `top` (jamais `bottom`) et borné à
  // l'écran, pour que le bouton "Suivant" reste toujours atteignable même
  // quand l'élément mis en avant est très grand (ex. le bloc de pointage,
  // qui occupe une bonne partie de l'écran) — une carte qui déborderait de
  // l'écran serait pire qu'une carte qui chevauche légèrement sa cible.
  let cardTop: number | null = null;
  let arrowDirection: "up" | "down" | null = null;
  if (rect) {
    const spaceBelow = winH - (rect.y + rect.height);
    const spaceAbove = rect.y;
    const fitsBelow = spaceBelow >= CARD_SAFE_HEIGHT + spacing.lg;
    const fitsAbove = spaceAbove >= CARD_SAFE_HEIGHT + spacing.lg;
    const placeBelow = fitsBelow || (!fitsAbove && spaceBelow >= spaceAbove);
    const idealTop = placeBelow
      ? rect.y + rect.height + HOLE_PADDING + 14
      : rect.y - HOLE_PADDING - 14 - CARD_SAFE_HEIGHT;
    cardTop = Math.max(spacing.lg, Math.min(idealTop, winH - CARD_SAFE_HEIGHT - spacing.lg));
    arrowDirection = placeBelow ? "up" : "down";
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={handleClose}>
      <View style={{ flex: 1 }}>
        {/* Fond assombri avec un "trou" découpé sur l'élément réel à montrer
            (masque SVG) — sans cible, le fond reste uniformément assombri,
            comme une carte centrée classique. */}
        <Svg width={winW} height={winH} style={{ position: "absolute", top: 0, left: 0 }}>
          <Mask id="onboarding-spotlight">
            <Rect x={0} y={0} width={winW} height={winH} fill="white" />
            {!!rect && <AnimatedRect animatedProps={holeProps} rx={HOLE_RADIUS} fill="black" />}
          </Mask>
          <Rect x={0} y={0} width={winW} height={winH} fill="rgba(10,14,26,0.78)" mask="url(#onboarding-spotlight)" />
          {!!rect && (
            <AnimatedRect animatedProps={holeProps} rx={HOLE_RADIUS} fill="none" stroke={colors.accent} strokeWidth={2.5} />
          )}
        </Svg>

        {!!settled && (
          <Animated.View
            style={[
              rect
                ? { position: "absolute", left: spacing.lg, right: spacing.lg, top: cardTop ?? undefined }
                : { flex: 1, justifyContent: "center", padding: spacing.lg },
              contentStyle,
            ]}
          >
            {rect && arrowDirection === "up" && (
              <View style={{ alignItems: "center", marginBottom: -1 }}>
                <Ionicons name="caret-up" size={22} color={colors.backgroundElevated} />
              </View>
            )}

            <View
              style={{
                backgroundColor: colors.backgroundElevated,
                borderRadius: radius.xl,
                padding: spacing.lg,
                maxWidth: 420,
                width: "100%",
                alignSelf: "center",
                shadowColor: "#000",
                shadowOpacity: 0.25,
                shadowRadius: 20,
                shadowOffset: { width: 0, height: 8 },
                elevation: 10,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: radius.pill,
                    backgroundColor: colors.accentSoft,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons name={step.icon} size={22} color={colors.accent} />
                </View>
                <View style={{ flex: 1, marginLeft: spacing.md }}>
                  <Text style={[type.headline, { color: colors.ink }]}>{step.title}</Text>
                </View>
                <PressableScale onPress={handleClose} accessibilityLabel="Passer le tutoriel">
                  <Text style={[type.subhead, { color: colors.inkTertiary }]}>Passer</Text>
                </PressableScale>
              </View>

              <Text style={[type.body, { color: colors.inkSecondary, marginTop: spacing.sm, lineHeight: 22 }]}>
                {step.body}
              </Text>

              <View style={{ flexDirection: "row", marginTop: spacing.lg, marginBottom: spacing.md }}>
                {steps.map((_, index) => (
                  <View
                    key={index}
                    style={{
                      flex: 1,
                      height: 4,
                      borderRadius: 2,
                      marginRight: index === steps.length - 1 ? 0 : 4,
                      backgroundColor: index <= stepIndex ? colors.accent : colors.border,
                    }}
                  />
                ))}
              </View>

              <View style={{ flexDirection: "row", alignItems: "center" }}>
                {stepIndex > 0 && (
                  <PressableScale onPress={handleBack} style={{ marginRight: spacing.md }}>
                    <Text style={[type.headline, { color: colors.inkSecondary }]}>Retour</Text>
                  </PressableScale>
                )}
                <View style={{ flex: 1 }}>
                  <Button label={isLast ? "Terminer" : "Suivant"} onPress={handleNext} fullWidth />
                </View>
              </View>
            </View>

            {rect && arrowDirection === "down" && (
              <View style={{ alignItems: "center", marginTop: -1 }}>
                <Ionicons name="caret-down" size={22} color={colors.backgroundElevated} />
              </View>
            )}
          </Animated.View>
        )}
      </View>
    </Modal>
  );
}
