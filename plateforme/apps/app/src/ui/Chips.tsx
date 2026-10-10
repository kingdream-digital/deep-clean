import { ScrollView } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { PressableScale } from "./PressableScale";
import { Text } from "./Text";

export interface ChipOption<T extends string> {
  value: T;
  label: string;
  count?: number;
}

/** Filtres en pastilles, défilables horizontalement. */
export function FilterChips<T extends string>({ options, value, onChange }: { options: ChipOption<T>[]; value: T; onChange: (value: T) => void }) {
  const { colors, radius } = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }} accessibilityRole="radiogroup">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <PressableScale
            key={option.value}
            onPress={() => onChange(option.value)}
            haptic="selection"
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            accessibilityLabel={option.count !== undefined ? `${option.label}, ${option.count}` : option.label}
            style={{
              paddingHorizontal: 14,
              minHeight: 36,
              justifyContent: "center",
              borderRadius: radius.pill,
              backgroundColor: active ? colors.text : colors.surface,
              borderWidth: 1,
              borderColor: active ? colors.text : colors.border,
            }}
          >
            <Text variant="subhead" weight={active ? "semibold" : "medium"} style={{ color: active ? colors.bg : colors.textSecondary }}>
              {option.label}
              {option.count !== undefined ? ` · ${option.count}` : ""}
            </Text>
          </PressableScale>
        );
      })}
    </ScrollView>
  );
}
