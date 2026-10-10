import { Switch, View } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { PressableScale } from "./PressableScale";
import { Text } from "./Text";

/** Ligne avec interrupteur : toute la ligne est cliquable, l'état est annoncé. */
export function SwitchRow({ title, subtitle, value, onValueChange, disabled, testID }: { title: string; subtitle?: string; value: boolean; onValueChange: (value: boolean) => void; disabled?: boolean; testID?: string }) {
  const { colors } = useTheme();
  return (
    <PressableScale
      testID={testID}
      onPress={() => onValueChange(!value)}
      disabled={disabled}
      scaleTo={1}
      haptic="selection"
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={title}
      accessibilityHint={subtitle}
      style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, paddingHorizontal: 16, paddingVertical: 10 }}
      pressedStyle={{ backgroundColor: colors.surfacePressed }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="callout" weight="medium">
          {title}
        </Text>
        {subtitle ? (
          <Text variant="footnote" tone="secondary">
            {subtitle}
          </Text>
        ) : null}
      </View>
      <Switch value={value} onValueChange={onValueChange} disabled={disabled} trackColor={{ true: colors.accentFill, false: colors.borderStrong }} thumbColor="#FFFFFF" importantForAccessibility="no" accessibilityElementsHidden />
    </PressableScale>
  );
}
