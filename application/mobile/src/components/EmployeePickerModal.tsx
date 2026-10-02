import React from "react";
import { FlatList, Modal, Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeProvider";
import { Avatar } from "./Avatar";
import { Button } from "./Button";
import type { DirectoryUser } from "../api/users.api";

// Disponibilité d'une personne pour le créneau de la mission : `blocking` =
// déjà sur une autre mission qui se recouvre, ou absente (impossible de la
// cocher) ; sinon simple information (autre mission plus tôt ou plus tard).
export interface Availability {
  blocking: boolean;
  label: string;
}

interface EmployeePickerModalProps {
  visible: boolean;
  employees: DirectoryUser[];
  selectedIds: string[];
  availability?: Record<string, Availability>;
  onToggle: (userId: string) => void;
  onClose: () => void;
}

// Sélection multiple d'employés (rôle EMPLOYEE) pour une mission — le chef
// d'équipe se désigne séparément (retour explicite du client : un vrai
// compte au rôle Chef d'équipe, jamais une étoile posée ici sur un employé).
export function EmployeePickerModal({ visible, employees, selectedIds, availability = {}, onToggle, onClose }: EmployeePickerModalProps) {
  const { colors, spacing, type } = useTheme();
  // Ordre alphabétique (prénom puis nom) : on retrouve quelqu'un d'un coup
  // d'œil, au lieu de l'ordre de création des comptes.
  // Les personnes disponibles d'abord, celles déjà prises ensuite.
  const sorted = React.useMemo(
    () =>
      [...employees].sort((a, b) => {
        const busyA = availability[a.id]?.blocking ? 1 : 0;
        const busyB = availability[b.id]?.blocking ? 1 : 0;
        if (busyA !== busyB) return busyA - busyB;
        return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`, "fr");
      }),
    [employees, availability]
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={[styles.header, { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomColor: colors.border }]}>
          <Text style={[type.title3, { color: colors.ink }]}>Affecter des employés</Text>
          <Pressable onPress={onClose} hitSlop={10}>
            <Ionicons name="close" size={24} color={colors.inkSecondary} />
          </Pressable>
        </View>

        <FlatList
          data={sorted}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: spacing.lg }}
          ItemSeparatorComponent={() => (
            <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: 36 + spacing.sm }} />
          )}
          ListEmptyComponent={
            <Text style={[type.callout, { color: colors.inkSecondary, textAlign: "center", marginTop: spacing.xl }]}>
              Aucun employé actif disponible.
            </Text>
          }
          renderItem={({ item }) => {
            const selected = selectedIds.includes(item.id);
            const info = availability[item.id];
            // Une personne déjà prise ne peut pas être cochée (on peut
            // toujours la décocher si elle l'était déjà).
            const locked = !!info?.blocking && !selected;
            // Toute la ligne est cliquable (photo, nom, coche à droite), comme
            // dans les listes de contacts d'iOS.
            return (
              <Pressable
                onPress={() => !locked && onToggle(item.id)}
                disabled={locked}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selected, disabled: locked }}
                accessibilityLabel={`${item.firstName} ${item.lastName}${info ? `, ${info.label}` : ""}`}
                style={({ pressed }) => [styles.row, { paddingVertical: spacing.sm, opacity: locked ? 0.55 : pressed ? 0.7 : 1 }]}
              >
                <Avatar user={item} size={36} />
                <View style={{ marginLeft: spacing.sm, flex: 1 }}>
                  <Text style={[type.body, { color: colors.ink }]} numberOfLines={1}>
                    {item.firstName} {item.lastName}
                  </Text>
                  {!!info && (
                    <Text
                      style={[type.footnote, { color: info.blocking ? colors.danger : colors.inkTertiary, marginTop: 1 }]}
                      numberOfLines={2}
                    >
                      {info.label}
                    </Text>
                  )}
                </View>
                <Ionicons
                  name={locked ? "ban-outline" : selected ? "checkmark-circle" : "ellipse-outline"}
                  size={24}
                  color={locked ? colors.danger : selected ? colors.accentFill : colors.borderStrong}
                />
              </Pressable>
            );
          }}
        />

        <View style={{ padding: spacing.lg }}>
          <Button label={`Valider (${selectedIds.length} sélectionné${selectedIds.length > 1 ? "s" : ""})`} onPress={onClose} />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: "row", alignItems: "center" },
});
