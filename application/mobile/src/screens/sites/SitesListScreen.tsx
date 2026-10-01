import React, { useCallback, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Animated, { FadeInUp } from "react-native-reanimated";
import { ScreenContainer } from "../../components/ScreenContainer";
import { StateView } from "../../components/StateView";
import { Card } from "../../components/Card";
import { PressableScale } from "../../components/PressableScale";
import { DataTable, DataTableColumn } from "../../components/DataTable";
import { AuthenticatedImage } from "../../components/AuthenticatedImage";
import { useTheme } from "../../theme/ThemeProvider";
import { useAuth } from "../../auth/AuthContext";
import { useResponsive } from "../../hooks/useResponsive";
import { listSites, sitePhotoUrl } from "../../api/sites.api";
import type { Site } from "../../api/sites.api";
import type { HomeStackParamList } from "../../navigation/HomeStack";

const CREATE_ROLES = ["SUPERVISOR", "HR", "DIRECTOR", "ADMIN"];

const TABLE_COLUMNS: DataTableColumn<Site>[] = [
  {
    key: "name",
    label: "Chantier",
    flex: 2,
    render: (item) => <SiteNameCell item={item} />,
  },
  {
    key: "address",
    label: "Adresse",
    flex: 2,
    render: (item) => <SiteFootnoteCell text={item.address} />,
  },
  {
    key: "manager",
    label: "Chef d'équipe",
    render: (item) => (
      <SiteFootnoteCell text={item.manager ? `${item.manager.firstName} ${item.manager.lastName}` : "—"} />
    ),
  },
  {
    key: "status",
    label: "Statut",
    render: (item) => <SiteStatusCell active={item.isActive} />,
  },
];

export function SitesListScreen() {
  const { colors, spacing, radius, type } = useTheme();
  const { user } = useAuth();
  const { isDesktopWeb } = useResponsive();
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();

  const [items, setItems] = useState<Site[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  const canCreate = user ? CREATE_ROLES.includes(user.role) : false;

  const load = useCallback(async () => {
    try {
      setState("loading");
      const res = await listSites();
      setItems(res.items);
      setState("ready");
    } catch {
      setState("error");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  return (
    <ScreenContainer>
      {isDesktopWeb && state === "ready" && (
        <View style={[styles.desktopHeader, { paddingTop: spacing.lg, marginBottom: spacing.lg }]}>
          <View>
            <Text style={[type.title1, { color: colors.ink }]}>Chantiers</Text>
            <Text style={[type.subhead, { color: colors.inkSecondary, marginTop: spacing.xxs }]}>
              {items.length} {items.length > 1 ? "chantiers" : "chantier"}
            </Text>
          </View>
          {canCreate && (
            <View style={{ width: 200 }}>
              <PressableScale onPress={() => navigation.navigate("SiteForm", undefined)}>
                <View style={[styles.desktopCreateBtn, { backgroundColor: colors.accentFill, borderRadius: 12 }]}>
                  <Ionicons name="add" size={18} color={colors.onAccent} />
                  <Text style={[type.callout, { color: colors.onAccent, fontWeight: "600", marginLeft: 6 }]}>
                    Nouveau chantier
                  </Text>
                </View>
              </PressableScale>
            </View>
          )}
        </View>
      )}

      {state === "loading" && <StateView kind="loading" />}
      {state === "error" && <StateView kind="error" onRetry={load} />}
      {state === "ready" && items.length === 0 && (
        <StateView kind="empty" icon="business-outline" message="Aucun chantier pour le moment." />
      )}

      {state === "ready" && items.length > 0 && isDesktopWeb && (
        <DataTable
          columns={TABLE_COLUMNS}
          data={items}
          keyExtractor={(item) => item.id}
          onRowPress={(item) => navigation.navigate("SiteDetail", { siteId: item.id })}
        />
      )}

      {state === "ready" && items.length > 0 && !isDesktopWeb && (
        <>
          <Text style={[type.footnote, { color: colors.inkSecondary, marginTop: spacing.md }]}>
            {user?.role === "SITE_MANAGER"
              ? `${items.length} ${items.length > 1 ? "chantiers vous sont actuellement attribués." : "chantier vous est actuellement attribué."}`
              : `${items.length} ${items.length > 1 ? "chantiers au total." : "chantier au total."}`}
          </Text>
          <FlatList
            data={items}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingTop: spacing.md, paddingBottom: spacing.xxxl }}
            ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
            renderItem={({ item, index }) => (
              <Animated.View entering={FadeInUp.delay(Math.min(index, 6) * 40).duration(280)}>
                <PressableScale onPress={() => navigation.navigate("SiteDetail", { siteId: item.id })}>
                  <Card padded={false}>
                    {item.hasPhoto ? (
                      <AuthenticatedImage
                        uri={sitePhotoUrl(item.id)}
                        style={{ width: "100%", height: 90, backgroundColor: colors.surfaceAlt }}
                      />
                    ) : (
                      <View
                        style={{
                          width: "100%",
                          height: 90,
                          backgroundColor: item.isActive ? colors.accentSoft : colors.neutralSoft,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Ionicons name="business-outline" size={34} color={item.isActive ? colors.accent : colors.neutral} />
                      </View>
                    )}
                    <View style={{ padding: spacing.md }}>
                      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                        <Text style={[type.headline, { color: colors.ink, flex: 1 }]} numberOfLines={1}>
                          {item.name}
                        </Text>
                        <View
                          style={{
                            paddingHorizontal: spacing.sm,
                            paddingVertical: 4,
                            borderRadius: 999,
                            backgroundColor: item.isActive ? colors.successSoft : colors.neutralSoft,
                            marginLeft: spacing.sm,
                          }}
                        >
                          <Text style={[type.caption, { color: item.isActive ? colors.success : colors.neutral, fontWeight: "600" }]}>
                            {item.isActive ? "Actif" : "Inactif"}
                          </Text>
                        </View>
                      </View>
                      <Text style={[type.footnote, { color: colors.inkSecondary, marginTop: 3 }]} numberOfLines={1}>
                        {item.address}
                      </Text>
                      <View style={{ flexDirection: "row", alignItems: "center", marginTop: spacing.xs }}>
                        <Ionicons name="person-outline" size={14} color={colors.inkTertiary} />
                        <Text style={[type.footnote, { color: colors.inkSecondary, marginLeft: 6 }]} numberOfLines={1}>
                          {item.manager ? `Chef d'équipe : ${item.manager.firstName} ${item.manager.lastName}` : "Aucun chef d'équipe assigné"}
                        </Text>
                      </View>
                    </View>
                  </Card>
                </PressableScale>
              </Animated.View>
            )}
          />
        </>
      )}

      {!isDesktopWeb && canCreate && (
        <Animated.View entering={FadeInUp.duration(280)} style={styles.fab}>
          <PressableScale
            pressedScale={0.9}
            onPress={() => navigation.navigate("SiteForm", undefined)}
            accessibilityRole="button"
            accessibilityLabel="Nouveau chantier"
            style={[styles.fabInner, { backgroundColor: colors.accentFill, borderRadius: radius.pill, shadowColor: colors.shadow }]}
          >
            <Ionicons name="add" size={26} color={colors.onAccent} />
          </PressableScale>
        </Animated.View>
      )}
    </ScreenContainer>
  );
}

function SiteNameCell({ item }: { item: Site }) {
  const { colors, type } = useTheme();
  return (
    <Text style={[type.callout, { color: colors.ink, fontWeight: "600" }]} numberOfLines={1}>
      {item.name}
    </Text>
  );
}

function SiteFootnoteCell({ text }: { text: string }) {
  const { colors, type } = useTheme();
  return (
    <Text style={[type.footnote, { color: colors.inkSecondary }]} numberOfLines={1}>
      {text}
    </Text>
  );
}

function SiteStatusCell({ active }: { active: boolean }) {
  const { colors, spacing, type } = useTheme();
  return (
    <View
      style={{
        alignSelf: "flex-start",
        paddingVertical: 3,
        paddingHorizontal: spacing.xs,
        borderRadius: 6,
        backgroundColor: active ? colors.successSoft : colors.neutralSoft,
      }}
    >
      <Text style={[type.caption, { color: active ? colors.success : colors.neutral }]}>
        {active ? "Actif" : "Inactif"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fab: { position: "absolute", right: 20, bottom: 24 },
  fabInner: {
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  desktopHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  desktopCreateBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 11 },
});
