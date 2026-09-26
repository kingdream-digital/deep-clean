import React from "react";
import { FlatList, Modal, Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeProvider";
import { Checkbox } from "./Checkbox";
import { Button } from "./Button";
import type { DirectoryUser } from "../api/users.api";

interface EmployeePickerModalProps {
  visible: boolean;
  employees: DirectoryUser[];
  selectedIds: string[];
  onToggle: (userId: string) => void;
  onClose: () => void;
}

// Sélection multiple d'employés (rôle EMPLOYEE) pour une mission — le chef
// d'équipe se désigne séparément (retour explicite du client : un vrai
// compte au rôle Chef d'équipe, jamais une étoile posée ici sur un employé).
export function EmployeePickerModal({ visible, employees, selectedIds, onToggle, onClose }: EmployeePickerModalProps) {
  const { colors, spacing, type } = useTheme();

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
          data={employees}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: spacing.lg }}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          ListEmptyComponent={
            <Text style={[type.callout, { color: colors.inkSecondary, textAlign: "center", marginTop: spacing.xl }]}>
              Aucun employé actif disponible.
            </Text>
          }
          renderItem={({ item }) => {
            const selected = selectedIds.includes(item.id);
            return (
              <View style={[styles.row, { paddingVertical: spacing.xs }]}>
                <Checkbox label={`${item.firstName} ${item.lastName}`} checked={selected} onChange={() => onToggle(item.id)} />
              </View>
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
