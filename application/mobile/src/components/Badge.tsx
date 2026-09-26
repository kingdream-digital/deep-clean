import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "../theme/ThemeProvider";

interface BadgeProps {
  count: number;
  max?: number;
}

export function Badge({ count, max = 99 }: BadgeProps) {
  const { colors, radius } = useTheme();
  if (count <= 0) return null;

  return (
    <View style={[styles.badge, { backgroundColor: colors.danger, borderRadius: radius.pill }]}>
      <Text style={styles.text}>{count > max ? `${max}+` : count}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  text: { color: "#FFFFFF", fontSize: 11, fontWeight: "700" },
});
