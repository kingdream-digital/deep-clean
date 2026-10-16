import React from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { BrandEmblem } from "./BrandEmblem";

// Fond blanc, identique à l'écran de lancement natif (app.json, plugin
// expo-splash-screen), à l'icône et à l'animation d'ouverture BrandIntro : le
// passage du lancement à l'application se fait sans aucun flash de couleur.
export const SPLASH_BACKGROUND = "#FFFFFF";
const DROP = "#1E9CC6";
const MID = "#2A4F8E";
// Même géométrie que assets/splash-icon.png (généré par
// tools/brand/generate-app-assets.ts) affiché à `imageWidth` = 200 :
// médaillon = 800/1024 de l'image, halos = 1000/1024 et 896/1024.
const IMAGE_WIDTH = 200;
const EMBLEM = Math.round((IMAGE_WIDTH * 800) / 1024);

// Affiché pendant le chargement des polices et la restauration de session au
// démarrage (lecture du refresh token sécurisé + vérification serveur).
export function SplashGate() {
  return (
    <View style={styles.container} accessibilityLabel="Deep Clean, chargement">
      <View style={styles.stage}>
        <View style={[styles.halo, { width: (IMAGE_WIDTH * 1000) / 1024, height: (IMAGE_WIDTH * 1000) / 1024, opacity: 0.06 }]} />
        <View style={[styles.halo, { width: (IMAGE_WIDTH * 896) / 1024, height: (IMAGE_WIDTH * 896) / 1024, opacity: 0.08 }]} />
        <BrandEmblem size={EMBLEM} />
      </View>
      <ActivityIndicator color={MID} style={styles.spinner} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: SPLASH_BACKGROUND },
  stage: { width: IMAGE_WIDTH, height: IMAGE_WIDTH, alignItems: "center", justifyContent: "center" },
  halo: { position: "absolute", borderRadius: 999, backgroundColor: DROP },
  // Sous le médaillon, sans décaler celui-ci par rapport au lancement natif.
  spinner: { position: "absolute", top: "50%", marginTop: IMAGE_WIDTH / 2 + 24 },
});
