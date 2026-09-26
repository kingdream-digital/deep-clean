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
import { useTheme } from "../../theme/ThemeProvider";
import { useAuth } from "../../auth/AuthContext";
import { useResponsive } from "../../hooks/useResponsive";
import { listUsers } from "../../api/users.api";
import type { DirectoryUser } from "../../api/users.api";
import type { HomeStackParamList } from "../../navigation/HomeStack";

const CREATE_ROLES = ["HR", "ADMIN"];

const ROLE_LABELS: Record<DirectoryUser["role"], string> = {
  EMPLOYEE: "Employé",
  SITE_MANAGER: "Chef d'équipe",
  SUPERVISOR: "Superviseur",
  HR: "RH",
  DIRECTOR: "Directeur",
  ADMIN: "Admin",
};

const TABLE_COLUMNS: DataTableColumn<DirectoryUser>[] = [
  {
    key: "name",
    label: "Nom",
    flex: 2,
    render: (item) => <UserNameCell item={item} />,
  },
  {
    key: "role",
    label: "Rôle",
    render: (item) => <RoleCell item={item} />,
  },
  {
    key: "username",
    label: "Identifiant",
    flex: 2,
    render: (item) => <FootnoteCell text={item.username} />,
  },
  {
    key: "status",
    label: "Statut",
    render: (item) => <StatusCell active={item.isActive} />,
  },
];

export function UsersListScreen() {
  const { colors, spacing, radius, type } = useTheme();
  const { user } = useAuth();
  const { isDesktopWeb } = useResponsive();
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();

  const [items, setItems] = useState<DirectoryUser[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  const canCreate = user ? CREATE_ROLES.includes(user.role) : false;

  const load = useCallback(async () => {
    try {
      setState("loading");
      const res = await listUsers();
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
            <Text style={[type.title1, { color: colors.ink }]}>Comptes</Text>
            <Text style={[type.subhead, { color: colors.inkSecondary, marginTop: spacing.xxs }]}>
              {items.length} {items.length > 1 ? "comptes" : "compte"}
            </Text>
          </View>
          {canCreate && (
            <View style={{ width: 200 }}>
              <PressableScale onPress={() => navigation.navigate("UserForm", undefined)}>
                <View style={[styles.desktopCreateBtn, { backgroundColor: colors.accent, borderRadius: 12 }]}>
                  <Ionicons name="add" size={18} color={colors.onAccent} />
                  <Text style={[type.callout, { color: colors.onAccent, fontWeight: "600", marginLeft: 6 }]}>
                    Nouveau compte
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
        <StateView kind="empty" icon="people-outline" message="Aucun compte pour le moment." />
      )}

      {state === "ready" && items.length > 0 && isDesktopWeb && (
        <DataTable
          columns={TABLE_COLUMNS}
          data={items}
          keyExtractor={(item) => item.id}
          onRowPress={(item) => navigation.navigate("UserDetail", { userId: item.id })}
        />
      )}

      {state === "ready" && items.length > 0 && !isDesktopWeb && (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingTop: spacing.lg, paddingBottom: spacing.xxxl }}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          renderItem={({ item, index }) => (
            <Animated.View entering={FadeInUp.delay(Math.min(index, 6) * 40).duration(280)}>
              <PressableScale onPress={() => navigation.navigate("UserDetail", { userId: item.id })}>
                <Card style={styles.row}>
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: radius.pill,
                      backgroundColor: item.isActive === false ? colors.neutralSoft : colors.accentSoft,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text style={[type.callout, { color: item.isActive === false ? colors.neutral : colors.accent }]}>
                      {item.firstName[0]}
                      {item.lastName[0]}
                    </Text>
                  </View>
                  <View style={{ marginLeft: spacing.md, flex: 1 }}>
                    <Text style={[type.headline, { color: colors.ink }]} numberOfLines={1}>
                      {item.firstName} {item.lastName}
                    </Text>
                    <Text style={[type.footnote, { color: colors.inkTertiary, marginTop: 2 }]} numberOfLines={1}>
                      {ROLE_LABELS[item.role]} · {item.username}
                    </Text>
                  </View>
                  {item.isActive === false && <Text style={[type.caption, { color: colors.neutral }]}>DÉSACTIVÉ</Text>}
                  <Ionicons name="chevron-forward" size={18} color={colors.inkTertiary} style={{ marginLeft: spacing.xs }} />
                </Card>
              </PressableScale>
            </Animated.View>
          )}
        />
      )}

      {!isDesktopWeb && canCreate && (
        <Animated.View entering={FadeInUp.duration(280)} style={styles.fab}>
          <PressableScale
            pressedScale={0.9}
            onPress={() => navigation.navigate("UserForm", undefined)}
            accessibilityRole="button"
            accessibilityLabel="Nouveau compte"
            style={[styles.fabInner, { backgroundColor: colors.accent, borderRadius: radius.pill, shadowColor: colors.shadow }]}
          >
            <Ionicons name="add" size={26} color={colors.onAccent} />
          </PressableScale>
        </Animated.View>
      )}
    </ScreenContainer>
  );
}

function UserNameCell({ item }: { item: DirectoryUser }) {
  const { colors, type } = useTheme();
  return (
    <Text style={[type.callout, { color: colors.ink, fontWeight: "600" }]} numberOfLines={1}>
      {item.firstName} {item.lastName}
    </Text>
  );
}

function RoleCell({ item }: { item: DirectoryUser }) {
  const { colors, type } = useTheme();
  return <Text style={[type.footnote, { color: colors.inkSecondary }]}>{ROLE_LABELS[item.role]}</Text>;
}

function FootnoteCell({ text }: { text: string }) {
  const { colors, type } = useTheme();
  return (
    <Text style={[type.footnote, { color: colors.inkSecondary }]} numberOfLines={1}>
      {text}
    </Text>
  );
}

function StatusCell({ active }: { active?: boolean }) {
  const { colors, spacing, type } = useTheme();
  // `active` est absent (jamais `false`) pour un appelant qui n'a que la vue
  // "annuaire" (chef d'équipe, superviseur — voir backend contactSelect ;
  // la RH, la direction et l'admin voient le statut complet) : ne jamais
  // afficher "Désactivé" par défaut dans ce cas, ce serait une information
  // fausse plutôt qu'une simple absence de donnée.
  if (active === undefined) return null;
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
        {active ? "Actif" : "Désactivé"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
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
