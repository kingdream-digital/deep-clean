import { Platform, TextInput, View } from "react-native";
import { Search, X } from "lucide-react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { fonts } from "@/theme/tokens";
import { IconButton } from "./IconButton";

/** Champ de recherche compact (listes). */
export function SearchField({
  value,
  onChangeText,
  placeholder = "Rechercher",
  testID,
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  testID?: string;
}) {
  const { colors, radius } = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingLeft: 14,
        paddingRight: 4,
        minHeight: 46,
        borderRadius: radius.md,
        backgroundColor: colors.surfaceMuted,
      }}
    >
      <Search size={18} color={colors.textTertiary} />
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        accessibilityLabel={placeholder}
        autoCorrect={false}
        returnKeyType="search"
        style={[
          { flex: 1, fontSize: 16, fontFamily: fonts.regular, color: colors.text, paddingVertical: 10 },
          Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null,
        ]}
      />
      {value ? <IconButton icon={X} label="Effacer la recherche" onPress={() => onChangeText("")} size={36} /> : null}
    </View>
  );
}
