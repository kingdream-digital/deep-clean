import React, { useEffect } from "react";
import { NavigationContainer, DarkTheme, DefaultTheme, type NavigatorScreenParams } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useAuth } from "../auth/AuthContext";
import { useTheme } from "../theme/ThemeProvider";
import { LoginScreen } from "../screens/auth/LoginScreen";
import { ForcePasswordChangeScreen } from "../screens/auth/ForcePasswordChangeScreen";
import { ChangePasswordScreen } from "../screens/profile/ChangePasswordScreen";
import { AppTabs } from "./AppTabs";
import { SplashGate } from "../components/SplashGate";
import { navigationRef } from "./navigationRef";
import { listenToPushTaps } from "../notifications/push";
import { startLiveSync } from "../sync/liveSync";
import { QuoteRequestScreen } from "../screens/public/QuoteRequestScreen";
import { PublicNewsDetailScreen } from "../screens/public/PublicNewsDetailScreen";
import { PublicTabs, type PublicTabsParamList } from "./PublicTabs";
import type { PublicService } from "../api/public.api";
import { LegalScreen } from "../screens/profile/LegalScreen";
import { useStackScreenOptions } from "./stackScreenOptions";

export type RootStackParamList = {
  AppTabs: undefined;
  ChangePassword: undefined;
};

// Hors connexion : l'accueil public de DEEP CLEAN en onglets (premier écran,
// sans compte, aucune inscription — règle App Store 3.2), la demande de
// devis, les actualités, les mentions légales, et l'« Espace équipe »
// (connexion des collaborateurs).
export type PublicStackParamList = {
  PublicTabs: NavigatorScreenParams<PublicTabsParamList> | undefined;
  Login: undefined;
  QuoteRequest: { service?: PublicService } | undefined;
  PublicNewsDetail: { newsId: string };
  Legal: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const PublicStack = createNativeStackNavigator<PublicStackParamList>();

export function RootNavigator() {
  const { status, user, sessionExpired, endMessage } = useAuth();
  const { colors, isDark } = useTheme();
  const stackOptions = useStackScreenOptions();

  const navTheme = {
    ...(isDark ? DarkTheme : DefaultTheme),
    colors: {
      ...(isDark ? DarkTheme.colors : DefaultTheme.colors),
      background: colors.background,
      card: colors.backgroundElevated,
      text: colors.ink,
      border: colors.border,
      primary: colors.accent,
    },
  };

  // Appui sur une notification push : ouvre l'écran concerné, une fois connecté.
  const signedIn = status !== "booting" && status !== "unauthenticated" && !!user && !user.mustChangePassword;
  useEffect(() => (signedIn ? listenToPushTaps() : undefined), [signedIn]);
  // Synchronisation entre appareils : écrans rechargés dès qu'une donnée change.
  useEffect(() => (signedIn ? startLiveSync() : undefined), [signedIn]);

  if (status === "booting") {
    return <SplashGate />;
  }

  return (
    <NavigationContainer ref={navigationRef} theme={navTheme}>
      {status === "unauthenticated" || !user ? (
        // L'accueil public s'ouvre en premier ; la connexion directement quand
        // il faut la reprendre (Face ID/Touch ID, session expirée, compte
        // désactivé, hors connexion…), pour que le message reste visible.
        <PublicStack.Navigator
          screenOptions={stackOptions}
          initialRouteName={status === "locked" || sessionExpired || !!endMessage ? "Login" : "PublicTabs"}
        >
          <PublicStack.Screen name="PublicTabs" component={PublicTabs} options={{ headerShown: false, title: "Deep Clean" }} />
          <PublicStack.Screen name="Login" component={LoginScreen} options={{ headerShown: false, title: "Espace équipe" }} />
          <PublicStack.Screen name="QuoteRequest" component={QuoteRequestScreen} options={{ title: "Demander un devis" }} />
          <PublicStack.Screen name="PublicNewsDetail" component={PublicNewsDetailScreen} options={{ title: "Actualité" }} />
          <PublicStack.Screen name="Legal" component={LegalScreen} options={{ title: "Mentions légales" }} />
        </PublicStack.Navigator>
      ) : user.mustChangePassword ? (
        // Mot de passe temporaire : blocage jusqu'à la définition d'un mot de passe personnel.
        <ForcePasswordChangeScreen />
      ) : (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="AppTabs" component={AppTabs} />
          <Stack.Screen
            name="ChangePassword"
            component={ChangePasswordScreen}
            options={{ headerShown: true, title: "Modifier mon mot de passe", presentation: "modal" }}
          />
        </Stack.Navigator>
      )}
    </NavigationContainer>
  );
}
