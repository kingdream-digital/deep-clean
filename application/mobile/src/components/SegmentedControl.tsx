import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../theme/ThemeProvider";

interface Option<T extends string> {
  label: string;
  value: T;
}

interface SegmentedControlProps<T extends string> {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
}

export function SegmentedControl<T extends string>({ options, value, onChange }: SegmentedControlProps<T>) {
  const { colors, radius, spacing, type } = useTheme();

  return (
    <View
      style={[
        styles.track,
        { backgroundColor: colors.surface, borderRadius: radius.md, padding: 3 },
      ]}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            style={[
              styles.segment,
              {
                borderRadius: radius.sm,
                backgroundColor: active ? colors.backgroundElevated : "transparent",
                paddingVertical: spacing.xs,
              },
            ]}
          >
            <Text
              style={[type.footnote, { color: active ? colors.ink : colors.inkSecondary, fontWeight: active ? "600" : "400", textAlign: "center" }]}
              numberOfLines={1}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: "row" },
  segment: { flex: 1 },
});
