import { View } from "react-native";
import { formatEuro, formatQuantity, formatVatRate, unitShort, type DocumentLineDto } from "@aussitot/shared";
import { useTheme } from "@/theme/ThemeProvider";
import { Text } from "@/ui";

/** Lignes d'un document en lecture : désignation, quantité × prix, total HT. */
export function LinesTable({ lines, vatExempt }: { lines: DocumentLineDto[]; vatExempt: boolean }) {
  const { colors } = useTheme();
  return (
    <View>
      {lines.map((line, index) => (
        <View
          key={line.id}
          accessibilityLabel={`${line.description}, ${formatQuantity(line.quantity)} ${unitShort(line.unit, line.quantity)} à ${formatEuro(line.unitPriceCents)}, total ${formatEuro(line.totalHtCents)} hors taxes`}
          style={{ flexDirection: "row", gap: 12, paddingVertical: 12, borderTopWidth: index === 0 ? 0 : 1, borderTopColor: colors.border }}
        >
          <View style={{ flex: 1, gap: 3 }}>
            <Text variant="callout">{line.description}</Text>
            <Text variant="footnote" tone="secondary" tabular>
              {formatQuantity(line.quantity)} {unitShort(line.unit, line.quantity)} × {formatEuro(line.unitPriceCents)}
              {line.discountBps ? ` · remise ${formatVatRate(line.discountBps)}` : ""}
              {!vatExempt ? ` · TVA ${formatVatRate(line.vatRateBps)}` : ""}
            </Text>
          </View>
          <Text variant="callout" weight="semibold" tabular>
            {formatEuro(line.totalHtCents)}
          </Text>
        </View>
      ))}
    </View>
  );
}
