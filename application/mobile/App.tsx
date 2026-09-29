// Doit être le tout premier import du point d'entrée (exigence react-native-reanimated).
import "react-native-reanimated";
import React from "react";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";
import { ThemeProvider, useTheme } from "./src/theme/ThemeProvider";
import { AuthProvider } from "./src/auth/AuthContext";
import { OnboardingProvider } from "./src/onboarding/OnboardingContext";
import { OnboardingTargetProvider } from "./src/onboarding/OnboardingTargetContext";
import { RootNavigator } from "./src/navigation/RootNavigator";
import { SplashGate } from "./src/components/SplashGate";
import { AlertHost } from "./src/components/AlertHost";
import { OnboardingOverlay } from "./src/components/OnboardingOverlay";
import { injectWebScrollbarStyle } from "./src/utils/webScrollbar";

// Appelé au chargement du module (avant le premier rendu) — no-op sur
// natif (voir webScrollbar.ts), une seule injection sur web quel que soit
// le nombre de re-rendus de l'app.
injectWebScrollbarStyle();

function StatusBarBridge() {
  const { isDark } = useTheme();
  return <StatusBar style={isDark ? "light" : "dark"} />;
}

function AppContent() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  if (!fontsLoaded) {
    return <SplashGate />;
  }

  return (
    <AuthProvider>
      <StatusBarBridge />
      <OnboardingTargetProvider>
        <OnboardingProvider>
          <RootNavigator />
          <OnboardingOverlay />
        </OnboardingProvider>
      </OnboardingTargetProvider>
      <AlertHost />
    </AuthProvider>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AppContent />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
