import React, { useCallback, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { Alert } from "../../utils/alert";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { StateView } from "../../components/StateView";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { PressableScale } from "../../components/PressableScale";
import { InvoiceStatusBadge } from "../../components/InvoiceStatusBadge";
import { useTheme } from "../../theme/ThemeProvider";
import { extractErrorMessage } from "../../api/client";
import { shareFile } from "../../utils/shareFile";
import { QUOTE_ITEM_UNIT_LABELS } from "../../api/quotes.api";
import {
  cancelInvoice,
  downloadInvoicePdf,
  getInvoice,
  markInvoicePaid,
  sendInvoice,
  validateInvoice,
} from "../../api/invoices.api";
import type { Invoice } from "../../api/invoices.api";
import type { MenuStackParamList } from "../../navigation/MenuStack";

type Route = RouteProp<MenuStackParamList, "InvoiceDetail">;
const dateFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" });
const currencyFmt = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });

function InfoRow({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  const { colors, spacing, type } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", marginTop: spacing.sm }}>
      <Ionicons name={icon} size={16} color={colors.inkTertiary} style={{ marginTop: 2 }} />
      <View style={{ marginLeft: spacing.sm, flex: 1 }}>
        <Text style={[type.caption, { color: colors.inkTertiary }]}>{label}</Text>
        <Text style={[type.callout, { color: colors.ink, marginTop: 1 }]}>{value}</Text>
      </View>
    </View>
  );
}

export function InvoiceDetailScreen() {
  const { colors, spacing, type } = useTheme();
  const route = useRoute<Route>();
  const navigation = useNavigation<NativeStackNavigationProp<MenuStackParamList>>();
  const { invoiceId } = route.params;

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [actionLoading, setActionLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      setState("loading");
      setInvoice(await getInvoice(invoiceId));
      setState("ready");
    } catch {
      setState("error");
    }
  }, [invoiceId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  async function runAction(action: () => Promise<unknown>, failureMessage: string) {
    setActionLoading(true);
    try {
      await action();
      await load();
    } catch (err) {
      Alert.alert("Action impossible", extractErrorMessage(err, failureMessage));
    } finally {
      setActionLoading(false);
    }
  }

  async function handleSharePdf() {
    if (!invoice) return;
    setActionLoading(true);
    try {
      const bytes = await downloadInvoicePdf(invoice.id);
      await shareFile(`${invoice.invoiceNumber}.pdf`, bytes, { mimeType: "application/pdf", uti: "com.adobe.pdf" });
    } catch (err) {
      Alert.alert("Impossible d'ouvrir le PDF", extractErrorMessage(err));
    } finally {
      setActionLoading(false);
    }
  }

  function confirmSend() {
    Alert.alert("Envoyer cette facture par email ?", undefined, [
      { text: "Annuler", style: "cancel" },
      { text: "Envoyer", onPress: () => runAction(() => sendInvoice(invoiceId), "Impossible d'envoyer cette facture.") },
    ]);
  }

  function confirmMarkPaid() {
    Alert.alert("Marquer cette facture comme payée ?", undefined, [
      { text: "Annuler", style: "cancel" },
      { text: "Confirmer", onPress: () => runAction(() => markInvoicePaid(invoiceId), "Impossible de marquer cette facture comme payée.") },
    ]);
  }

  function confirmCancel() {
    Alert.alert("Annuler cette facture ?", "Cette action est définitive.", [
      { text: "Retour", style: "cancel" },
      { text: "Annuler la facture", style: "destructive", onPress: () => runAction(() => cancelInvoice(invoiceId), "Impossible d'annuler cette facture.") },
    ]);
  }

  if (state === "loading") {
    return (
      <ScreenContainer>
        <StateView kind="loading" />
      </ScreenContainer>
    );
  }
  if (state === "error" || !invoice) {
    return (
      <ScreenContainer>
        <StateView kind="error" onRetry={load} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer style={{ paddingTop: spacing.md }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: spacing.xxxl }}>
        <Card>
          <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
            <View style={{ flex: 1, marginRight: spacing.sm }}>
              <Text style={[type.footnote, { color: colors.inkTertiary }]}>{invoice.invoiceNumber}</Text>
              <Text style={[type.title2, { color: colors.ink, marginTop: 1 }]}>{invoice.client.companyName}</Text>
            </View>
            <InvoiceStatusBadge status={invoice.status} />
          </View>

          <InfoRow icon="calendar-outline" label="Émise le" value={dateFmt.format(new Date(invoice.issueDate))} />
          {invoice.dueDate && <InfoRow icon="hourglass-outline" label="Échéance" value={dateFmt.format(new Date(invoice.dueDate))} />}
          {invoice.quote && <InfoRow icon="document-text-outline" label="Devis associé" value={invoice.quote.quoteNumber} />}
          {invoice.site && <InfoRow icon="business-outline" label="Chantier" value={invoice.site.name} />}
          {invoice.contactEmail && <InfoRow icon="mail-outline" label="Contact" value={invoice.contactEmail} />}
          {invoice.paidAt && <InfoRow icon="checkmark-circle-outline" label="Payée le" value={dateFmt.format(new Date(invoice.paidAt))} />}
          {invoice.cancelledComment && <InfoRow icon="close-circle-outline" label="Motif d'annulation" value={invoice.cancelledComment} />}
        </Card>

        <Text style={[type.overline, { color: colors.inkTertiary, marginTop: spacing.lg, marginBottom: spacing.sm }]}>LIGNES</Text>
        {invoice.items.map((item) => (
          <Card key={item.id} style={{ marginBottom: spacing.sm }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={[type.callout, { color: colors.ink, flex: 1 }]} numberOfLines={2}>
                {item.description}
              </Text>
              <Text style={[type.callout, { color: colors.ink, fontWeight: "700" }]}>{currencyFmt.format(item.totalHt)}</Text>
            </View>
            <Text style={[type.footnote, { color: colors.inkTertiary, marginTop: 2 }]}>
              {item.quantity} {QUOTE_ITEM_UNIT_LABELS[item.unit]} · {currencyFmt.format(item.unitPriceHt)}
            </Text>
          </Card>
        ))}

        <Card style={{ backgroundColor: colors.accentSoft, borderColor: "transparent", marginBottom: spacing.lg }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
            <Text style={[type.footnote, { color: colors.inkSecondary }]}>Sous-total HT</Text>
            <Text style={[type.footnote, { color: colors.ink }]}>{currencyFmt.format(invoice.subtotalHt)}</Text>
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
            <Text style={[type.footnote, { color: colors.inkSecondary }]}>TVA ({invoice.vatRate}%)</Text>
            <Text style={[type.footnote, { color: colors.ink }]}>{currencyFmt.format(invoice.vatAmount)}</Text>
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={[type.headline, { color: colors.ink }]}>Total TTC</Text>
            <Text style={[type.headline, { color: colors.accent }]}>{currencyFmt.format(invoice.totalTtc)}</Text>
          </View>
        </Card>

        <View style={{ gap: spacing.sm }}>
          <Button label="Voir / partager le PDF" variant="secondary" onPress={handleSharePdf} loading={actionLoading} />

          {invoice.status === "DRAFT" && (
            <>
              <Button label="Modifier la facture" variant="secondary" onPress={() => navigation.navigate("InvoiceForm", { invoiceId: invoice.id })} />
              <Button label="Valider la facture" onPress={() => runAction(() => validateInvoice(invoiceId), "Impossible de valider cette facture.")} loading={actionLoading} />
            </>
          )}
          {invoice.status === "VALIDATED" && <Button label="Envoyer par email" onPress={confirmSend} loading={actionLoading} />}
          {invoice.status === "SENT" && <Button label="Marquer comme payée" onPress={confirmMarkPaid} loading={actionLoading} />}
          {invoice.status === "PAID" && (
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: spacing.sm }}>
              <Ionicons name="checkmark-circle" size={16} color={colors.success} />
              <Text style={[type.footnote, { color: colors.success, marginLeft: 6, fontWeight: "600" }]}>Facture payée</Text>
            </View>
          )}
          {(invoice.status === "DRAFT" || invoice.status === "VALIDATED" || invoice.status === "SENT") && (
            <PressableScale onPress={confirmCancel} style={{ alignItems: "center", paddingVertical: spacing.sm }}>
              <Text style={[type.footnote, { color: colors.danger, fontWeight: "600" }]}>Annuler cette facture</Text>
            </PressableScale>
          )}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
