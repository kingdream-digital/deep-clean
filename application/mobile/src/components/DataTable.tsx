import React, { useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeProvider";
import { Card } from "./Card";

export interface DataTableColumn<T> {
  key: string;
  label: string;
  /** Poids relatif de la colonne (comme `flex`). Par défaut 1. */
  flex?: number;
  render: (item: T) => React.ReactNode;
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  data: T[];
  keyExtractor: (item: T) => string;
  onRowPress?: (item: T) => void;
}

/**
 * Tableau de données pour le panel web — remplace la pile de cartes mobile
 * sur les écrans de liste (Comptes, Chantiers…) quand la largeur d'écran le
 * permet. Composant volontairement générique (colonnes typées par appelant)
 * pour être réutilisé sur d'autres listes sans dupliquer la mise en page.
 */
export function DataTable<T>({ columns, data, keyExtractor, onRowPress }: DataTableProps<T>) {
  const { colors, spacing, type } = useTheme();

  return (
    <Card padded={false}>
      <View
        style={[
          styles.row,
          { paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
        ]}
      >
        {columns.map((col) => (
          <Text
            key={col.key}
            style={[type.caption, { color: colors.inkTertiary, flex: col.flex ?? 1, textTransform: "uppercase" }]}
          >
            {col.label}
          </Text>
        ))}
        {onRowPress && <View style={{ width: 24 }} />}
      </View>

      <FlatList
        data={data}
        keyExtractor={keyExtractor}
        scrollEnabled={false}
        ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: colors.border }} />}
        renderItem={({ item }) => (
          <DataTableRow item={item} columns={columns} onPress={onRowPress ? () => onRowPress(item) : undefined} />
        )}
      />
    </Card>
  );
}

function DataTableRow<T>({
  item,
  columns,
  onPress,
}: {
  item: T;
  columns: DataTableColumn<T>[];
  onPress?: () => void;
}) {
  const { colors, spacing } = useTheme();
  const [hovered, setHovered] = useState(false);

  const cells = (
    <>
      {columns.map((col) => (
        <View key={col.key} style={{ flex: col.flex ?? 1 }}>
          {col.render(item)}
        </View>
      ))}
      {onPress && <Ionicons name="chevron-forward" size={16} color={colors.inkTertiary} />}
    </>
  );

  // Sans `onPress` (ex. lignes avec seulement des boutons d'action en
  // cellule, Validation des heures / Absences), la ligne elle-même ne doit
  // PAS être un élément interactif : un `Pressable` sans action deviendrait
  // quand même focusable au clavier (comportement par défaut de
  // react-native-web), un arrêt de tabulation inutile qui ne fait rien.
  if (!onPress) {
    return (
      <View style={[styles.row, { paddingVertical: spacing.sm, paddingHorizontal: spacing.lg }]}>{cells}</View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      // web uniquement (react-native-web) : pas d'équivalent natif, sans effet sur iOS/Android.
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={[
        styles.row,
        { paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, backgroundColor: hovered ? colors.surfaceAlt : "transparent" },
      ]}
    >
      {cells}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
});
