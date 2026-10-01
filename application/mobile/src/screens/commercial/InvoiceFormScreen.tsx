import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Picker } from "@react-native-picker/picker";
import { pickerStyle } from "../../components/pickerStyle";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { StateView } from "../../components/StateView";
import { TextField } from "../../components/TextField";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Checkbox } from "../../components/Checkbox";
import { PressableScale } from "../../components/PressableScale";
import { DateTimeField } from "../../components/DateTimeField";
import { useTheme } from "../../theme/ThemeProvider";
import { extractErrorMessage } from "../../api/client";
import { listClients } from "../../api/clients.api";
import type { Client } from "../../api/clients.api";
import { getQuote } from "../../api/quotes.api";
import { QUOTE_ITEM_UNIT_LABELS } from "../../api/quotes.api";
import type { QuoteItemUnit } from "../../api/quotes.api";
import { getSite, currentPeriod } from "../../api/sites.api";
import type { SiteBillingMode } from "../../api/sites.api";
import { createInvoice, getInvoice, updateInvoice } from "../../api/invoices.api";
import type { InvoiceItemInput } from "../../api/invoices.api";
import type { MenuStackParamList } from "../../navigation/MenuStack";
import { frenchDateFormat } from "../../utils/frenchDate";

type Route = RouteProp<MenuStackParamList, "InvoiceForm">;
const dateFmt = frenchDateFormat({ day: "numeric", month: "long", year: "numeric" });
const currencyFmt = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });

const BILLING_MODE_LABELS: Record<SiteBillingMode, string> = {
  FLAT_RATE: "Forfait (montant prévu au devis)",
  PER_SERVICE: "À la prestation (nombre réel × tarif)",
};

interface EditableItem extends InvoiceItemInput {
  key: string;
}

function blankItem(): EditableItem {
  return { key: `${Date.now()}-${Math.random()}`, description: "", quantity: 1, unit: "INTERVENTION", unitPriceHt: 0 };
}

function itemTotal(item: EditableItem): number {
  return Math.round(item.quantity * item.unitPriceHt * 100) / 100;
}

// Mois facturé choisi dans une liste (« octobre 2026 ») plutôt que tapé au
// format technique AAAA-MM : les 12 mois passés, le mois en cours et les 2
// suivants couvrent tous les cas réels (rattrapage, facture à l'avance).
function billingPeriodOptions(): { value: string; label: string }[] {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" });
  const options: { value: string; label: string }[] = [];
  for (let offset = 2; offset >= -12; offset--) {
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = fmt.format(d);
    options.push({ value, label: label.charAt(0).toUpperCase() + label.slice(1) });
  }
  return options;
}

export function InvoiceFormScreen() {
  const { colors, spacing, type } = useTheme();
  const route = useRoute<Route>();
  const navigation = useNavigation<NativeStackNavigationProp<MenuStackParamList>>();
  const invoiceId = route.params?.invoiceId;
  const isEdit = !!invoiceId;

  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState<string>(route.params?.clientId ?? "");
  const [quoteId, setQuoteId] = useState<string | undefined>(route.params?.quoteId);
  const [quoteLabel, setQuoteLabel] = useState<string | null>(null);
  const [siteId, setSiteId] = useState<string | undefined>(route.params?.siteId);
  const [siteLabel, setSiteLabel] = useState<string | null>(null);
  const [billingMode, setBillingMode] = useState<SiteBillingMode>("FLAT_RATE");
  const [period, setPeriod] = useState(currentPeriod());
  const [hasDueDate, setHasDueDate] = useState(false);
  const [dueDate, setDueDate] = useState<Date>(new Date());
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [billingAddress, setBillingAddress] = useState("");
  const [siret, setSiret] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [vatRate, setVatRate] = useState("20");
  const [items, setItems] = useState<EditableItem[]>([blankItem()]);

  const load = useCallback(async () => {
    try {
      setLoadState("loading");
      const clientsRes = await listClients();
      setClients(clientsRes.items);

      if (isEdit && invoiceId) {
        const invoice = await getInvoice(invoiceId);
        setClientId(invoice.clientId);
        setQuoteId(invoice.quoteId ?? undefined);
        if (invoice.quote) setQuoteLabel(invoice.quote.quoteNumber);
        setSiteId(invoice.siteId ?? undefined);
        if (invoice.site) setSiteLabel(invoice.site.name);
        setBillingMode(invoice.billingMode);
        setPeriod(invoice.period ?? currentPeriod());
        setHasDueDate(!!invoice.dueDate);
        if (invoice.dueDate) setDueDate(new Date(invoice.dueDate));
        setContactName(invoice.contactName ?? "");
        setContactEmail(invoice.contactEmail ?? "");
        setContactPhone(invoice.contactPhone ?? "");
        setBillingAddress(invoice.billingAddress ?? "");
        setSiret(invoice.siret ?? "");
        setPaymentTerms(invoice.paymentTerms ?? "");
        setInternalNotes(invoice.internalNotes ?? "");
        setVatRate(String(invoice.vatRate));
        setItems(
          invoice.items.length > 0
            ? invoice.items.map((i) => ({ key: i.id, description: i.description, quantity: i.quantity, unit: i.unit, unitPriceHt: i.unitPriceHt, sourceQuoteItemId: i.sourceQuoteItemId ?? undefined }))
            : [blankItem()]
        );
      } else {
        // Pré-remplissage depuis un devis accepté ou un chantier (§32) —
        // l'utilisateur vérifie et peut tout modifier avant d'enregistrer.
        if (route.params?.quoteId) {
          const quote = await getQuote(route.params.quoteId);
          setClientId(quote.clientId);
          setQuoteLabel(quote.quoteNumber);
          setContactName(quote.contactName ?? "");
          setContactEmail(quote.contactEmail ?? "");
          setContactPhone(quote.contactPhone ?? "");
          setBillingAddress(quote.billingAddress ?? "");
          setSiret(quote.siret ?? "");
          setVatRate(String(quote.vatRate));
          setItems(
            quote.items.map((i) => ({
              key: i.id,
              description: i.description,
              quantity: i.quantity,
              unit: i.unit,
              unitPriceHt: i.unitPriceHt,
              sourceQuoteItemId: i.id,
            }))
          );
        }
        if (route.params?.siteId) {
          const site = await getSite(route.params.siteId);
          setSiteLabel(site.name);
          if (!route.params?.clientId && site.clientId) setClientId(site.clientId);
          if (!route.params?.quoteId && site.quoteId) {
            setQuoteId(site.quoteId);
            setQuoteLabel(site.quote?.quoteNumber ?? null);
          }
        }
      }
      setLoadState("ready");
    } catch {
      setLoadState("error");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceId, isEdit]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceId]);

  function handlePickClient(id: string) {
    setClientId(id);
    if (isEdit || quoteId) return; // coordonnées déjà figées par le devis référencé
    const client = clients.find((c) => c.id === id);
    if (!client) return;
    setContactName([client.contactFirstName, client.contactLastName].filter(Boolean).join(" "));
    setContactEmail(client.email ?? "");
    setContactPhone(client.phone ?? "");
    setBillingAddress(client.billingAddress ?? "");
    setSiret(client.siret ?? "");
  }

  function updateItem(key: string, patch: Partial<EditableItem>) {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  }

  function removeItem(key: string) {
    setItems((prev) => (prev.length > 1 ? prev.filter((it) => it.key !== key) : prev));
  }

  const totals = useMemo(() => {
    const subtotalHt = Math.round(items.reduce((sum, it) => sum + itemTotal(it), 0) * 100) / 100;
    const vatAmount = Math.round(subtotalHt * ((Number(vatRate) || 0) / 100) * 100) / 100;
    return { subtotalHt, vatAmount, totalTtc: Math.round((subtotalHt + vatAmount) * 100) / 100 };
  }, [items, vatRate]);

  async function handleSave() {
    setError(null);
    if (!clientId) {
      setError("Sélectionnez un client.");
      return;
    }
    if (items.some((it) => !it.description.trim() || it.unitPriceHt < 0 || it.quantity <= 0)) {
      setError("Vérifiez les lignes (description, quantité et prix requis).");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        dueDate: hasDueDate ? dueDate.toISOString() : undefined,
        contactName: contactName.trim() || undefined,
        contactEmail: contactEmail.trim() || undefined,
        contactPhone: contactPhone.trim() || undefined,
        billingAddress: billingAddress.trim() || undefined,
        siret: siret.trim() || undefined,
        paymentTerms: paymentTerms.trim() || undefined,
        internalNotes: internalNotes.trim() || undefined,
        vatRate: Number(vatRate) || 0,
        items: items.map(({ key, ...rest }) => rest),
      };

      if (isEdit && invoiceId) {
        await updateInvoice(invoiceId, payload);
        navigation.goBack();
      } else {
        const created = await createInvoice({ clientId, quoteId, siteId, billingMode, period: period || undefined, ...payload });
        navigation.replace("InvoiceDetail", { invoiceId: created.id });
      }
    } catch (err) {
      setError(extractErrorMessage(err, "Impossible d'enregistrer la facture."));
    } finally {
      setSaving(false);
    }
  }

  if (loadState === "loading") {
    return (
      <ScreenContainer>
        <StateView kind="loading" />
      </ScreenContainer>
    );
  }
  if (loadState === "error") {
    return (
      <ScreenContainer>
        <StateView kind="error" onRetry={load} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer avoidKeyboard style={{ paddingTop: spacing.lg }}>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: spacing.xxxl }}>
        {(quoteLabel || siteLabel) && (
          <Card style={{ marginBottom: spacing.md, flexDirection: "row", alignItems: "center" }}>
            <Ionicons name="link-outline" size={16} color={colors.accent} />
            <Text style={[type.footnote, { color: colors.inkSecondary, marginLeft: spacing.sm, flex: 1 }]}>
              {[quoteLabel ? `Devis ${quoteLabel}` : null, siteLabel].filter(Boolean).join(" · ")}
            </Text>
          </Card>
        )}

        <View style={{ marginBottom: spacing.md }}>
          <Text style={[type.subhead, { color: colors.inkSecondary, marginBottom: spacing.xxs }]}>Client</Text>
          <Card padded={false}>
            <Picker enabled={!isEdit && !quoteId} selectedValue={clientId} onValueChange={handlePickClient} style={pickerStyle(colors)} itemStyle={{ color: colors.ink }}>
              <Picker.Item label="Sélectionner un client" value="" />
              {clients.map((c) => (
                <Picker.Item key={c.id} label={c.companyName} value={c.id} />
              ))}
            </Picker>
          </Card>
        </View>

        {!isEdit && (
          <>
            <View style={{ marginBottom: spacing.md }}>
              <Text style={[type.subhead, { color: colors.inkSecondary, marginBottom: spacing.xxs }]}>Mode de facturation</Text>
              <Card padded={false}>
                <Picker selectedValue={billingMode} onValueChange={(v) => setBillingMode(v as SiteBillingMode)} style={pickerStyle(colors)} itemStyle={{ color: colors.ink }}>
                  {Object.entries(BILLING_MODE_LABELS).map(([value, label]) => (
                    <Picker.Item key={value} label={label} value={value} />
                  ))}
                </Picker>
              </Card>
              {billingMode === "PER_SERVICE" && (
                <Text style={[type.footnote, { color: colors.inkTertiary, marginTop: spacing.xxs }]}>
                  Consultez le suivi du chantier ("Objectifs & suivi") pour connaître le nombre de prestations réalisées sur la
                  période, puis indiquez-le manuellement en quantité ci-dessous.
                </Text>
              )}
            </View>
            <View style={{ marginBottom: spacing.md }}>
              <Text style={[type.subhead, { color: colors.inkSecondary, marginBottom: spacing.xxs }]}>Mois facturé</Text>
              <Card padded={false}>
                <Picker selectedValue={period} onValueChange={(v) => setPeriod(String(v))} style={pickerStyle(colors)} itemStyle={{ color: colors.ink }}>
                  <Picker.Item label="Aucun mois précis" value="" />
                  {billingPeriodOptions().map(({ value, label }) => (
                    <Picker.Item key={value} label={label} value={value} />
                  ))}
                </Picker>
              </Card>
            </View>
          </>
        )}

        <Text style={[type.overline, { color: colors.inkTertiary, marginTop: spacing.md, marginBottom: spacing.sm }]}>
          COORDONNÉES SUR LA FACTURE
        </Text>
        <TextField label="Contact" placeholder="Julie Dupont" value={contactName} onChangeText={setContactName} />
        <TextField label="Email" placeholder="contact@entreprise.fr" value={contactEmail} onChangeText={setContactEmail} keyboardType="email-address" autoCapitalize="none" />
        <TextField label="Téléphone" placeholder="06 00 00 00 00" value={contactPhone} onChangeText={setContactPhone} keyboardType="phone-pad" />
        <TextField label="Adresse de facturation" placeholder="12 rue Exemple" value={billingAddress} onChangeText={setBillingAddress} />
        <TextField label="SIRET" placeholder="123 456 789 00012" value={siret} onChangeText={setSiret} keyboardType="number-pad" />

        <Text style={[type.overline, { color: colors.inkTertiary, marginTop: spacing.md, marginBottom: spacing.sm }]}>LIGNES</Text>
        {items.map((item, index) => (
          <Card key={item.key} style={{ marginBottom: spacing.sm }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.xs }}>
              <Text style={[type.footnote, { color: colors.inkTertiary, fontWeight: "600" }]}>LIGNE {index + 1}</Text>
              {items.length > 1 && (
                <PressableScale onPress={() => removeItem(item.key)} hitSlop={8}>
                  <Ionicons name="trash-outline" size={18} color={colors.danger} />
                </PressableScale>
              )}
            </View>
            <TextField label="Description" placeholder="Nettoyage bureaux — octobre" value={item.description} onChangeText={(v) => updateItem(item.key, { description: v })} />
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <View style={{ flex: 1 }}>
                <TextField
                  label="Quantité"
                  keyboardType="decimal-pad"
                  value={String(item.quantity)}
                  onChangeText={(v) => updateItem(item.key, { quantity: Number(v.replace(",", ".")) || 0 })}
                />
              </View>
              <View style={{ flex: 1 }}>
                <TextField
                  label="Prix unitaire HT"
                  keyboardType="decimal-pad"
                  value={String(item.unitPriceHt)}
                  onChangeText={(v) => updateItem(item.key, { unitPriceHt: Number(v.replace(",", ".")) || 0 })}
                />
              </View>
            </View>
            <View style={{ marginBottom: spacing.sm }}>
              <Text style={[type.subhead, { color: colors.inkSecondary, marginBottom: spacing.xxs }]}>Unité</Text>
              <Card padded={false}>
                <Picker selectedValue={item.unit} onValueChange={(v) => updateItem(item.key, { unit: v as QuoteItemUnit })} style={pickerStyle(colors)} itemStyle={{ color: colors.ink }}>
                  {Object.entries(QUOTE_ITEM_UNIT_LABELS).map(([value, label]) => (
                    <Picker.Item key={value} label={label} value={value} />
                  ))}
                </Picker>
              </Card>
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm }}>
              <Text style={[type.footnote, { color: colors.inkSecondary }]}>Total HT</Text>
              <Text style={[type.callout, { color: colors.ink, fontWeight: "700" }]}>{currencyFmt.format(itemTotal(item))}</Text>
            </View>
          </Card>
        ))}
        <Button label="Ajouter une ligne" variant="secondary" onPress={() => setItems((prev) => [...prev, blankItem()])} />

        <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg }}>
          <View style={{ flex: 1 }}>
            <TextField label="TVA (%)" keyboardType="decimal-pad" value={vatRate} onChangeText={setVatRate} />
          </View>
        </View>

        <View style={{ marginBottom: spacing.md }}>
          <Checkbox label="Date d'échéance" checked={hasDueDate} onChange={setHasDueDate} />
          {hasDueDate && (
            <View style={{ marginTop: spacing.sm }}>
              <DateTimeField label="Échéance" mode="date" value={dueDate} onChange={setDueDate} minimumDate={new Date()} formatValue={(d) => dateFmt.format(d)} />
            </View>
          )}
        </View>

        <TextField label="Conditions de paiement" placeholder="Paiement à 30 jours" value={paymentTerms} onChangeText={setPaymentTerms} multiline numberOfLines={2} />
        <TextField label="Notes internes (jamais visibles par le client)" placeholder="Notes pour l'équipe" value={internalNotes} onChangeText={setInternalNotes} multiline numberOfLines={3} />

        <Card style={{ marginBottom: spacing.lg, backgroundColor: colors.accentSoft, borderColor: "transparent" }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
            <Text style={[type.footnote, { color: colors.inkSecondary }]}>Sous-total HT</Text>
            <Text style={[type.footnote, { color: colors.ink }]}>{currencyFmt.format(totals.subtotalHt)}</Text>
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
            <Text style={[type.footnote, { color: colors.inkSecondary }]}>TVA</Text>
            <Text style={[type.footnote, { color: colors.ink }]}>{currencyFmt.format(totals.vatAmount)}</Text>
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={[type.headline, { color: colors.ink }]}>Total TTC</Text>
            <Text style={[type.headline, { color: colors.accent }]}>{currencyFmt.format(totals.totalTtc)}</Text>
          </View>
        </Card>

        {error && <Text style={[type.footnote, { color: colors.danger, marginBottom: spacing.md }]}>{error}</Text>}

        <Button label={isEdit ? "Enregistrer les modifications" : "Créer la facture"} onPress={handleSave} loading={saving} />
      </ScrollView>
    </ScreenContainer>
  );
}
