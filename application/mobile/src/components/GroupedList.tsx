import React from "react";
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeProvider";
import { Card } from "./Card";

// Liste groupée, à la manière des réglages et des contacts d'iOS : un bloc
// arrondi par groupe, des lignes séparées par un trait fin qui commence après
// l'icône ou l'avatar. Remplace l'empilement d'une carte par ligne, qui
// éparpillait les listes de personnes sur l'écran (une carte, un vide, une
// carte...) sans rien apporter à la lecture.

interface ListGroupProps {
  /** Titre du groupe, en petites capitales au-dessus du bloc. */
  title?: string;
  /** Nombre affiché à droite du titre (ex. effectif d'un rôle). */
  count?: number;
  /** Marges du groupe (par défaut : un espace sous le bloc, pour enchaîner les groupes). */
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

export function ListGroup({ title, count, style, children }: ListGroupProps) {
  const { colors, spacing, type } = useTheme();
  const rows = React.Children.toArray(children).filter(Boolean);

  return (
    <View style={[{ marginBottom: spacing.xl }, style]}>
      {!!title && (
        <View style={{ flexDirection: "row", alignItems: "baseline", marginBottom: spacing.xs, paddingHorizontal: spacing.xxs }}>
          <Text style={[type.overline, { color: colors.inkTertiary, flex: 1 }]}>{title.toUpperCase()}</Text>
          {count !== undefined && <Text style={[type.caption, { color: colors.inkTertiary }]}>{count}</Text>}
        </View>
      )}
      <Card padded={false}>
        {rows.map((row, index) => (
          <View key={index}>
            {index > 0 && <Separator />}
            {row}
          </View>
        ))}
      </Card>
    </View>
  );
}

// Trait de séparation décalé à gauche de la largeur de l'élément de tête
// (avatar de 40 px + marges), comme sur iOS : les lignes se lisent comme une
// seule liste, sans être coupées net d'un bord à l'autre.
function Separator() {
  const { colors } = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: LEADING_INSET }} />;
}

const LEADING_SIZE = 40;
const ROW_PADDING_H = 16;
const LEADING_GAP = 12;
const LEADING_INSET = ROW_PADDING_H + LEADING_SIZE + LEADING_GAP;

interface ListRowProps {
  title: string;
  subtitle?: string;
  /** Avatar ou icône de 40 px à gauche. */
  leading?: React.ReactNode;
  /** Élément à droite, avant le chevron (badge de statut...). */
  trailing?: React.ReactNode;
  /** Ligne atténuée (compte désactivé...) sans la masquer. */
  dimmed?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
}

export function ListRow({ title, subtitle, leading, trailing, dimmed = false, onPress, accessibilityLabel }: ListRowProps) {
  const { colors, spacing, type } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={accessibilityLabel ?? title}
      // Surbrillance de la ligne pendant l'appui, comme une liste iOS — un
      // tassement de toute la ligne, à l'intérieur d'un bloc, se lit mal.
      style={({ pressed }) => ({ backgroundColor: pressed ? colors.surfaceAlt : "transparent" })}
    >
      <View style={styles.row}>
        {!!leading && <View style={{ width: LEADING_SIZE, marginRight: LEADING_GAP, opacity: dimmed ? 0.45 : 1 }}>{leading}</View>}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[type.headline, { color: dimmed ? colors.inkSecondary : colors.ink }]} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={[type.footnote, { color: colors.inkTertiary, marginTop: 2 }]} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {!!trailing && <View style={{ marginLeft: spacing.xs }}>{trailing}</View>}
        {!!onPress && <Ionicons name="chevron-forward" size={18} color={colors.inkTertiary} style={{ marginLeft: spacing.xs }} />}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 11,
    paddingHorizontal: ROW_PADDING_H,
    minHeight: 62,
  },
});
