import { Platform, Switch } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";

/** Interrupteur aux couleurs du thème (sur le web, la pastille active doit être précisée à part). */
export function Toggle({
  value,
  onValueChange,
  disabled,
}: {
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const webColors = Platform.OS === "web" ? ({ activeThumbColor: "#FFFFFF", activeTrackColor: colors.accentFill } as object) : {};
  return (
    <Switch
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      trackColor={{ true: colors.accentFill, false: colors.borderStrong }}
      thumbColor="#FFFFFF"
      importantForAccessibility="no"
      accessibilityElementsHidden
      {...webColors}
    />
  );
}
