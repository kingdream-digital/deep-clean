import React, { useEffect } from "react";
import { NavigationContainer, DarkTheme, DefaultTheme } from "@react-navigation/native";
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

export type RootStackParamList = {
  AppTabs: undefined;
  ChangePassword: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const { status, user } = useAuth();
  const { colors, isDark } = useTheme();

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
        <LoginScreen />
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
