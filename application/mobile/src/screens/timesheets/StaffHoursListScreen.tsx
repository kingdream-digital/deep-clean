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
import { useResponsive } from "../../hooks/useResponsive";
import { listUsers } from "../../api/users.api";
import type { DirectoryUser } from "../../api/users.api";
import type { MenuStackParamList } from "../../navigation/MenuStack";

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
    render: (item) => <StaffNameCell item={item} />,
  },
  {
    key: "role",
    label: "Rôle",
    render: (item) => <StaffRoleCell item={item} />,
  },
];

// Point d'entrée du dossier d'heures par personne (voir EmployeeHoursScreen) —
// même annuaire que UsersListScreen mais navigue vers le dossier d'heures
// plutôt que la fiche de compte.
export function StaffHoursListScreen() {
  const { colors, spacing, radius, type } = useTheme();
  const { isDesktopWeb } = useResponsive();
  const navigation = useNavigation<NativeStackNavigationProp<MenuStackParamList>>();

  const [items, setItems] = useState<DirectoryUser[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  const load = useCallback(async () => {
    try {
      setState("loading");
      const res = await listUsers({ isActive: true });
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
      {state === "loading" && <StateView kind="loading" />}
      {state === "error" && <StateView kind="error" onRetry={load} />}
      {state === "ready" && items.length === 0 && (
        <StateView kind="empty" icon="people-outline" message="Aucun compte actif pour le moment." />
      )}

      {state === "ready" && items.length > 0 && isDesktopWeb && (
        <View style={{ paddingTop: spacing.lg }}>
          <DataTable
            columns={TABLE_COLUMNS}
            data={items}
            keyExtractor={(item) => item.id}
            onRowPress={(item) =>
              navigation.navigate("EmployeeHours", { userId: item.id, fullName: `${item.firstName} ${item.lastName}` })
            }
          />
        </View>
      )}

      {state === "ready" && items.length > 0 && !isDesktopWeb && (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingTop: spacing.lg, paddingBottom: spacing.xxxl }}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          renderItem={({ item, index }) => (
            <Animated.View entering={FadeInUp.delay(Math.min(index, 6) * 40).duration(280)}>
              <PressableScale
                onPress={() =>
                  navigation.navigate("EmployeeHours", {
                    userId: item.id,
                    fullName: `${item.firstName} ${item.lastName}`,
                  })
                }
              >
                <Card style={styles.row}>
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: radius.pill,
                      backgroundColor: colors.accentSoft,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text style={[type.callout, { color: colors.accent }]}>
                      {item.firstName[0]}
                      {item.lastName[0]}
                    </Text>
                  </View>
                  <View style={{ marginLeft: spacing.md, flex: 1 }}>
                    <Text style={[type.headline, { color: colors.ink }]} numberOfLines={1}>
                      {item.firstName} {item.lastName}
                    </Text>
                    <Text style={[type.footnote, { color: colors.inkTertiary, marginTop: 2 }]} numberOfLines={1}>
                      {ROLE_LABELS[item.role]}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.inkTertiary} />
                </Card>
              </PressableScale>
            </Animated.View>
          )}
        />
      )}
    </ScreenContainer>
  );
}

function StaffNameCell({ item }: { item: DirectoryUser }) {
  const { colors, type } = useTheme();
  return (
    <Text style={[type.callout, { color: colors.ink, fontWeight: "600" }]} numberOfLines={1}>
      {item.firstName} {item.lastName}
    </Text>
  );
}

function StaffRoleCell({ item }: { item: DirectoryUser }) {
  const { colors, type } = useTheme();
  return <Text style={[type.footnote, { color: colors.inkSecondary }]}>{ROLE_LABELS[item.role]}</Text>;
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
});
