import React, { useEffect, useRef, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { Checkbox } from "../../components/Checkbox";
import { TextField } from "../../components/TextField";
import { PressableScale } from "../../components/PressableScale";
import { SegmentedControl } from "../../components/SegmentedControl";
import { useTheme } from "../../theme/ThemeProvider";
import { Alert } from "../../utils/alert";
import { extractErrorMessage } from "../../api/client";
import { planSiteTargets } from "../../api/sites.api";
import type { SiteTarget } from "../../api/sites.api";

const monthLong = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" });
const monthShort = new Intl.DateTimeFormat("fr-FR", { month: "short" });

/** Décale une période « AAAA-MM » de `months` mois. */
export function shiftPeriod(period: string, months: number): string {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(y!, m! - 1 + months, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function periodLabel(period: string): string {
  const label = monthLong.format(new Date(`${period}-01T12:00:00`));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

interface MonthStripProps {
  period: string;
  onChange: (period: string) => void;
  targets: SiteTarget[];
}

/**
 * Choix du mois affiché (retour explicite du client : « faire défiler le mois
 * qu'on veut ») : flèches mois précédent / suivant, et les douze mois de
 * l'année avec l'objectif de chacun, pour voir l'année d'un coup d'œil.
 */
export function MonthStrip({ period, onChange, targets }: MonthStripProps) {
  const { colors, spacing, radius, type } = useTheme();
  const year = period.slice(0, 4);
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
  const byPeriod = new Map(targets.map((t) => [t.period, t.plannedVisits]));
  const scrollRef = useRef<ScrollView>(null);
  const CHIP = 58;

  useEffect(() => {
    const index = Number(period.slice(5, 7)) - 1;
    scrollRef.current?.scrollTo({ x: Math.max(0, (index - 2) * (CHIP + spacing.xs)), animated: true });
  }, [period, spacing.xs]);

  const arrow = (dir: -1 | 1) => (
    <PressableScale
      onPress={() => onChange(shiftPeriod(period, dir))}
      accessibilityLabel={dir < 0 ? "Mois précédent" : "Mois suivant"}
      style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface }}
    >
      <Ionicons name={dir < 0 ? "chevron-back" : "chevron-forward"} size={20} color={colors.accentText} />
    </PressableScale>
  );

  return (
    <View style={{ marginBottom: spacing.sm }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm }}>
        {arrow(-1)}
        <Text style={[type.headline, { color: colors.ink }]}>{periodLabel(period)}</Text>
        {arrow(1)}
      </View>
      <ScrollView ref={scrollRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.xs }}>
        {months.map((p) => {
          const selected = p === period;
          const planned = byPeriod.get(p);
          return (
            <PressableScale key={p} onPress={() => onChange(p)} accessibilityLabel={`${periodLabel(p)}${planned != null ? `, objectif ${planned}` : ", sans objectif"}`}>
              <View
                style={{
                  width: CHIP,
                  paddingVertical: spacing.xs,
                  borderRadius: radius.md,
                  alignItems: "center",
                  backgroundColor: selected ? colors.accentDeep : colors.surface,
                  borderWidth: 1,
                  borderColor: selected ? colors.accentDeep : colors.border,
                }}
              >
                <Text style={[type.caption, { color: selected ? colors.onAccent : colors.inkSecondary }]}>{monthShort.format(new Date(`${p}-01T12:00:00`)).replace(".", "")}</Text>
                <Text style={[type.headline, { color: selected ? colors.onAccent : planned != null ? colors.ink : colors.inkTertiary }]}>{planned ?? "–"}</Text>
              </View>
            </PressableScale>
          );
        })}
      </ScrollView>
    </View>
  );
}

interface PlanYearCardProps {
  siteId: string;
  fromPeriod: string;
  defaults: { plannedVisits?: number | null; plannedHours?: number | null; plannedAmount?: number | null } | null;
  onDone: () => void;
  onCancel: () => void;
}

const DURATIONS = [
  { label: "3 mois", value: "3" },
  { label: "6 mois", value: "6" },
  { label: "12 mois", value: "12" },
] as const;

/**
 * Objectif répété sur plusieurs mois (retour explicite du client : « prévoir
 * pour toute l'année »). Chaque mois reste ensuite ajustable un par un ; les
 * mois déjà réglés sont conservés sauf demande contraire.
 */
export function PlanYearCard({ siteId, fromPeriod, defaults, onDone, onCancel }: PlanYearCardProps) {
  const { colors, spacing, type } = useTheme();
  const [months, setMonths] = useState<"3" | "6" | "12">("12");
  const [visits, setVisits] = useState(defaults?.plannedVisits != null ? String(defaults.plannedVisits) : "");
  const [hours, setHours] = useState(defaults?.plannedHours != null ? String(defaults.plannedHours) : "");
  const [amount, setAmount] = useState(defaults?.plannedAmount != null ? String(defaults.plannedAmount) : "");
  const [overwrite, setOverwrite] = useState(false);
  const [saving, setSaving] = useState(false);
  const toPeriod = shiftPeriod(fromPeriod, Number(months) - 1);

  async function handleSave() {
    const n = Number(visits);
    if (!visits || Number.isNaN(n) || n < 0) {
      Alert.alert("Objectif invalide", "Indiquez le nombre de prestations prévues par mois (0 ou plus).");
      return;
    }
    setSaving(true);
    try {
      const res = await planSiteTargets(siteId, {
        period: fromPeriod,
        months: Number(months),
        plannedVisits: n,
        plannedHours: hours ? Number(hours.replace(",", ".")) : undefined,
        plannedAmount: amount ? Number(amount.replace(",", ".")) : undefined,
        overwrite,
      });
      const parts = [`${res.created + res.updated} mois prévus`];
      if (res.kept > 0) parts.push(`${res.kept} mois déjà réglés conservés`);
      Alert.alert("Objectifs enregistrés", `${periodLabel(res.from)} → ${periodLabel(res.to)} : ${parts.join(", ")}. Chaque mois reste modifiable.`);
      onDone();
    } catch (err) {
      Alert.alert("Enregistrement impossible", extractErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card style={{ marginBottom: spacing.sm }}>
      <Text style={[type.headline, { color: colors.ink }]}>Prévoir sur plusieurs mois</Text>
      <Text style={[type.footnote, { color: colors.inkSecondary, marginTop: 2, marginBottom: spacing.md }]}>
        À partir de {periodLabel(fromPeriod).toLowerCase()}, jusqu'à {periodLabel(toPeriod).toLowerCase()}. Vous pourrez ensuite ajuster chaque mois.
      </Text>
      <View style={{ marginBottom: spacing.md }}>
        <SegmentedControl value={months} onChange={setMonths} options={DURATIONS.map((d) => ({ ...d }))} />
      </View>
      <TextField label="Prestations par mois" keyboardType="number-pad" value={visits} onChangeText={setVisits} placeholder="8" />
      <TextField label="Heures par mois (optionnel)" keyboardType="decimal-pad" value={hours} onChangeText={setHours} placeholder="20" />
      <TextField label="Montant HT par mois (optionnel)" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} placeholder="900" />
      <View style={{ marginBottom: spacing.md }}>
        <Checkbox label="Remplacer aussi les mois déjà réglés" checked={overwrite} onChange={setOverwrite} />
      </View>
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <Button label="Annuler" variant="secondary" onPress={onCancel} disabled={saving} />
        </View>
        <View style={{ flex: 1 }}>
          <Button label="Enregistrer" onPress={handleSave} loading={saving} />
        </View>
      </View>
    </Card>
  );
}
