import { useEffect } from "react";
import { Platform, ScrollView, View } from "react-native";
import { usePathname } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AudioLines, ChevronRight } from "lucide-react-native";
import { BRAND, ROLE_LABELS } from "@aussitot/shared";
import { useAuth } from "@/auth/AuthProvider";
import { useAssistantSession } from "@/assistant/AssistantProvider";
import { useTheme } from "@/theme/ThemeProvider";
import { Avatar, PressableScale, Text, Wordmark } from "@/ui";
import { NAV_ITEMS, isActive } from "./items";
import { goTopLevel } from "./goTopLevel";
import { useUnreadCount } from "./useUnreadCount";

/** Barre latérale (ordinateur, tablette paysage) : sections selon le rôle, assistant toujours à portée (Ctrl/⌘ + K). */
export function Sidebar() {
  const { colors, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const { user, can } = useAuth();
  const { panelOpen, setPanelOpen } = useAssistantSession();
  const unread = useUnreadCount();
  const isMac = Platform.OS === "web" && typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPanelOpen(!panelOpen);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [panelOpen, setPanelOpen]);

  if (!user) return null;
  const items = NAV_ITEMS.filter((item) => !item.permission || can(item.permission));
  const onProfile = pathname === "/profil";

  return (
    <View
      style={{
        width: 264,
        borderRightWidth: 1,
        borderRightColor: colors.border,
        backgroundColor: colors.surface,
        paddingTop: insets.top + 22,
        paddingBottom: 14,
      }}
    >
      <View style={{ paddingHorizontal: 22, gap: 6, marginBottom: 22 }}>
        <Wordmark size={20} />
        <Text variant="footnote" tone="tertiary" numberOfLines={1}>
          {user.organization.name}
        </Text>
      </View>

      <View style={{ paddingHorizontal: 14 }}>
        <PressableScale
          onPress={() => setPanelOpen(!panelOpen)}
          accessibilityLabel={panelOpen ? "Fermer l'assistant" : `Ouvrir l'assistant ${BRAND.assistantName}`}
          accessibilityState={{ expanded: panelOpen }}
          scaleTo={0.98}
          haptic="medium"
          style={{ borderRadius: radius.md, overflow: "hidden" }}
          testID="sidebar-assistant"
        >
          <LinearGradient
            colors={["#2347F5", "#5B3FF0"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 12 }}
          >
            <View
              style={{
                width: 30,
                height: 30,
                borderRadius: 15,
                backgroundColor: "rgba(255,255,255,0.18)",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <AudioLines size={17} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="subhead" weight="semibold" style={{ color: "#FFFFFF" }}>
                {panelOpen ? "Assistant ouvert" : "Demander à l'assistant"}
              </Text>
              <Text variant="caption" style={{ color: "rgba(255,255,255,0.78)" }}>
                {Platform.OS === "web" ? `${isMac ? "⌘" : "Ctrl"} + K` : "Voix ou texte"}
              </Text>
            </View>
          </LinearGradient>
        </PressableScale>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 18, gap: 2 }} accessibilityRole="menu">
        {items.map((item) => {
          const active = isActive(item, pathname);
          const Icon = item.icon;
          const count = item.badge === "notifications" ? unread : 0;
          return (
            <PressableScale
              key={item.key}
              onPress={() => goTopLevel(item.href)}
              scaleTo={0.98}
              haptic="selection"
              accessibilityRole="menuitem"
              accessibilityState={{ selected: active }}
              accessibilityLabel={count ? `${item.label}, ${count} non lues` : item.label}
              testID={`nav-${item.key}`}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                minHeight: 44,
                paddingHorizontal: 12,
                borderRadius: radius.sm,
                backgroundColor: active ? colors.accentSoft : "transparent",
              }}
              pressedStyle={{ backgroundColor: active ? colors.accentSoft : colors.surfacePressed }}
            >
              <Icon size={20} color={active ? colors.accentText : colors.textSecondary} strokeWidth={active ? 2.3 : 2} />
              <Text variant="callout" weight={active ? "semibold" : "medium"} tone={active ? "accent" : "secondary"} style={{ flex: 1 }}>
                {item.label}
              </Text>
              {count ? (
                <View
                  style={{
                    minWidth: 22,
                    height: 22,
                    borderRadius: 11,
                    paddingHorizontal: 6,
                    backgroundColor: colors.spark,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text variant="caption" weight="bold" style={{ color: "#FFFFFF" }}>
                    {count > 99 ? "99+" : count}
                  </Text>
                </View>
              ) : null}
            </PressableScale>
          );
        })}
      </ScrollView>

      <View style={{ paddingHorizontal: 14 }}>
        <PressableScale
          onPress={() => goTopLevel("/profil")}
          scaleTo={0.98}
          accessibilityLabel={`Mon profil : ${user.firstName} ${user.lastName}, ${ROLE_LABELS[user.role]}`}
          accessibilityState={{ selected: onProfile }}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            padding: 10,
            borderRadius: radius.md,
            backgroundColor: onProfile ? colors.accentSoft : colors.surfaceMuted,
          }}
          pressedStyle={{ backgroundColor: colors.surfacePressed }}
          testID="nav-profile"
        >
          <Avatar firstName={user.firstName} lastName={user.lastName} size={36} />
          <View style={{ flex: 1 }}>
            <Text variant="subhead" weight="semibold" numberOfLines={1}>
              {user.firstName} {user.lastName}
            </Text>
            <Text variant="caption" tone="tertiary" numberOfLines={1}>
              {ROLE_LABELS[user.role]}
            </Text>
          </View>
          <ChevronRight size={16} color={colors.textTertiary} />
        </PressableScale>
      </View>
    </View>
  );
}
