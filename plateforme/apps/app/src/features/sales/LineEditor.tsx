import { useState } from "react";
import { View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, Plus, Trash2 } from "lucide-react-native";
import { computeTotals, formatEuro, formatVatRate, lineTotalHtCents, UNITS, UNIT_WORDS, VAT_RATES_BPS, type Unit } from "@aussitot/shared";
import { endpoints } from "@/api/endpoints";
import { useDebounced } from "@/lib/useDebounced";
import { useBreakpoint, useTheme } from "@/theme/ThemeProvider";
import { Button, Card, IconButton, LoadingState, PressableScale, SearchField, SelectField, Sheet, Text, TextField } from "@/ui";
import { emptyLine, fromCatalog, toMoneyLine, type DraftLine } from "./lines";

const UNIT_OPTIONS = UNITS.map((u: Unit) => ({ value: u, label: capitalize(UNIT_WORDS[u][0]) }));

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Lignes d'un devis ou d'une facture : saisie libre ou depuis le catalogue,
 * total de chaque ligne et totaux calculés en direct avec les mêmes règles
 * que le serveur (qui recalcule tout à l'enregistrement).
 */
export function LineEditor({
  lines,
  onChange,
  vatExempt,
  defaultVatRateBps,
  errors,
}: {
  lines: DraftLine[];
  onChange: (lines: DraftLine[]) => void;
  vatExempt: boolean;
  defaultVatRateBps: number;
  errors: Record<string, string | undefined>;
}) {
  const { colors } = useTheme();
  const { isCompact } = useBreakpoint();
  const [catalogOpen, setCatalogOpen] = useState(false);
  const update = (key: string, patch: Partial<DraftLine>) => onChange(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  return (
    <View style={{ gap: 12 }}>
      {lines.map((line, index) => {
        const total = lineTotalHtCents(toMoneyLine(line));
        const err = (field: string) => errors[`lines.${index}.${field}`];
        return (
          <Card key={line.key} padding={14}>
            <View style={{ gap: 12 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text variant="overline" tone="tertiary" uppercase style={{ flex: 1 }}>
                  Ligne {index + 1}
                </Text>
                <Text
                  variant="callout"
                  weight="semibold"
                  tabular
                  accessibilityLabel={`Total hors taxes de la ligne : ${formatEuro(total)}`}
                >
                  {formatEuro(total)} HT
                </Text>
                <IconButton
                  icon={Trash2}
                  label={`Supprimer la ligne ${index + 1}`}
                  onPress={() => onChange(lines.filter((l) => l.key !== line.key))}
                  size={36}
                />
              </View>
              <TextField
                label="Désignation"
                value={line.description}
                onChangeText={(description) => update(line.key, { description })}
                placeholder="ex. : Nettoyage des vitres, 2 passages"
                error={err("description")}
                maxLength={500}
                testID={`line-${index}-description`}
              />
              <View style={{ flexDirection: isCompact ? "column" : "row", gap: 12 }}>
                <View style={{ flexDirection: "row", gap: 12, flex: isCompact ? undefined : 1.2 }}>
                  <View style={{ flex: 1 }}>
                    <TextField
                      label="Quantité"
                      value={line.quantity}
                      onChangeText={(quantity) => update(line.key, { quantity })}
                      keyboardType="decimal-pad"
                      error={err("quantity")}
                      testID={`line-${index}-quantity`}
                    />
                  </View>
                  <View style={{ flex: 1.2 }}>
                    <SelectField
                      label="Unité"
                      options={UNIT_OPTIONS}
                      value={line.unit}
                      onChange={(unit) => unit && update(line.key, { unit: unit as Unit })}
                    />
                  </View>
                </View>
                <View style={{ flexDirection: "row", gap: 12, flex: isCompact ? undefined : 1.3 }}>
                  <View style={{ flex: 1.3 }}>
                    <TextField
                      label="Prix unitaire HT (€)"
                      value={line.unitPrice}
                      onChangeText={(unitPrice) => update(line.key, { unitPrice })}
                      keyboardType="decimal-pad"
                      placeholder="0,00"
                      error={err("unitPriceCents")}
                      testID={`line-${index}-price`}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <TextField
                      label="Remise (%)"
                      value={line.discount}
                      onChangeText={(discount) => update(line.key, { discount })}
                      keyboardType="decimal-pad"
                      placeholder="0"
                      error={err("discountBps")}
                    />
                  </View>
                </View>
              </View>
              {!vatExempt ? (
                <View style={{ gap: 6 }}>
                  <Text variant="subhead" weight="medium" tone="secondary">
                    TVA
                  </Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }} accessibilityRole="radiogroup">
                    {VAT_RATES_BPS.map((rate) => {
                      const active = line.vatRateBps === rate;
                      return (
                        <PressableScale
                          key={rate}
                          onPress={() => update(line.key, { vatRateBps: rate })}
                          haptic="selection"
                          accessibilityRole="radio"
                          accessibilityState={{ selected: active }}
                          accessibilityLabel={`TVA ${formatVatRate(rate)}`}
                          style={{
                            paddingHorizontal: 12,
                            minHeight: 36,
                            justifyContent: "center",
                            borderRadius: 999,
                            borderWidth: 1,
                            borderColor: active ? colors.accentFill : colors.border,
                            backgroundColor: active ? colors.accentSoft : colors.surface,
                          }}
                        >
                          <Text variant="subhead" weight={active ? "semibold" : "medium"} tone={active ? "accent" : "secondary"}>
                            {formatVatRate(rate)}
                          </Text>
                        </PressableScale>
                      );
                    })}
                  </View>
                </View>
              ) : null}
            </View>
          </Card>
        );
      })}
      {errors.lines ? (
        <Text variant="subhead" tone="danger">
          {errors.lines}
        </Text>
      ) : null}
      <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
        <Button
          label="Ajouter une ligne"
          icon={Plus}
          variant="secondary"
          onPress={() => onChange([...lines, emptyLine(defaultVatRateBps)])}
          testID="line-add"
        />
        <Button label="Depuis le catalogue" icon={BookOpen} variant="ghost" onPress={() => setCatalogOpen(true)} testID="line-catalog" />
      </View>
      <CatalogSheet
        visible={catalogOpen}
        onClose={() => setCatalogOpen(false)}
        onPick={(item) => {
          // Une ligne vide en fin de liste est remplacée par la prestation choisie.
          const last = lines.at(-1);
          const base = last && !last.description.trim() && !last.unitPrice.trim() ? lines.slice(0, -1) : lines;
          onChange([...base, fromCatalog(item)]);
          setCatalogOpen(false);
        }}
      />
    </View>
  );
}

function CatalogSheet({
  visible,
  onClose,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (item: { id: string; name: string; description: string | null; unit: Unit; unitPriceCents: number; vatRateBps: number }) => void;
}) {
  const { colors, radius } = useTheme();
  const [search, setSearch] = useState("");
  const q = useDebounced(search.trim());
  const catalog = useQuery({ queryKey: ["catalog", q], queryFn: () => endpoints.catalog.list(q || undefined), enabled: visible });
  const items = (catalog.data ?? []).filter((i) => i.isActive);
  return (
    <Sheet visible={visible} onClose={onClose} title="Catalogue de prestations">
      <SearchField value={search} onChangeText={setSearch} placeholder="Rechercher une prestation" />
      {catalog.isPending ? (
        <LoadingState />
      ) : items.length === 0 ? (
        <Text variant="subhead" tone="tertiary">
          {q ? "Aucune prestation trouvée." : "Le catalogue est vide. La direction peut y ajouter vos prestations habituelles."}
        </Text>
      ) : (
        <View style={{ borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: "hidden" }}>
          {items.map((item, index) => (
            <PressableScale
              key={item.id}
              onPress={() => onPick(item)}
              scaleTo={1}
              accessibilityLabel={`${item.name}, ${formatEuro(item.unitPriceCents)} par ${UNIT_WORDS[item.unit][0]}`}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                minHeight: 56,
                paddingHorizontal: 14,
                paddingVertical: 10,
                borderTopWidth: index === 0 ? 0 : 1,
                borderTopColor: colors.border,
                backgroundColor: colors.surface,
              }}
              pressedStyle={{ backgroundColor: colors.surfacePressed }}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="callout" weight="medium">
                  {item.name}
                </Text>
                {item.description ? (
                  <Text variant="footnote" tone="secondary" numberOfLines={2}>
                    {item.description}
                  </Text>
                ) : null}
              </View>
              <Text variant="subhead" weight="semibold" tabular>
                {formatEuro(item.unitPriceCents)} / {UNIT_WORDS[item.unit][0]}
              </Text>
            </PressableScale>
          ))}
        </View>
      )}
    </Sheet>
  );
}

/** Récapitulatif HT / TVA par taux / TTC. */
export function TotalsSummary({ lines, vatExempt }: { lines: DraftLine[]; vatExempt: boolean }) {
  const totals = computeTotals(lines.map(toMoneyLine), { vatExempt });
  return (
    <TotalsBlock
      subtotalCents={totals.subtotalCents}
      vatCents={totals.vatCents}
      totalCents={totals.totalCents}
      breakdown={totals.vatBreakdown}
      vatExempt={vatExempt}
    />
  );
}

export function TotalsBlock({
  subtotalCents,
  vatCents,
  totalCents,
  breakdown,
  vatExempt,
  paidCents,
}: {
  subtotalCents: number;
  vatCents: number;
  totalCents: number;
  breakdown: { rateBps: number; baseCents: number; vatCents: number }[];
  vatExempt: boolean;
  paidCents?: number;
}) {
  const { colors } = useTheme();
  const row = (label: string, value: string, strong?: boolean, tone?: "success" | "danger") => (
    <View key={label} style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
      <Text variant={strong ? "headline" : "subhead"} tone={strong ? "primary" : "secondary"}>
        {label}
      </Text>
      <Text variant={strong ? "headline" : "subhead"} tabular weight={strong ? "bold" : "medium"} tone={tone}>
        {value}
      </Text>
    </View>
  );
  return (
    <View
      style={{ gap: 8 }}
      accessibilityLabel={`Total hors taxes ${formatEuro(subtotalCents)}, TVA ${formatEuro(vatCents)}, total ${formatEuro(totalCents)}`}
    >
      {row("Total HT", formatEuro(subtotalCents))}
      {vatExempt ? (
        <Text variant="footnote" tone="tertiary">
          TVA non applicable, art. 293 B du CGI
        </Text>
      ) : (
        breakdown.filter((b) => b.rateBps > 0).map((b) => row(`TVA ${formatVatRate(b.rateBps)}`, formatEuro(b.vatCents)))
      )}
      <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 2 }} />
      {row(vatExempt ? "Total" : "Total TTC", formatEuro(totalCents), true)}
      {paidCents ? row("Déjà réglé", `− ${formatEuro(paidCents)}`, false, "success") : null}
      {paidCents
        ? row("Reste à payer", formatEuro(Math.max(0, totalCents - paidCents)), true, totalCents - paidCents > 0 ? "danger" : "success")
        : null}
    </View>
  );
}

/** Total TTC compact (barre d'action en bas d'écran sur téléphone). */
export function TotalsCompact({ lines, vatExempt }: { lines: DraftLine[]; vatExempt: boolean }) {
  const totals = computeTotals(lines.map(toMoneyLine), { vatExempt });
  return (
    <View accessibilityLabel={`${vatExempt ? "Total" : "Total TTC"} : ${formatEuro(totals.totalCents)}`}>
      <Text variant="caption" tone="tertiary">
        {vatExempt ? "Total" : "Total TTC"}
      </Text>
      <Text variant="title3" tabular>
        {formatEuro(totals.totalCents)}
      </Text>
    </View>
  );
}
