import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Picker } from "@react-native-picker/picker";
import { pickerStyle } from "../../components/pickerStyle";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { useResponsive } from "../../hooks/useResponsive";
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
import type { Quote } from "../../api/quotes.api";
import { QUOTE_ITEM_UNIT_LABELS } from "../../api/quotes.api";
import type { QuoteItemUnit } from "../../api/quotes.api";
import { getSite, getSiteProgress, currentPeriod } from "../../api/sites.api";
import type { SiteBillingMode } from "../../api/sites.api";
import { createInvoice, getInvoice, listInvoices, updateInvoice } from "../../api/invoices.api";
import { billingPeriodLabel, buildInvoiceLinesFromQuote } from "../../utils/invoiceFromQuote";
import type { InvoiceItemInput } from "../../api/invoices.api";
import type { MenuStackParamList } from "../../navigation/MenuStack";
import { frenchDateFormat } from "../../utils/frenchDate";

type Route = RouteProp<MenuStackParamList, "InvoiceForm">;
const dateFmt = frenchDateFormat({ day: "numeric", month: "long", year: "numeric" });
const currencyFmt = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });

const BILLING_MODE_LABELS: Record<SiteBillingMode, string> = {
  FLAT_RATE: "Forfait mensuel (le mois entier, montant du devis)",
  PER_SERVICE: "À la prestation (prestations réalisées × tarif)",
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
  const { isDesktopWeb } = useResponsive();
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
  // Devis accepté servant de base (création uniquement) : les lignes sont
  // recalculées selon le mode de facturation et le mois choisis.
  const [sourceQuote, setSourceQuote] = useState<Quote | null>(null);
  const [firstInvoiceOfQuote, setFirstInvoiceOfQuote] = useState(true);
  const [completedVisits, setCompletedVisits] = useState<number | null>(null);

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
        let site: Awaited<ReturnType<typeof getSite>> | null = null;
        if (route.params?.siteId) {
          site = await getSite(route.params.siteId);
          setSiteLabel(site.name);
          if (!route.params?.clientId && site.clientId) setClientId(site.clientId);
        }
        // Devis de référence : celui demandé, sinon celui dont est issu le chantier.
        const baseQuoteId = route.params?.quoteId ?? site?.quoteId ?? undefined;
        const [quote, previous] = baseQuoteId ? await Promise.all([getQuote(baseQuoteId), listInvoices({ quoteId: baseQuoteId })]) : [null, null];
        // Seul un devis accepté peut servir de base à une facture.
        if (quote && previous && quote.status === "ACCEPTED") {
          setQuoteId(quote.id);
          setClientId(quote.clientId);
          setQuoteLabel(quote.quoteNumber);
          setContactName(quote.contactName ?? "");
          setContactEmail(quote.contactEmail ?? "");
          setContactPhone(quote.contactPhone ?? "");
          setBillingAddress(quote.billingAddress ?? "");
          setSiret(quote.siret ?? "");
          setVatRate(String(quote.vatRate));
          setFirstInvoiceOfQuote(!previous.items.some((i) => i.status !== "CANCELLED"));
          setSourceQuote(quote);
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

  // Prestations réalisées sur le mois (mode « à la prestation », chantier connu).
  useEffect(() => {
    if (isEdit || billingMode !== "PER_SERVICE" || !siteId || !period) {
      setCompletedVisits(null);
      return;
    }
    let cancelled = false;
    getSiteProgress(siteId, period)
      .then((p) => !cancelled && setCompletedVisits(p.completedVisits))
      .catch(() => !cancelled && setCompletedVisits(null));
    return () => {
      cancelled = true;
    };
  }, [isEdit, billingMode, siteId, period]);

  // Lignes recalculées depuis le devis à chaque changement de mode ou de mois.
  useEffect(() => {
    if (isEdit || !sourceQuote) return;
    const lines = buildInvoiceLinesFromQuote(sourceQuote.items, { mode: billingMode, period, includeOneTime: firstInvoiceOfQuote, completedVisits });
    setItems(lines.length > 0 ? lines.map((l, i) => ({ ...l, key: `${l.sourceQuoteItemId ?? "l"}-${i}` })) : [blankItem()]);
  }, [isEdit, sourceQuote, billingMode, period, firstInvoiceOfQuote, completedVisits]);

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
    const badIndex = items.findIndex((it) => !it.description.trim() || it.unitPriceHt < 0 || it.quantity <= 0);
    if (badIndex >= 0) {
      const bad = items[badIndex]!;
      setError(
        !bad.description.trim()
          ? `Ligne ${badIndex + 1} : la description est obligatoire.`
          : bad.quantity <= 0
            ? `Ligne ${badIndex + 1} : la quantité est à 0. Corrigez-la ou supprimez la ligne.`
            : `Ligne ${badIndex + 1} : le prix ne peut pas être négatif.`
      );
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
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={[{ paddingBottom: spacing.xxxl }, isDesktopWeb && { maxWidth: 720, width: "100%", alignSelf: "center" }]}>
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
              <Text style={[type.footnote, { color: colors.inkTertiary, marginTop: spacing.xxs }]}>
                {billingMode === "FLAT_RATE"
                  ? sourceQuote
                    ? "Le client paie le mois entier : chaque prestation régulière du devis est facturée « 1 mois » à son montant mensuel."
                    : "Le client paie le mois entier : indiquez le montant du mois sur une ligne « 1 mois »."
                  : completedVisits != null
                    ? `${completedVisits} prestation${completedVisits > 1 ? "s" : ""} réalisée${completedVisits > 1 ? "s" : ""} sur ce chantier en ${billingPeriodLabel(period)} : quantité reprise ci-dessous, à vérifier.`
                    : "Indiquez en quantité le nombre de prestations réalisées sur le mois (voir « Objectifs & suivi » du chantier)."}
              </Text>
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
          {!!hasDueDate && (
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

        {!!error && <Text style={[type.footnote, { color: colors.danger, marginBottom: spacing.md }]}>{error}</Text>}

        <Button label={isEdit ? "Enregistrer les modifications" : "Créer la facture"} onPress={handleSave} loading={saving} />
      </ScrollView>
    </ScreenContainer>
  );
}
