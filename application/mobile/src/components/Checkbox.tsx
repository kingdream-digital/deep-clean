import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeProvider";

interface CheckboxProps {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}

export function Checkbox({ label, checked, onChange }: CheckboxProps) {
  const { colors, radius, spacing, type } = useTheme();

  return (
    <Pressable
      onPress={() => onChange(!checked)}
      style={styles.row}
      hitSlop={8}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
    >
      <View
        style={[
          styles.box,
          {
            borderRadius: radius.sm - 4,
            // Fond plein sous une icône : utiliser accentDeep (foncé), jamais
            // colors.accent — en sombre c'est la valeur claire de la rampe et
            // le contraste avec l'icône s'effondrerait.
            borderColor: checked ? colors.accentDeep : colors.borderStrong,
            backgroundColor: checked ? colors.accentDeep : "transparent",
          },
        ]}
      >
        {!!checked && <Ionicons name="checkmark" size={14} color={colors.onAccent} />}
      </View>
      <Text style={[type.callout, { color: colors.ink, marginLeft: spacing.sm }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  box: {
    width: 22,
    height: 22,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
});
