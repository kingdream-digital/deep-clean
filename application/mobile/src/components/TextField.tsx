import React, { useState } from "react";
import { Platform, StyleSheet, Text, TextInput, TextInputProps, View, Pressable } from "react-native";
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

  // Champ sur plusieurs lignes : hauteur de départ calée sur le nombre de
  // lignes prévu (4 par défaut) et texte en haut à gauche — sans cela, un
  // texte de deux lignes et demie était coupé au milieu d'une ligne.
  const lines = rest.numberOfLines ?? 4;
  const multilineStyle = rest.multiline
    ? { minHeight: lines * (type.body.lineHeight ?? 22) + 28, textAlignVertical: "top" as const }
    : null;

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
          rest.multiline && { alignItems: "stretch" },
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
          style={[type.body, styles.input, { color: colors.ink }, webNoOutline, multilineStyle, style]}
        />
        {!!isPassword && (
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

// Sur le web, le navigateur dessinait son propre contour noir autour du champ
// actif, par-dessus le liseré coloré déjà prévu pour l'état « en saisie ».
const webNoOutline = Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null;

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
