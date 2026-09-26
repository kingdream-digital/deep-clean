// Variante web de AppTabs.tsx : Metro/Webpack résout automatiquement ce
// fichier `.web.tsx` à la place de `AppTabs.tsx` UNIQUEMENT pour le bundle
// web — le bundle iOS/Android continue d'utiliser AppTabs.tsx sans aucune
// modification. Mêmes routes, mêmes écrans, mêmes permissions par rôle :
// seule la présentation change (barre latérale façon panel entreprise au
// lieu d'une barre d'onglets en bas d'écran, inadaptée à un grand écran).
import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
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
  const unread = useUnreadInboxCount();

  return (
    <Tab.Navigator
      initialRouteName="Accueil"
      tabBar={(props) => <WebSidebar {...props} />}
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarPosition: "left",
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
        options={{ tabBarBadge: unread > 0 ? unread : undefined }}
      />
      <Tab.Screen name="Menu" component={MenuStack} />
    </Tab.Navigator>
  );
}
