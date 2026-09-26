import React, { useState } from "react";
import { StyleSheet, Text, TextInput, TextInputProps, View, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeProvider";

interface TextFieldProps extends TextInputProps {
  label: string;
  error?: string;
  isPassword?: boolean;
}

export function TextField({ label, error, isPassword, style, ...rest }: TextFieldProps) {
  const { colors, radius, spacing, type } = useTheme();
  const [focused, setFocused] = useState(false);
  const [secure, setSecure] = useState(!!isPassword);

  const borderColor = error ? colors.danger : focused ? colors.accent : colors.border;

  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={[type.subhead, { color: colors.inkSecondary, marginBottom: spacing.xxs }]}>{label}</Text>
      <View
        style={[
          styles.row,
          {
            borderColor,
            borderRadius: radius.md,
            backgroundColor: colors.surface,
            borderWidth: focused ? 1.5 : StyleSheet.hairlineWidth,
          },
        ]}
      >
        <TextInput
          {...rest}
          secureTextEntry={secure}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          placeholderTextColor={colors.inkTertiary}
          style={[type.body, styles.input, { color: colors.ink }, style]}
        />
        {isPassword && (
          <Pressable hitSlop={10} onPress={() => setSecure((s) => !s)} style={styles.icon}>
            <Ionicons name={secure ? "eye-outline" : "eye-off-outline"} size={20} color={colors.inkTertiary} />
          </Pressable>
        )}
      </View>
      {error ? (
        <Text style={[type.footnote, { color: colors.danger, marginTop: spacing.xxs }]}>{error}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  input: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  icon: {
    paddingHorizontal: 14,
  },
});
