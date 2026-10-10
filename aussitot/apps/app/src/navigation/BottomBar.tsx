import { View } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Bell, CalendarDays, FileText, House, LayoutGrid, UserRound, type LucideProps } from "lucide-react-native";
import type { ComponentType } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { useAssistantSession } from "@/assistant/AssistantProvider";
import { VoiceOrb } from "@/assistant/VoiceOrb";
import { useTheme } from "@/theme/ThemeProvider";
import { PressableScale, Text } from "@/ui";
import { goTopLevel } from "./goTopLevel";
import { useUnreadCount } from "./useUnreadCount";

interface Tab {
  key: string;
  label: string;
  href: string;
  icon: ComponentType<LucideProps>;
  match: string[];
  badge?: number;
}

/**
 * Barre d'onglets du téléphone : quatre sections et, au centre, le micro de
 * l'assistant (un toucher : l'assistant s'ouvre et écoute ; appui long :
 * ouverture pour écrire).
 */
export function BottomBar() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const router = useRouter();
  const { can } = useAuth();
  const { requestListen } = useAssistantSession();
  const unread = useUnreadCount();
  const manager = can("quotes.read") || can("users.read");

  const tabs: Tab[] = [
    { key: "home", label: "Accueil", href: "/", icon: House, match: ["/"] },
    { key: "planning", label: "Planning", href: "/planning", icon: CalendarDays, match: ["/planning"] },
    manager && can("quotes.read")
      ? { key: "sales", label: "Ventes", href: "/devis", icon: FileText, match: ["/devis", "/factures", "/clients"] }
      : { key: "notifications", label: "Alertes", href: "/notifications", icon: Bell, match: ["/notifications"], badge: unread },
    manager
      ? {
          key: "more",
          label: "Plus",
          href: "/plus",
          icon: LayoutGrid,
          match: ["/plus", "/notifications", "/equipe", "/activite", "/reglages", "/profil"],
          badge: unread,
        }
      : { key: "profile", label: "Profil", href: "/profil", icon: UserRound, match: ["/profil"] },
  ];

  const renderTab = (tab: Tab) => {
    const active = tab.match.some((m) => (m === "/" ? pathname === "/" : pathname === m || pathname.startsWith(`${m}/`)));
    const Icon = tab.icon;
    return (
      <PressableScale
        key={tab.key}
        onPress={() => goTopLevel(tab.href)}
        haptic="selection"
        scaleTo={0.92}
        accessibilityRole="tab"
        accessibilityState={{ selected: active }}
        accessibilityLabel={tab.badge ? `${tab.label}, ${tab.badge} notifications non lues` : tab.label}
        testID={`tab-${tab.key}`}
        style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 3, paddingTop: 8, minHeight: 52 }}
      >
        <View>
          <Icon size={23} color={active ? colors.accent : colors.textTertiary} strokeWidth={active ? 2.3 : 2} />
          {tab.badge ? (
            <View
              style={{
                position: "absolute",
                top: -4,
                right: -9,
                minWidth: 18,
                height: 18,
                borderRadius: 9,
                paddingHorizontal: 4,
                backgroundColor: colors.spark,
                borderWidth: 2,
                borderColor: colors.surface,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ fontSize: 10, lineHeight: 12, color: "#FFFFFF" }} weight="bold">
                {tab.badge > 9 ? "9+" : tab.badge}
              </Text>
            </View>
          ) : null}
        </View>
        <Text
          variant="caption"
          style={{ fontSize: 11, color: active ? colors.accent : colors.textTertiary }}
          weight={active ? "semibold" : "medium"}
        >
          {tab.label}
        </Text>
      </PressableScale>
    );
  };

  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        backgroundColor: colors.surface,
        borderTopWidth: 1,
        borderTopColor: colors.border,
        paddingBottom: Math.max(insets.bottom, 8),
        paddingHorizontal: 6,
      }}
    >
      {tabs.slice(0, 2).map(renderTab)}
      <View style={{ width: 76, alignItems: "center" }}>
        <View style={{ marginTop: -22, borderRadius: 40, padding: 5, backgroundColor: colors.surface }}>
          <VoiceOrb
            size={58}
            listening={false}
            onPress={() => {
              requestListen();
              router.push("/assistant");
            }}
            onLongPress={() => router.push("/assistant")}
            label="Parler à l'assistant"
          />
        </View>
      </View>
      {tabs.slice(2).map(renderTab)}
    </View>
  );
}
