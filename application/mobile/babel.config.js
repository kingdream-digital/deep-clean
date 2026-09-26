// babel-preset-expo détecte automatiquement react-native-reanimated et
// configure le plugin Babel nécessaire (worklets) — aucune configuration
// manuelle supplémentaire n'est requise avec les versions récentes d'Expo.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
  };
};
