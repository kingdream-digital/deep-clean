import React, { useCallback, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Animated, { FadeInUp } from "react-native-reanimated";
import { ScreenContainer } from "../../components/ScreenContainer";
import { StateView } from "../../components/StateView";
import { Avatar } from "../../components/Avatar";
import { ListGroup, ListRow } from "../../components/GroupedList";
import { DataTable, DataTableColumn } from "../../components/DataTable";
import { useTheme } from "../../theme/ThemeProvider";
import { useResponsive } from "../../hooks/useResponsive";
import { listUsers } from "../../api/users.api";
import type { DirectoryUser } from "../../api/users.api";
import type { MenuStackParamList } from "../../navigation/MenuStack";
import { ROLE_LABELS_SHORT, groupByRole } from "../../utils/roleLabels";
import { useLiveFocusEffect, isBackgroundRefresh } from "../../sync/liveSync";

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
  const { spacing } = useTheme();
  const { isDesktopWeb } = useResponsive();
  const navigation = useNavigation<NativeStackNavigationProp<MenuStackParamList>>();

  const [items, setItems] = useState<DirectoryUser[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  const load = useCallback(async () => {
    const silent = isBackgroundRefresh();
    try {
      if (!silent) setState("loading");
      const res = await listUsers({ isActive: true });
      setItems(res.items);
      setState("ready");
    } catch {
      if (!silent) setState("error");
    }
  }, []);

  useLiveFocusEffect(
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
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: spacing.lg, paddingBottom: spacing.xxxl }}>
          {/* Même présentation que la liste des comptes : groupée par rôle,
              triée par nom, avec la photo de profil (jusqu'ici des initiales
              alors que la photo existait). */}
          {groupByRole(items).map((group, index) => (
            <Animated.View key={group.role} entering={FadeInUp.delay(Math.min(index, 4) * 50).duration(280)}>
              <ListGroup title={group.title} count={group.people.length}>
                {group.people.map((item) => (
                  <ListRow
                    key={item.id}
                    title={`${item.firstName} ${item.lastName}`}
                    leading={<Avatar user={item} size={40} />}
                    onPress={() =>
                      navigation.navigate("EmployeeHours", { userId: item.id, fullName: `${item.firstName} ${item.lastName}` })
                    }
                  />
                ))}
              </ListGroup>
            </Animated.View>
          ))}
        </ScrollView>
      )}
    </ScreenContainer>
  );
}

// Photo de profil devant le nom, comme sur téléphone (le tableau sur
// ordinateur n'affichait que le nom).
function StaffNameCell({ item }: { item: DirectoryUser }) {
  const { colors, spacing, type } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      <View style={{ opacity: item.isActive === false ? 0.45 : 1 }}>
        <Avatar user={item} size={28} />
      </View>
      <Text style={[type.callout, { color: colors.ink, fontWeight: "600", marginLeft: spacing.sm, flex: 1 }]} numberOfLines={1}>
        {item.firstName} {item.lastName}
      </Text>
    </View>
  );
}

function StaffRoleCell({ item }: { item: DirectoryUser }) {
  const { colors, type } = useTheme();
  return <Text style={[type.footnote, { color: colors.inkSecondary }]}>{ROLE_LABELS_SHORT[item.role]}</Text>;
}
