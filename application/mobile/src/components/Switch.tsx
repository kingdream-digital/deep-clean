import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useTheme } from "../theme/ThemeProvider";

interface SwitchProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
  accessibilityLabel?: string;
  disabled?: boolean;
}

export function Switch({ value, onValueChange, accessibilityLabel, disabled }: SwitchProps) {
  const { colors } = useTheme();

  return (
    <Pressable
      onPress={() => !disabled && onValueChange(!value)}
      hitSlop={8}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.track,
        { backgroundColor: value ? colors.accentDeep : colors.border, opacity: disabled ? 0.5 : 1 },
      ]}
    >
      <View style={[styles.thumb, { backgroundColor: colors.backgroundElevated, alignSelf: value ? "flex-end" : "flex-start" }]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: { width: 44, height: 26, borderRadius: 999, padding: 3, justifyContent: "center" },
  thumb: { width: 20, height: 20, borderRadius: 999, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
});
