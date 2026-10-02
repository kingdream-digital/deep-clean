import React, { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";
import { Card } from "./Card";
import { Button } from "./Button";
import { TextField } from "./TextField";
import { useTheme } from "../theme/ThemeProvider";
import { extractErrorMessage } from "../api/client";
import { createLeaveAdjustment, getLeaveBalance } from "../api/leave.api";
import type { LeaveBalance } from "../api/leave.api";
import { formatDays, formatDaysWithUnit } from "../utils/leaveDays";

// Solde de congés d'un salarié, vu depuis sa fiche par la RH/direction/
// superviseur, avec la correction manuelle. L'API existait déjà
// (POST /leave/:userId/adjustments) mais aucun écran ne permettait de s'en
// servir : à la mise en service, impossible de reporter le solde réel de
// salariés présents depuis des années.
export function LeaveBalanceCard({ userId, canAdjust }: { userId: string; canAdjust: boolean }) {
  const { colors, spacing, type } = useTheme();
  const [balance, setBalance] = useState<LeaveBalance | null>(null);
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [daysText, setDaysText] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setBalance(await getLeaveBalance(userId));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSave() {
    setError(null);
    const days = Number(daysText.replace(",", ".").replace(/\s/g, ""));
    if (!daysText.trim() || Number.isNaN(days) || days === 0) {
      setError("Indiquez un nombre de jours, par exemple 12 ou -2,5.");
      return;
    }
    setSaving(true);
    try {
      await createLeaveAdjustment(userId, days, note.trim() || undefined);
      setEditing(false);
      setDaysText("");
      setNote("");
      await load();
    } catch (err) {
      setError(extractErrorMessage(err, "Correction impossible."));
    } finally {
      setSaving(false);
    }
  }

  if (failed || !balance) return null;

  const stats: Array<{ label: string; value: number; color: string }> = [
    { label: "Acquis", value: balance.acquired, color: colors.ink },
    { label: "Pris", value: balance.taken, color: colors.inkSecondary },
    { label: "En attente", value: balance.pending, color: colors.warning },
    { label: "Restant", value: balance.remaining, color: balance.remaining < 0 ? colors.danger : colors.accentText },
  ];

  return (
    <Card style={{ marginTop: spacing.sm }}>
      <Text style={[type.footnote, { color: colors.inkTertiary, marginBottom: spacing.sm }]}>
        CONGÉS PAYÉS · {balance.year}
      </Text>
      <View style={{ flexDirection: "row" }}>
        {stats.map((s) => (
          <View key={s.label} style={{ flex: 1, alignItems: "center" }}>
            <Text style={[type.title3, { color: s.color }]}>{formatDays(s.value)}</Text>
            <Text style={[type.caption, { color: colors.inkTertiary, marginTop: 2 }]}>{s.label}</Text>
          </View>
        ))}
      </View>

      {canAdjust && !editing && (
        <View style={{ marginTop: spacing.md }}>
          <Button label="Ajuster le solde" variant="secondary" size="md" icon="create-outline" onPress={() => setEditing(true)} />
        </View>
      )}

      {canAdjust && editing && (
        <View style={{ marginTop: spacing.md }}>
          <TextField
            label="Jours à ajouter (ou à retirer avec un « - »)"
            placeholder="Ex. 12 ou -2,5"
            value={daysText}
            onChangeText={setDaysText}
            keyboardType="numbers-and-punctuation"
          />
          <TextField
            label="Motif"
            placeholder="Ex. Report du solde au 1er janvier"
            value={note}
            onChangeText={setNote}
          />
          {!!error && <Text style={[type.footnote, { color: colors.danger, marginBottom: spacing.sm }]}>{error}</Text>}
          {!error && daysText.trim() !== "" && !Number.isNaN(Number(daysText.replace(",", "."))) && (
            <Text style={[type.footnote, { color: colors.inkSecondary, marginBottom: spacing.sm }]}>
              Nouveau solde restant :{" "}
              {formatDaysWithUnit(balance.remaining + Number(daysText.replace(",", ".")))}
            </Text>
          )}
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <View style={{ flex: 1 }}>
              <Button label="Annuler" variant="secondary" size="md" onPress={() => { setEditing(false); setError(null); }} />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="Enregistrer" size="md" loading={saving} onPress={handleSave} />
            </View>
          </View>
        </View>
      )}
    </Card>
  );
}
