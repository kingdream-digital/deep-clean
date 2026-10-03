import React, { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "./Card";
import { Button } from "./Button";
import { useTheme } from "../theme/ThemeProvider";
import { Alert } from "../utils/alert";
import { extractErrorMessage } from "../api/client";
import { getEinvoiceReadiness, refreshEinvoice, sendEinvoice } from "../api/invoices.api";
import type { EinvoiceReadiness, Invoice } from "../api/invoices.api";
import { frenchDateFormat } from "../utils/frenchDate";

// Facture électronique (réforme 2026, plateforme agréée Super PDP) : état
// réel renvoyé par le serveur. Aucun bouton n'est affiché tant que l'envoi
// n'est pas réellement possible — on dit plutôt ce qui manque.

const dateTimeFmt = frenchDateFormat({ day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

interface Props {
  invoice: Invoice;
  onChanged: () => void;
}

export function EinvoiceCard({ invoice, onChanged }: Props) {
  const { colors, spacing, type } = useTheme();
  const [readiness, setReadiness] = useState<EinvoiceReadiness | null>(null);
  const [busy, setBusy] = useState(false);

  const sent = !!invoice.pdpInvoiceId;
  const sendable = invoice.status !== "DRAFT" && invoice.status !== "CANCELLED";

  const loadReadiness = useCallback(async () => {
    if (sent || !sendable) return;
    try {
      setReadiness(await getEinvoiceReadiness(invoice.id));
    } catch {
      setReadiness(null);
    }
  }, [invoice.id, sent, sendable]);

  useEffect(() => {
    void loadReadiness();
  }, [loadReadiness]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
      onChanged();
    } catch (err) {
      Alert.alert("Facture électronique", extractErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function confirmSend() {
    Alert.alert(
      "Envoyer en facture électronique ?",
      "La facture part au format Factur-X sur la plateforme agréée du client, via Super PDP. Elle ne pourra plus être modifiée.",
      [
        { text: "Annuler", style: "cancel" },
        { text: "Envoyer", onPress: () => run(() => sendEinvoice(invoice.id)) },
      ]
    );
  }

  const problem = !!invoice.pdpError;

  return (
    <Card style={{ marginBottom: spacing.lg }}>
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: spacing.xs }}>
        <Ionicons name="shield-checkmark-outline" size={18} color={colors.accent} />
        <Text style={[type.headline, { color: colors.ink, marginLeft: spacing.sm, flex: 1 }]}>Facture électronique</Text>
      </View>

      {sent ? (
        <>
          <View style={{ flexDirection: "row", alignItems: "center", marginTop: spacing.xs }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: problem ? colors.danger : colors.success }} />
            <Text style={[type.callout, { color: problem ? colors.danger : colors.ink, fontWeight: "600", marginLeft: spacing.sm, flex: 1 }]}>
              {invoice.pdpStatusLabel ?? "Déposée sur la plateforme"}
            </Text>
          </View>
          {problem && <Text style={[type.footnote, { color: colors.danger, marginTop: 4 }]}>{invoice.pdpError}</Text>}
          <Text style={[type.caption, { color: colors.inkTertiary, marginTop: spacing.xs }]}>
            {invoice.pdpSentAt ? `Envoyée le ${dateTimeFmt.format(new Date(invoice.pdpSentAt))}` : ""}
            {invoice.pdpUpdatedAt ? ` · statut vérifié le ${dateTimeFmt.format(new Date(invoice.pdpUpdatedAt))}` : ""}
          </Text>
          <Text style={[type.caption, { color: colors.inkTertiary, marginTop: 2 }]}>Le statut se met à jour tout seul toutes les 30 minutes.</Text>
          <View style={{ marginTop: spacing.md }}>
            <Button label="Actualiser le statut" variant="secondary" icon="refresh-outline" loading={busy} onPress={() => run(() => refreshEinvoice(invoice.id))} />
          </View>
        </>
      ) : !sendable ? (
        <Text style={[type.footnote, { color: colors.inkSecondary }]}>
          {invoice.status === "DRAFT" ? "Possible une fois la facture validée." : "Facture annulée : pas d'envoi électronique."}
        </Text>
      ) : !readiness ? (
        <Text style={[type.footnote, { color: colors.inkTertiary }]}>Vérification…</Text>
      ) : !readiness.configured ? (
        <Text style={[type.footnote, { color: colors.inkSecondary }]}>
          Pas encore activée. Pour l'activer : créer un compte sur Super PDP, puis renseigner ses identifiants sur le serveur (SUPERPDP_CLIENT_ID et SUPERPDP_CLIENT_SECRET). La facture reste envoyable par email en attendant.
        </Text>
      ) : readiness.blockers.length > 0 ? (
        <>
          <Text style={[type.footnote, { color: colors.inkSecondary, marginBottom: 4 }]}>À compléter avant l'envoi :</Text>
          {readiness.blockers.map((b) => (
            <Text key={b} style={[type.footnote, { color: colors.warning, marginTop: 2 }]}>
              • {b.charAt(0).toUpperCase() + b.slice(1)}
            </Text>
          ))}
        </>
      ) : (
        <>
          <Text style={[type.footnote, { color: colors.inkSecondary }]}>
            Obligatoire en France à partir de septembre 2026 pour la réception, 2027 pour l'émission des PME. Envoi au format Factur-X, avec suivi du statut.
          </Text>
          <View style={{ marginTop: spacing.md }}>
            <Button label="Envoyer en facture électronique" icon="paper-plane-outline" loading={busy} onPress={confirmSend} />
          </View>
        </>
      )}
    </Card>
  );
}
