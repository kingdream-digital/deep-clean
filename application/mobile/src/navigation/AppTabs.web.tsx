// Variante web de AppTabs.tsx : Metro/Webpack résout automatiquement ce
// fichier `.web.tsx` à la place de `AppTabs.tsx` UNIQUEMENT pour le bundle
// web — le bundle iOS/Android continue d'utiliser AppTabs.tsx sans aucune
// modification. Mêmes routes, mêmes écrans, mêmes permissions par rôle :
// seule la présentation change (barre latérale façon panel entreprise sur
// grand écran, barre d'onglets en bas sur une fenêtre étroite).
import React from "react";
import { useWindowDimensions } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { useTheme } from "../theme/ThemeProvider";
import { breakpoints } from "../theme/breakpoints";
import { useUnreadInboxCount } from "../hooks/useUnreadInboxCount";
import { HomeStack } from "./HomeStack";
import { PlanningStack } from "./PlanningStack";
import { MissionsStack } from "./MissionsStack";
import { InboxStack } from "./InboxStack";
import { MenuStack } from "./MenuStack";
import { ICONS } from "./appTabsShared";
import type { AppTabsParamList } from "./appTabsShared";
import { WebSidebar } from "./web/WebSidebar";
import { Ionicons } from "@expo/vector-icons";

export type { AppTabsParamList };

const Tab = createBottomTabNavigator<AppTabsParamList>();

export function AppTabs() {
  const { colors } = useTheme();
  const unread = useUnreadInboxCount();
  const { width } = useWindowDimensions();

  // Un téléphone qui ouvre le site (ou une fenêtre réduite) n'a pas la place
  // d'une barre latérale de 264 px : elle occupait les deux tiers de l'écran
  // et écrasait tout le contenu à droite, chaque mot sur sa propre ligne
  // (constaté en conditions réelles sur une fenêtre de 390 px de large). En
  // dessous du seuil, on retombe sur la barre d'onglets du bas — la même
  // navigation que l'application mobile, aux mêmes endroits.
  const useSidebar = width >= breakpoints.sidebar;

  return (
    <Tab.Navigator
      initialRouteName="Accueil"
      tabBar={useSidebar ? (props) => <WebSidebar {...props} /> : undefined}
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarPosition: useSidebar ? "left" : "bottom",
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.inkTertiary,
        tabBarStyle: { backgroundColor: colors.backgroundElevated, borderTopColor: colors.border },
        tabBarIcon: ({ color, size }: { color: string; size: number }) => (
          <Ionicons name={ICONS[route.name]} size={size} color={color} />
        ),
      })}
    >
      <Tab.Screen name="Accueil" component={HomeStack} />
      <Tab.Screen name="Planning" component={PlanningStack} />
      <Tab.Screen name="Missions" component={MissionsStack} />
      <Tab.Screen
        name="Messagerie"
        component={InboxStack}
        options={{
          tabBarBadge: unread > 0 ? unread : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.danger },
        }}
      />
      <Tab.Screen name="Menu" component={MenuStack} />
    </Tab.Navigator>
  );
}
