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

// Animations d'entrée/sortie (FadeInUp.duration(600).delay(300)…) : chaque
// réglage renvoie la même animation, sans effet.
function layoutAnimation() {
  const animation = {};
  for (const setting of ["duration", "delay", "springify", "damping", "easing"]) animation[setting] = () => animation;
  return animation;
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
  // Animation terminée aussitôt : le rappel de fin est appelé tout de suite.
  withTiming: (value, _config, callback) => {
    if (typeof callback === "function") callback(true);
    return value;
  },
  withRepeat: identity,
  withDelay: (_delay, value) => value,
  runOnJS: (fn) => fn,
  // Animations réduites : pas de bulles ni de boucles dans les tests.
  useReducedMotion: () => true,
  interpolate: (value, input, output) => {
    const t = Math.min(1, Math.max(0, (value - input[0]) / (input[input.length - 1] - input[0] || 1)));
    return output[0] + (output[output.length - 1] - output[0]) * t;
  },
  interpolateColor: () => "transparent",
  Easing: {
    linear: identity,
    ease: identity,
    inOut: identity,
    out: identity,
    cubic: identity,
  },
  FadeIn: layoutAnimation(),
  FadeOut: layoutAnimation(),
  FadeInUp: layoutAnimation(),
  FadeInDown: layoutAnimation(),
  ZoomIn: layoutAnimation(),
};
