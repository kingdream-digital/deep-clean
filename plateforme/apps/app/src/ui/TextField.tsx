import { forwardRef, useState, type ComponentType } from "react";
import { Platform, StyleSheet, TextInput, View, type TextInputProps } from "react-native";
import { Eye, EyeOff, type LucideProps } from "lucide-react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { fonts } from "@/theme/tokens";
import { Text } from "./Text";
import { PressableScale } from "./PressableScale";

export interface TextFieldProps extends Omit<TextInputProps, "style"> {
  label: string;
  hint?: string;
  error?: string | null;
  icon?: ComponentType<LucideProps>;
  /** Champ mot de passe : bouton afficher / masquer. */
  secureToggle?: boolean;
  testID?: string;
}

/** Champ de saisie : libellé toujours visible (pas seulement un placeholder), erreur lue par le lecteur d'écran. */
export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, hint, error, icon: Icon, secureToggle, multiline, testID, ...rest },
  ref,
) {
  const { colors, radius } = useTheme();
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(true);
  const borderColor = error ? colors.danger : focused ? colors.accent : colors.borderStrong;
  return (
    <View style={{ gap: 6 }}>
      <Text variant="subhead" weight="medium" tone="secondary" nativeID={`${testID ?? label}-label`}>
        {label}
      </Text>
      <View
        style={[
          styles.box,
          {
            borderColor,
            borderRadius: radius.md,
            backgroundColor: colors.surface,
            minHeight: multiline ? 104 : 50,
            alignItems: multiline ? "flex-start" : "center",
            ...(focused
              ? { shadowColor: colors.accent, shadowOpacity: 0.18, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } }
              : null),
          },
        ]}
      >
        {Icon ? <Icon size={18} color={colors.textTertiary} style={{ marginTop: multiline ? 14 : 0 }} /> : null}
        <TextInput
          ref={ref}
          testID={testID}
          accessibilityLabel={label}
          accessibilityHint={error ?? hint}
          accessibilityLabelledBy={`${testID ?? label}-label`}
          placeholderTextColor={colors.textTertiary}
          selectionColor={colors.accent}
          secureTextEntry={secureToggle ? hidden : rest.secureTextEntry}
          multiline={multiline}
          textAlignVertical={multiline ? "top" : "center"}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          {...rest}
          style={[
            styles.input,
            { color: colors.text, fontFamily: fonts.regular, paddingTop: multiline ? 12 : 0, minWidth: 0 },
            Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null,
          ]}
        />
        {secureToggle ? (
          <PressableScale
            accessibilityLabel={hidden ? "Afficher le mot de passe" : "Masquer le mot de passe"}
            onPress={() => setHidden((h) => !h)}
            haptic="selection"
            style={styles.toggle}
          >
            {hidden ? <Eye size={19} color={colors.textSecondary} /> : <EyeOff size={19} color={colors.textSecondary} />}
          </PressableScale>
        ) : null}
      </View>
      {error ? (
        <Text variant="footnote" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="footnote" tone="tertiary">
          {hint}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  box: { flexDirection: "row", gap: 10, paddingHorizontal: 14, borderWidth: 1.5 },
  input: { flex: 1, fontSize: 16, minHeight: 46, paddingVertical: 10 },
  toggle: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
});
