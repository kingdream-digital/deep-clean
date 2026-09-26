// Mock manuel minimal pour les tests : le mock officiel du package échoue à
// charger sous Jest avec la nouvelle architecture "worklets" de Reanimated 4
// (module natif absent en environnement de test). Ce mock couvre uniquement
// l'API réellement utilisée dans ce projet (voir les imports de
// "react-native-reanimated" dans src/) — Animated.View se comporte comme une
// View ordinaire, les fonctions d'animation renvoient des valeurs inertes.
const React = require("react");
const { View } = require("react-native");

function identity(value) {
  return value;
}

const Animated = {
  View: React.forwardRef((props, ref) => React.createElement(View, { ...props, ref })),
  createAnimatedComponent: (Component) => Component,
};

module.exports = {
  __esModule: true,
  default: Animated,
  useAnimatedStyle: (factory) => (typeof factory === "function" ? factory() : {}),
  useSharedValue: (initial) => ({ value: initial }),
  withSpring: identity,
  withTiming: identity,
  withRepeat: identity,
  interpolateColor: () => "transparent",
  Easing: {
    linear: identity,
    ease: identity,
    inOut: identity,
    out: identity,
  },
  FadeIn: { duration: () => ({}) },
  FadeOut: { duration: () => ({}) },
  FadeInUp: { duration: () => ({}), delay: () => ({ duration: () => ({}) }) },
};
