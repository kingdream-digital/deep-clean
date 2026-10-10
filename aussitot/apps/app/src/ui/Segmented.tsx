import { View } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { PressableScale } from "./PressableScale";
import { Text } from "./Text";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  count?: number;
}

/** Sélecteur à segments : radio accessible, segment actif en relief. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  const { colors, radius } = useTheme();
  return (
    <View
      accessibilityRole="radiogroup"
      style={{ flexDirection: "row", backgroundColor: colors.surfaceMuted, borderRadius: radius.md, padding: 3, gap: 3 }}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <PressableScale
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            accessibilityLabel={option.count !== undefined ? `${option.label}, ${option.count}` : option.label}
            onPress={() => onChange(option.value)}
            haptic="selection"
            scaleTo={0.98}
            style={{
              flex: 1,
              minHeight: 38,
              borderRadius: radius.sm,
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: 8,
              backgroundColor: active ? colors.surfaceRaised : "transparent",
              ...(active
                ? {
                    shadowColor: colors.shadow,
                    shadowOpacity: colors.mode === "dark" ? 0.5 : 0.08,
                    shadowRadius: 6,
                    shadowOffset: { width: 0, height: 2 },
                    elevation: 2,
                  }
                : null),
            }}
          >
            <Text variant="subhead" weight={active ? "semibold" : "medium"} tone={active ? "primary" : "secondary"} numberOfLines={1}>
              {option.label}
              {option.count !== undefined ? <Text variant="subhead" tone="tertiary">{`  ${option.count}`}</Text> : null}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}
