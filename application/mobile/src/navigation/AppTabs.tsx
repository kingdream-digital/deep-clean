import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeProvider";
import { useUnreadInboxCount } from "../hooks/useUnreadInboxCount";
import { HomeStack } from "./HomeStack";
import { PlanningStack } from "./PlanningStack";
import { MissionsStack } from "./MissionsStack";
import { InboxStack } from "./InboxStack";
import { MenuStack } from "./MenuStack";
import { ICONS } from "./appTabsShared";
import type { AppTabsParamList } from "./appTabsShared";

export type { AppTabsParamList };

const Tab = createBottomTabNavigator<AppTabsParamList>();

export function AppTabs() {
  const { colors } = useTheme();
  const unread = useUnreadInboxCount();

  return (
    <Tab.Navigator
      // Tous les rôles arrivent directement sur le tableau de bord : l'essentiel
      // (missions du jour, équipe, chantiers, signalements, activité récente)
      // y est visible sans clic, le planning détaillé reste à un onglet de là.
      initialRouteName="Accueil"
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.inkTertiary,
        tabBarStyle: { backgroundColor: colors.backgroundElevated, borderTopColor: colors.border },
        tabBarIcon: ({ color, size }) => <Ionicons name={ICONS[route.name]} size={size} color={color} />,
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
