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
import { useAuth } from "../../auth/AuthContext";
import { extractErrorMessage } from "../../api/client";
import { listClients } from "../../api/clients.api";
import type { Client } from "../../api/clients.api";
import { listUsers } from "../../api/users.api";
import type { DirectoryUser } from "../../api/users.api";
import {
  createQuote,
  getQuote,
  previewItemTotals,
  previewQuoteTotals,
  updateQuote,
  QUOTE_ITEM_FREQUENCY_LABELS,
  QUOTE_ITEM_UNIT_LABELS,
} from "../../api/quotes.api";
import type { QuoteItemFrequency, QuoteItemInput, QuoteItemUnit } from "../../api/quotes.api";
import type { MenuStackParamList } from "../../navigation/MenuStack";
import { frenchDateFormat } from "../../utils/frenchDate";

type Route = RouteProp<MenuStackParamList, "QuoteForm">;
const NONE = "__none__";
const dateFmt = frenchDateFormat({ day: "numeric", month: "long", year: "numeric" });
const currencyFmt = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const CAN_REASSIGN_ROLES = ["HR", "DIRECTOR", "ADMIN"];

interface EditableItem extends QuoteItemInput {
  key: string;
}

function blankItem(): EditableItem {
  return { key: `${Date.now()}-${Math.random()}`, description: "", quantity: 1, unit: "INTERVENTION", unitPriceHt: 0, discount: 0, frequency: "ONE_TIME" };
}

function defaultValidUntil(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d;
}

export function QuoteFormScreen() {
  const { colors, spacing, radius, type } = useTheme();
  const { user } = useAuth();
  const route = useRoute<Route>();
  const navigation = useNavigation<NativeStackNavigationProp<MenuStackParamList>>();
  const quoteId = route.params?.quoteId;
  const isEdit = !!quoteId;
  const canReassign = !!user && CAN_REASSIGN_ROLES.includes(user.role);

  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [clients, setClients] = useState<Client[]>([]);
  const [commercials, setCommercials] = useState<DirectoryUser[]>([]);
  const [clientId, setClientId] = useState<string>(route.params?.clientId ?? "");
  const [assignedUserId, setAssignedUserId] = useState<string>(NONE);
  const [hasValidUntil, setHasValidUntil] = useState(true);
  const [validUntil, setValidUntil] = useState<Date>(defaultValidUntil());
  const [subject, setSubject] = useState("");
  const [siteAddress, setSiteAddress] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [billingAddress, setBillingAddress] = useState("");
  const [siret, setSiret] = useState("");
  const [description, setDescription] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [discount, setDiscount] = useState("0");
  const [vatRate, setVatRate] = useState("20");
  const [items, setItems] = useState<EditableItem[]>([blankItem()]);

  const load = useCallback(async () => {
    try {
      setLoadState("loading");
      const [clientsRes, ...commercialLists] = await Promise.all([
        listClients(),
        ...(canReassign
          ? [listUsers({ role: "SUPERVISOR", isActive: true }), listUsers({ role: "HR", isActive: true }), listUsers({ role: "DIRECTOR", isActive: true })]
          : []),
      ]);
      setClients(clientsRes.items);
      if (canReassign) setCommercials(commercialLists.flatMap((r) => r.items));

      if (isEdit && quoteId) {
        const quote = await getQuote(quoteId);
        if (quote.status !== "DRAFT") {
          setError("Ce devis n'est plus modifiable directement — utilisez \"Nouvelle version\" depuis sa fiche.");
        }
        setClientId(quote.clientId);
        setAssignedUserId(quote.assignedUserId ?? NONE);
        setHasValidUntil(!!quote.validUntil);
        if (quote.validUntil) setValidUntil(new Date(quote.validUntil));
        setSubject(quote.subject ?? "");
        setSiteAddress(quote.siteAddress ?? "");
        setContactName(quote.contactName ?? "");
        setContactEmail(quote.contactEmail ?? "");
        setContactPhone(quote.contactPhone ?? "");
        setBillingAddress(quote.billingAddress ?? "");
        setSiret(quote.siret ?? "");
        setDescription(quote.description ?? "");
        setPaymentTerms(quote.paymentTerms ?? "");
        setInternalNotes(quote.internalNotes ?? "");
        setDiscount(String(quote.discount));
        setVatRate(String(quote.vatRate));
        setItems(
          quote.items.length > 0
            ? quote.items.map((i) => ({ key: i.id, description: i.description, quantity: i.quantity, unit: i.unit, unitPriceHt: i.unitPriceHt, discount: i.discount, frequency: i.frequency, occurrencesPerMonth: i.occurrencesPerMonth ?? undefined, estimatedHours: i.estimatedHours ?? undefined, estimatedEmployees: i.estimatedEmployees ?? undefined }))
            : [blankItem()]
        );
      }
      setLoadState("ready");
    } catch {
      setLoadState("error");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteId, isEdit, canReassign]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteId]);

  function handlePickClient(id: string) {
    setClientId(id);
    if (isEdit) return; // coordonnées figées une fois le devis créé
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

  const itemTotals = useMemo(() => items.map((it) => previewItemTotals(it)), [items]);
  const quoteTotals = useMemo(
    () => previewQuoteTotals(itemTotals, Number(discount) || 0, Number(vatRate) || 0),
    [itemTotals, discount, vatRate]
  );

  async function handleSave() {
    setError(null);
    if (!clientId) {
      setError("Sélectionnez un client.");
      return;
    }
    if (items.some((it) => !it.description.trim() || it.unitPriceHt < 0 || it.quantity <= 0)) {
      setError("Vérifiez les lignes de prestations (description, quantité et prix requis).");
      return;
    }
    if (items.some((it) => it.frequency !== "ONE_TIME" && !it.occurrencesPerMonth)) {
      setError("Indiquez le nombre de passages par mois pour chaque prestation récurrente.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        assignedUserId: canReassign ? (assignedUserId === NONE ? null : assignedUserId) : undefined,
        validUntil: hasValidUntil ? validUntil.toISOString() : undefined,
        subject: subject.trim() || undefined,
        siteAddress: siteAddress.trim() || undefined,
        contactName: contactName.trim() || undefined,
        contactEmail: contactEmail.trim() || undefined,
        contactPhone: contactPhone.trim() || undefined,
        billingAddress: billingAddress.trim() || undefined,
        siret: siret.trim() || undefined,
        description: description.trim() || undefined,
        paymentTerms: paymentTerms.trim() || undefined,
        internalNotes: internalNotes.trim() || undefined,
        discount: Number(discount) || 0,
        vatRate: Number(vatRate) || 0,
        items: items.map(({ key, ...rest }) => rest),
      };

      if (isEdit && quoteId) {
        await updateQuote(quoteId, payload);
        navigation.goBack();
      } else {
        const created = await createQuote({ clientId, ...payload });
        navigation.replace("QuoteDetail", { quoteId: created.id });
      }
    } catch (err) {
      setError(extractErrorMessage(err, "Impossible d'enregistrer le devis."));
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
        <View style={{ marginBottom: spacing.md }}>
          <Text style={[type.subhead, { color: colors.inkSecondary, marginBottom: spacing.xxs }]}>Client</Text>
          <Card padded={false}>
            <Picker enabled={!isEdit} selectedValue={clientId} onValueChange={handlePickClient} style={pickerStyle(colors)} itemStyle={{ color: colors.ink }}>
              <Picker.Item label="Sélectionner un client" value="" />
              {clients.map((c) => (
                <Picker.Item key={c.id} label={c.companyName} value={c.id} />
              ))}
            </Picker>
          </Card>
        </View>

        <TextField label="Objet du devis" placeholder="Nettoyage des bureaux" value={subject} onChangeText={setSubject} />
        <TextField label="Adresse du chantier" placeholder="12 rue Exemple" value={siteAddress} onChangeText={setSiteAddress} />

        <Text style={[type.overline, { color: colors.inkTertiary, marginTop: spacing.md, marginBottom: spacing.sm }]}>
          COORDONNÉES SUR LE DEVIS
        </Text>
        <TextField label="Contact" placeholder="Julie Dupont" value={contactName} onChangeText={setContactName} />
        <TextField label="Email" placeholder="contact@entreprise.fr" value={contactEmail} onChangeText={setContactEmail} keyboardType="email-address" autoCapitalize="none" />
        <TextField label="Téléphone" placeholder="06 00 00 00 00" value={contactPhone} onChangeText={setContactPhone} keyboardType="phone-pad" />
        <TextField label="Adresse de facturation" placeholder="12 rue Exemple" value={billingAddress} onChangeText={setBillingAddress} />
        <TextField label="SIRET" placeholder="123 456 789 00012" value={siret} onChangeText={setSiret} keyboardType="number-pad" />

        <Text style={[type.overline, { color: colors.inkTertiary, marginTop: spacing.md, marginBottom: spacing.sm }]}>PRESTATIONS</Text>
        {items.map((item, index) => {
          const totals = itemTotals[index];
          return (
            <Card key={item.key} style={{ marginBottom: spacing.sm }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.xs }}>
                <Text style={[type.footnote, { color: colors.inkTertiary, fontWeight: "600" }]}>PRESTATION {index + 1}</Text>
                {items.length > 1 && (
                  <PressableScale onPress={() => removeItem(item.key)} hitSlop={8}>
                    <Ionicons name="trash-outline" size={18} color={colors.danger} />
                  </PressableScale>
                )}
              </View>
              <TextField label="Description" placeholder="Nettoyage bureaux" value={item.description} onChangeText={(v) => updateItem(item.key, { description: v })} />
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
              <View style={{ marginBottom: spacing.md }}>
                <Text style={[type.subhead, { color: colors.inkSecondary, marginBottom: spacing.xxs }]}>Unité</Text>
                <Card padded={false}>
                  <Picker selectedValue={item.unit} onValueChange={(v) => updateItem(item.key, { unit: v as QuoteItemUnit })} style={pickerStyle(colors)} itemStyle={{ color: colors.ink }}>
                    {Object.entries(QUOTE_ITEM_UNIT_LABELS).map(([value, label]) => (
                      <Picker.Item key={value} label={label} value={value} />
                    ))}
                  </Picker>
                </Card>
              </View>
              <TextField
                label="Remise (%)"
                keyboardType="decimal-pad"
                value={String(item.discount ?? 0)}
                onChangeText={(v) => updateItem(item.key, { discount: Number(v.replace(",", ".")) || 0 })}
              />
              <View style={{ marginBottom: spacing.md }}>
                <Text style={[type.subhead, { color: colors.inkSecondary, marginBottom: spacing.xxs }]}>Fréquence</Text>
                <Card padded={false}>
                  <Picker
                    selectedValue={item.frequency}
                    onValueChange={(v) => updateItem(item.key, { frequency: v as QuoteItemFrequency })}
                    style={pickerStyle(colors)}
                    itemStyle={{ color: colors.ink }}
                  >
                    {Object.entries(QUOTE_ITEM_FREQUENCY_LABELS).map(([value, label]) => (
                      <Picker.Item key={value} label={label} value={value} />
                    ))}
                  </Picker>
                </Card>
              </View>
              {item.frequency !== "ONE_TIME" && (
                <TextField
                  label="Passages par mois"
                  keyboardType="decimal-pad"
                  placeholder="6"
                  value={item.occurrencesPerMonth !== undefined ? String(item.occurrencesPerMonth) : ""}
                  onChangeText={(v) => updateItem(item.key, { occurrencesPerMonth: v ? Number(v.replace(",", ".")) : undefined })}
                />
              )}

              {/* Objectifs commerciaux (cahier des charges §12) — purement
                  prévisionnel/informatif, sert de référence au futur chantier :
                  ne crée jamais rien automatiquement. */}
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <TextField
                    label="Personnel estimé"
                    placeholder="2 agents"
                    keyboardType="number-pad"
                    value={item.estimatedEmployees !== undefined ? String(item.estimatedEmployees) : ""}
                    onChangeText={(v) => updateItem(item.key, { estimatedEmployees: v ? Number(v) : undefined })}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <TextField
                    label="Heures estimées"
                    placeholder="4h / passage"
                    keyboardType="decimal-pad"
                    value={item.estimatedHours !== undefined ? String(item.estimatedHours) : ""}
                    onChangeText={(v) => updateItem(item.key, { estimatedHours: v ? Number(v.replace(",", ".")) : undefined })}
                  />
                </View>
              </View>

              <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm, marginTop: spacing.xxs }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={[type.footnote, { color: colors.inkSecondary }]}>Total HT</Text>
                  <Text style={[type.callout, { color: colors.ink, fontWeight: "700" }]}>{currencyFmt.format(totals.totalHt)}</Text>
                </View>
                {totals.monthlyAmountHt > 0 && (
                  <Text style={[type.footnote, { color: colors.accent, marginTop: 2 }]}>
                    Soit {currencyFmt.format(totals.monthlyAmountHt)} HT / mois (prévisionnel)
                  </Text>
                )}
              </View>
            </Card>
          );
        })}

        <Button label="Ajouter une prestation" variant="secondary" onPress={() => setItems((prev) => [...prev, blankItem()])} />

        <Text style={[type.overline, { color: colors.inkTertiary, marginTop: spacing.lg, marginBottom: spacing.sm }]}>CONDITIONS</Text>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <TextField label="Remise globale (€ HT)" keyboardType="decimal-pad" value={discount} onChangeText={setDiscount} />
          </View>
          <View style={{ flex: 1 }}>
            <TextField label="TVA (%)" keyboardType="decimal-pad" value={vatRate} onChangeText={setVatRate} />
          </View>
        </View>

        <View style={{ marginBottom: spacing.md }}>
          <Checkbox label="Date de validité" checked={hasValidUntil} onChange={setHasValidUntil} />
          {!!hasValidUntil && (
            <View style={{ marginTop: spacing.sm }}>
              <DateTimeField label="Valable jusqu'au" mode="date" value={validUntil} onChange={setValidUntil} minimumDate={new Date()} formatValue={(d) => dateFmt.format(d)} />
            </View>
          )}
        </View>

        <TextField label="Description / notes visibles par le client" placeholder="Détail de la prestation" value={description} onChangeText={setDescription} multiline numberOfLines={3} />
        <TextField label="Conditions de paiement" placeholder="Paiement à 30 jours" value={paymentTerms} onChangeText={setPaymentTerms} multiline numberOfLines={2} />
        <TextField label="Notes internes (jamais visibles par le client)" placeholder="Notes pour l'équipe" value={internalNotes} onChangeText={setInternalNotes} multiline numberOfLines={3} />

        {!!canReassign && (
          <View style={{ marginBottom: spacing.md }}>
            <Text style={[type.subhead, { color: colors.inkSecondary, marginBottom: spacing.xxs }]}>Commercial responsable</Text>
            <Card padded={false}>
              <Picker selectedValue={assignedUserId} onValueChange={setAssignedUserId} style={pickerStyle(colors)} itemStyle={{ color: colors.ink }}>
                <Picker.Item label="Moi-même" value={NONE} />
                {commercials.map((c) => (
                  <Picker.Item key={c.id} label={`${c.firstName} ${c.lastName}`} value={c.id} />
                ))}
              </Picker>
            </Card>
          </View>
        )}

        <Card style={{ marginBottom: spacing.lg, backgroundColor: colors.accentSoft, borderColor: "transparent" }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
            <Text style={[type.footnote, { color: colors.inkSecondary }]}>Sous-total HT</Text>
            <Text style={[type.footnote, { color: colors.ink }]}>{currencyFmt.format(quoteTotals.subtotalHt)}</Text>
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
            <Text style={[type.footnote, { color: colors.inkSecondary }]}>TVA</Text>
            <Text style={[type.footnote, { color: colors.ink }]}>{currencyFmt.format(quoteTotals.vatAmount)}</Text>
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={[type.headline, { color: colors.ink }]}>Total TTC</Text>
            <Text style={[type.headline, { color: colors.accent }]}>{currencyFmt.format(quoteTotals.totalTtc)}</Text>
          </View>
          {quoteTotals.monthlyAmountHt > 0 && (
            <Text style={[type.footnote, { color: colors.accentText, marginTop: 6 }]}>
              Prévisionnel : {currencyFmt.format(quoteTotals.monthlyAmountHt)} HT / mois
            </Text>
          )}
        </Card>

        {!!error && <Text style={[type.footnote, { color: colors.danger, marginBottom: spacing.md }]}>{error}</Text>}

        <Button label={isEdit ? "Enregistrer les modifications" : "Créer le devis"} onPress={handleSave} loading={saving} />
      </ScrollView>
    </ScreenContainer>
  );
}
