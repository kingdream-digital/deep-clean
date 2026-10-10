// babel-preset-expo configure lui-même Reanimated / Worklets et Expo Router.
module.exports = function (api) {
  api.cache(true);
  return { presets: ["babel-preset-expo"] };
};
