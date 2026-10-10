import { useEffect } from "react";
import { Platform, View } from "react-native";
import { Stack, SplashScreen } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from "@expo-google-fonts/inter";
import { OFFLINE_QUERY_KEYS, persister, queryClient } from "@/api/queryClient";
import { AuthProvider, useAuth } from "@/auth/AuthProvider";
import { ThemeProvider, useTheme } from "@/theme/ThemeProvider";
import { ToastProvider } from "@/ui";

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

// Web : les icônes gardent leur taille dans les rangées flexibles (sinon le navigateur les écrase).
if (Platform.OS === "web" && typeof document !== "undefined" && !document.getElementById("aussitot-base-css")) {
  const style = document.createElement("style");
  style.id = "aussitot-base-css";
  style.textContent = "svg.lucide{flex-shrink:0}";
  document.head.appendChild(style);
}

/**
 * Racine de l'application : polices, thème, cache des données (gardé sur
 * l'appareil pour la consultation hors connexion), session, notifications
 * éphémères. L'écran de démarrage reste affiché jusqu'à ce que la session
 * soit restaurée : pas d'éclair de l'écran de connexion au lancement.
 */
export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{
            persister,
            maxAge: 24 * 3_600_000,
            buster: "1",
            dehydrateOptions: {
              shouldDehydrateQuery: (query) => query.state.status === "success" && OFFLINE_QUERY_KEYS.has(String(query.queryKey[0])),
            },
          }}
        >
          <AuthProvider>
            <ToastProvider>
              <Root ready={fontsLoaded || Boolean(fontError)} />
            </ToastProvider>
          </AuthProvider>
        </PersistQueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function Root({ ready }: { ready: boolean }) {
  const { colors } = useTheme();
  const { status } = useAuth();
  const loading = !ready || status === "loading";

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(colors.bg).catch(() => undefined);
  }, [colors.bg]);

  useEffect(() => {
    if (!loading) void SplashScreen.hideAsync().catch(() => undefined);
  }, [loading]);

  if (loading) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  return (
    <>
      <StatusBar style={colors.mode === "dark" ? "light" : "dark"} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: "fade" }} />
    </>
  );
}
