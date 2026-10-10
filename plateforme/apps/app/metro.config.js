// Monorepo npm : Expo configure Metro automatiquement (dossiers de travail,
// paquets remontés à la racine). Rien à ajouter ici.
const { getDefaultConfig } = require("expo/metro-config");

module.exports = getDefaultConfig(__dirname);
