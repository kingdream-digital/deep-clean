import React from "react";
import { Platform } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeProvider";
import { PublicHomeScreen } from "../screens/public/PublicHomeScreen";
import { PublicServicesScreen } from "../screens/public/PublicServicesScreen";
import { PublicNewsScreen } from "../screens/public/PublicNewsScreen";
import { PublicContactScreen } from "../screens/public/PublicContactScreen";

// Accueil public de l'application (sans compte, aucune inscription) : quatre
// onglets pour découvrir DEEP CLEAN, et « Espace équipe » qui ouvre la
// connexion des collaborateurs (comptes créés par la RH).
export type PublicTabsParamList = {
  PublicHome: undefined;
  PublicServices: undefined;
  PublicNews: undefined;
  PublicContact: undefined;
  TeamSpace: undefined;
};

const Tab = createBottomTabNavigator<PublicTabsParamList>();

const ICONS: Record<keyof PublicTabsParamList, keyof typeof Ionicons.glyphMap> = {
  PublicHome: "home-outline",
  PublicServices: "sparkles-outline",
  PublicNews: "newspaper-outline",
  PublicContact: "chatbubbles-outline",
  TeamSpace: "person-circle-outline",
};

function Nothing() {
  return null;
}

export function PublicTabs() {
  const { colors } = useTheme();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.inkTertiary,
        tabBarStyle:
          Platform.OS === "web"
            ? { backgroundColor: colors.backgroundElevated, borderTopColor: colors.border, height: 60, paddingBottom: 6 }
            : { backgroundColor: colors.backgroundElevated, borderTopColor: colors.border },
        ...(Platform.OS === "web" ? { tabBarLabelStyle: { fontSize: 10, lineHeight: 14, flexShrink: 0 } } : null),
        tabBarIcon: ({ color, size }) => <Ionicons name={ICONS[route.name]} size={size} color={color} />,
      })}
    >
      <Tab.Screen name="PublicHome" component={PublicHomeScreen} options={{ title: "Accueil" }} />
      <Tab.Screen name="PublicServices" component={PublicServicesScreen} options={{ title: "Services" }} />
      <Tab.Screen name="PublicNews" component={PublicNewsScreen} options={{ title: "Actualités" }} />
      <Tab.Screen name="PublicContact" component={PublicContactScreen} options={{ title: "Contact" }} />
      <Tab.Screen
        name="TeamSpace"
        component={Nothing}
        options={{ title: "Espace équipe" }}
        // Pas un écran : ouvre la connexion des collaborateurs par-dessus.
        listeners={({ navigation }) => ({
          tabPress: (event) => {
            event.preventDefault();
            // pop : revient à la connexion si elle est déjà dans la pile
            // (React Navigation 7 en empilerait sinon une nouvelle).
            navigation.getParent()?.navigate("Login", undefined, { pop: true });
          },
        })}
      />
    </Tab.Navigator>
  );
}
