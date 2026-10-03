import React, { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { CommonActions, getFocusedRouteNameFromRoute } from "@react-navigation/native";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useTheme } from "../../theme/ThemeProvider";
import { useAuth } from "../../auth/AuthContext";
import { PressableScale } from "../../components/PressableScale";
import { BrandLockup } from "../../components/BrandLockup";
import { AuthenticatedImage } from "../../components/AuthenticatedImage";
import { avatarUrl } from "../../api/users.api";
import type { Role } from "../../api/auth.api";
import type { MenuStackParamList } from "../MenuStack";
import { MY_ABSENCES_TITLE } from "../screenTitles";
import { TOOL_ENTRIES } from "../../screens/dashboard/MenuScreen";

const ROLE_LABELS: Record<Role, string> = {
  EMPLOYEE: "Employé",
  SITE_MANAGER: "Chef d'équipe",
  SUPERVISOR: "Superviseur",
  HR: "Ressources humaines",
  DIRECTOR: "Directeur",
  ADMIN: "Administrateur technique",
};

interface SidebarLink {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  screen: keyof MenuStackParamList;
}

// Destinations personnelles toujours présentes, quel que soit le rôle — les
// deux premières lignes de MenuScreen (voir screens/dashboard/MenuScreen.tsx),
// ici affichées directement plutôt que derrière un onglet "Menu".
const PERSONAL_LINKS: SidebarLink[] = [
  { icon: "person-outline", label: "Mon profil", screen: "Profile" },
  { icon: "calendar-outline", label: MY_ABSENCES_TITLE, screen: "MyAbsences" },
];

/**
 * Barre latérale du panel web, injectée via la prop `tabBar` du même
 * `createBottomTabNavigator` que sur mobile (voir AppTabs.web.tsx). Reçoit
 * exactement les routes/rôles déjà filtrés par AppTabs — aucune logique de
 * permission dupliquée ici, uniquement de la présentation.
 *
 * Toujours affichée en entier (icônes + libellés) : demande explicite du
 * client, jamais de rail d'icônes seules même sur une fenêtre étroite — s'il
 * n'y a pas assez de hauteur pour toutes les destinations, la liste défile
 * plutôt que de rogner un libellé (voir le ScrollView ci-dessous).
 *
 * L'onglet "Menu" n'apparaît plus comme une destination à part entière
 * (demande explicite du client : plus d'écriture "Menu") — ses écrans
 * (profil, absences, outils propres au rôle — voir TOOL_ENTRIES dans
 * MenuScreen.tsx) sont listés ici directement, à la suite des 4 onglets
 * principaux. La navigation cible toujours le même MenuStack imbriqué, donc
 * aucune permission ni logique de rôle n'est dupliquée : seule la
 * présentation change, d'un onglet "hub" à une liste à plat.
 */
export function WebSidebar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { colors, spacing, radius, type } = useTheme();
  const { user, logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);

  if (!user) return null;

  const initials = `${user.firstName[0] ?? ""}${user.lastName[0] ?? ""}`.toUpperCase();
  const width = 264;

  const primaryRoutes = state.routes.filter((route) => route.name !== "Menu");

  const menuRoute = state.routes.find((route) => route.name === "Menu");
  const menuTabFocused = !!menuRoute && state.index === state.routes.indexOf(menuRoute);
  const focusedMenuScreen = menuTabFocused
    ? (menuRoute ? getFocusedRouteNameFromRoute(menuRoute) : undefined) ?? "MenuHome"
    : undefined;

  const secondaryLinks: SidebarLink[] = [
    ...PERSONAL_LINKS,
    ...TOOL_ENTRIES[user.role].map((entry) => ({ icon: entry.icon, label: entry.label, screen: entry.screen })),
  ];

  function onPressSecondary(screen: keyof MenuStackParamList) {
    navigation.dispatch(CommonActions.navigate({ name: "Menu", params: { screen } }));
  }

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <View
      style={{
        width,
        alignSelf: "stretch",
        backgroundColor: colors.backgroundElevated,
        borderRightWidth: 1,
        borderRightColor: colors.border,
        paddingVertical: spacing.lg,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: spacing.lg,
          marginBottom: spacing.xl,
        }}
      >
        <BrandLockup height={34} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
        {primaryRoutes.map((route) => {
          const descriptor = descriptors[route.key];
          const { options } = descriptor;
          const focused = state.routes[state.index]?.key === route.key;
          const label = String(options.tabBarLabel ?? options.title ?? route.name);
          const badge = options.tabBarBadge;

          function onPress() {
            const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) {
              navigation.dispatch({
                ...CommonActions.navigate(route.name, route.params),
                target: state.key,
              });
            }
          }

          return (
            <PressableScale
              key={route.key}
              onPress={onPress}
              pressedScale={0.97}
              accessibilityRole="button"
              accessibilityLabel={label}
              accessibilityState={{ selected: focused }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginHorizontal: spacing.sm,
                marginBottom: spacing.xxs,
                paddingVertical: 11,
                paddingHorizontal: spacing.md,
                borderRadius: radius.md,
                backgroundColor: focused ? colors.accentSoft : "transparent",
              }}
            >
              {options.tabBarIcon?.({
                focused,
                color: focused ? colors.accent : colors.inkTertiary,
                size: 20,
              })}
              <Text
                style={[
                  type.callout,
                  { color: focused ? colors.accent : colors.inkSecondary, fontWeight: focused ? "600" : "400", marginLeft: spacing.sm, flex: 1 },
                ]}
              >
                {label}
              </Text>
              {badge != null && (
                <View
                  style={{
                    minWidth: 20,
                    height: 20,
                    borderRadius: 10,
                    paddingHorizontal: 6,
                    backgroundColor: colors.danger,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ color: colors.onAccent, fontSize: 11, fontWeight: "700" }}>{badge}</Text>
                </View>
              )}
            </PressableScale>
          );
        })}

        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: colors.border,
            marginHorizontal: spacing.md,
            marginVertical: spacing.sm,
          }}
        />

        {secondaryLinks.map((link) => {
          const focused = focusedMenuScreen === link.screen;
          return (
            <PressableScale
              key={link.screen}
              onPress={() => onPressSecondary(link.screen)}
              pressedScale={0.97}
              accessibilityRole="button"
              accessibilityLabel={link.label}
              accessibilityState={{ selected: focused }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginHorizontal: spacing.sm,
                marginBottom: spacing.xxs,
                paddingVertical: 11,
                paddingHorizontal: spacing.md,
                borderRadius: radius.md,
                backgroundColor: focused ? colors.accentSoft : "transparent",
              }}
            >
              <Ionicons name={link.icon} size={20} color={focused ? colors.accent : colors.inkTertiary} />
              <Text
                style={[
                  type.callout,
                  { color: focused ? colors.accent : colors.inkSecondary, fontWeight: focused ? "600" : "400", marginLeft: spacing.sm, flex: 1 },
                ]}
                numberOfLines={1}
              >
                {link.label}
              </Text>
            </PressableScale>
          );
        })}
      </ScrollView>

      <View
        style={{
          borderTopWidth: 1,
          borderTopColor: colors.border,
          paddingTop: spacing.md,
          paddingHorizontal: spacing.md,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: spacing.sm }}>
          {user.hasAvatar ? (
            <AuthenticatedImage
              uri={avatarUrl(user.id)}
              style={{ width: 34, height: 34, borderRadius: radius.pill }}
            />
          ) : (
            <View
              style={{
                width: 34,
                height: 34,
                borderRadius: radius.pill,
                backgroundColor: colors.accentSoft,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={[type.caption, { color: colors.accent }]}>{initials}</Text>
            </View>
          )}
          <View style={{ marginLeft: spacing.sm, flex: 1 }}>
            <Text style={[type.footnote, { color: colors.ink, fontWeight: "600" }]} numberOfLines={1}>
              {user.firstName} {user.lastName}
            </Text>
            <Text style={[type.caption, { color: colors.inkTertiary }]} numberOfLines={1}>
              {ROLE_LABELS[user.role]}
            </Text>
          </View>
        </View>

        <Pressable
          onPress={handleLogout}
          disabled={loggingOut}
          accessibilityRole="button"
          accessibilityLabel="Se déconnecter"
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingVertical: spacing.xs,
            opacity: loggingOut ? 0.5 : 1,
          }}
        >
          <Ionicons name="log-out-outline" size={18} color={colors.danger} />
          <Text style={[type.footnote, { color: colors.danger, marginLeft: spacing.xs }]}>Se déconnecter</Text>
        </Pressable>
      </View>
    </View>
  );
}
