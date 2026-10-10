import { useCallback } from "react";
import { View } from "react-native";
import { Redirect, Stack, usePathname, useRouter } from "expo-router";
import Animated, { FadeIn, SlideInRight, SlideOutRight } from "react-native-reanimated";
import { useAuth } from "@/auth/AuthProvider";
import { AssistantProvider, useAssistantSession } from "@/assistant/AssistantProvider";
import { AssistantView } from "@/assistant/AssistantView";
import { BottomBar } from "@/navigation/BottomBar";
import { Sidebar } from "@/navigation/Sidebar";
import { TOP_LEVEL_PATHS } from "@/navigation/items";
import { usePushNotifications } from "@/notifications/push";
import { useRealtime } from "@/realtime/useRealtime";
import { useBreakpoint, useTheme } from "@/theme/ThemeProvider";

/**
 * Espace connecté. Garde côté app (l'API refuse de toute façon toute requête
 * sans session valide) : sans session → connexion ; mot de passe temporaire
 * → changement obligatoire.
 */
export default function AppLayout() {
  const { status, user } = useAuth();
  if (status !== "signedIn" || !user) return <Redirect href="/connexion" />;
  if (user.mustChangePassword) return <Redirect href="/premiere-connexion" />;
  return (
    <AssistantProvider>
      <Shell />
    </AssistantProvider>
  );
}

const TOP_LEVEL_ROUTES = ["index", "planning/index", "devis/index", "factures/index", "clients/index", "notifications", "profil", "plus", "equipe/index", "activite", "reglages"];

function Shell() {
  const { colors, reduceMotion } = useTheme();
  const { isWide } = useBreakpoint();
  const pathname = usePathname();
  const router = useRouter();
  const { panelOpen, setPanelOpen } = useAssistantSession();
  useRealtime();
  const openLink = useCallback((link: string) => router.push(link as never), [router]);
  usePushNotifications(true, openLink);

  const stack = (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: isWide || reduceMotion ? "none" : "default" }}>
      {TOP_LEVEL_ROUTES.map((name) => (
        <Stack.Screen key={name} name={name} options={{ animation: "none" }} />
      ))}
      <Stack.Screen name="assistant" options={{ animation: isWide || reduceMotion ? "none" : "slide_from_bottom", gestureDirection: "vertical" }} />
    </Stack>
  );

  if (isWide) {
    const showPanel = panelOpen && pathname !== "/assistant";
    return (
      <View style={{ flex: 1, flexDirection: "row", backgroundColor: colors.bg }}>
        <Sidebar />
        <View style={{ flex: 1 }}>{stack}</View>
        {showPanel ? (
          <Animated.View
            entering={reduceMotion ? FadeIn.duration(1) : SlideInRight.duration(220)}
            exiting={reduceMotion ? undefined : SlideOutRight.duration(180)}
            style={{ width: 420, borderLeftWidth: 1, borderLeftColor: colors.border, backgroundColor: colors.surface }}
            accessibilityLabel="Assistant"
          >
            <AssistantView variant="panel" onClose={() => setPanelOpen(false)} />
          </Animated.View>
        ) : null}
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flex: 1 }}>{stack}</View>
      {TOP_LEVEL_PATHS.has(pathname) ? <BottomBar /> : null}
    </View>
  );
}
