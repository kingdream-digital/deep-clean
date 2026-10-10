import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, type CreateInvoiceInput } from "@aussitot/shared";
import { endpoints } from "@/api/endpoints";
import { ApiError } from "@/api/client";
import { useAuth } from "@/auth/AuthProvider";
import { ClientSelectField } from "@/features/sales/ClientSelectField";
import { LineEditor, TotalsCompact, TotalsSummary } from "@/features/sales/LineEditor";
import { emptyLine, fromDto, toInput, type DraftLine } from "@/features/sales/lines";
import { useToday } from "@/lib/today";
import { useBreakpoint } from "@/theme/ThemeProvider";
import { Button, Card, DateField, EmptyState, Screen, SectionTitle, SelectField, Skeleton, Text, TextField, useToast } from "@/ui";

/** Création / modification d'une facture brouillon (rien n'est définitif avant l'émission). */
export default function InvoiceFormScreen() {
  const params = useLocalSearchParams<{ id?: string; clientId?: string }>();
  const editingId = params.id;
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const today = useToday();
  const { isWide } = useBreakpoint();
  const { can } = useAuth();
  const org = useQuery({ queryKey: ["organization"], queryFn: endpoints.organization.get, staleTime: 5 * 60_000 });
  const existing = useQuery({
    queryKey: ["invoice", editingId],
    queryFn: () => endpoints.invoices.get(editingId as string),
    enabled: Boolean(editingId),
  });
  const preselected = useQuery({
    queryKey: ["client", params.clientId],
    queryFn: () => endpoints.clients.get(params.clientId as string),
    enabled: Boolean(params.clientId) && !editingId,
  });

  const vatExempt = org.data?.vatRegime === "FRANCHISE";
  const defaultVat = vatExempt ? 0 : (org.data?.defaultVatRateBps ?? 2000);
  const [client, setClient] = useState<{ id: string; name: string } | null>(null);
  const [title, setTitle] = useState("");
  const [siteId, setSiteId] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [servicePeriod, setServicePeriod] = useState("");
  const [notes, setNotes] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (initialized) return;
    if (editingId) {
      const inv = existing.data;
      if (!inv) return;
      setClient({ id: inv.clientId, name: inv.clientName });
      setTitle(inv.title ?? "");
      setSiteId(inv.siteId);
      setDueDate(inv.dueDate);
      setServicePeriod(inv.servicePeriod ?? "");
      setNotes(inv.notes ?? "");
      setInternalNotes(inv.internalNotes ?? "");
      setLines(inv.lines.map(fromDto));
      setInitialized(true);
    } else if (org.data) {
      setLines([emptyLine(defaultVat)]);
      setDueDate(addDays(today, org.data.paymentTermsDays));
      setInitialized(true);
    }
  }, [initialized, editingId, existing.data, org.data, defaultVat, today]);

  useEffect(() => {
    if (preselected.data && !client) setClient({ id: preselected.data.id, name: preselected.data.name });
  }, [preselected.data, client]);

  const sites = useQuery({
    queryKey: ["sites", client?.id],
    queryFn: () => endpoints.sites.list({ clientId: client?.id }),
    enabled: Boolean(client) && can("sites.read"),
  });
  const siteOptions = useMemo(
    () => (sites.data ?? []).map((s) => ({ value: s.id, label: s.name, description: s.city ?? undefined })),
    [sites.data],
  );

  const save = useMutation({
    mutationFn: async (input: CreateInvoiceInput) =>
      editingId ? endpoints.invoices.update(editingId, input) : endpoints.invoices.create(input),
    onSuccess: (invoice) => {
      queryClient.setQueryData(["invoice", invoice.id], invoice);
      void queryClient.invalidateQueries({ queryKey: ["invoices"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast(editingId ? "Brouillon enregistré" : "Facture brouillon créée");
      router.replace(`/factures/${invoice.id}`);
    },
    onError: (err) => {
      if (err instanceof ApiError && err.details) setErrors(Object.fromEntries(Object.entries(err.details).map(([k, v]) => [k, v[0]])));
      else setErrors({ form: err instanceof ApiError ? err.message : "Enregistrement impossible. Réessayez." });
    },
  });

  const submit = () => {
    if (!client) {
      setErrors({ clientId: "Choisissez le client." });
      return;
    }
    const filled = lines.filter((l) => l.description.trim() || l.unitPrice.trim());
    if (filled.length === 0) {
      setErrors({ lines: "Ajoutez au moins une ligne." });
      return;
    }
    setErrors({});
    save.mutate({
      clientId: client.id,
      siteId,
      title: title || null,
      dueDate: dueDate ?? undefined,
      servicePeriod: servicePeriod || null,
      notes: notes || null,
      internalNotes: internalNotes || null,
      lines: filled.map(toInput),
    });
  };

  if (!can("invoices.write")) {
    return (
      <Screen back title="Facture">
        <EmptyState title="Accès réservé" message="La facturation est réservée aux personnes qui en ont la charge." />
      </Screen>
    );
  }
  if (!initialized) {
    return (
      <Screen back title={editingId ? "Modifier la facture" : "Nouvelle facture"}>
        <Skeleton height={320} radius={18} />
      </Screen>
    );
  }

  return (
    <Screen
      back
      title={editingId ? "Modifier le brouillon" : "Nouvelle facture"}
      subtitle="Brouillon : modifiable jusqu'à l'émission, qui lui attribue son numéro définitif."
      maxWidth={isWide ? 1120 : 760}
      footer={
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ flex: 1 }}>{!isWide ? <TotalsCompact lines={lines} vatExempt={vatExempt} /> : null}</View>
          <Button
            label={editingId ? "Enregistrer" : "Créer le brouillon"}
            size="lg"
            loading={save.isPending}
            onPress={submit}
            testID="invoice-save"
          />
        </View>
      }
    >
      <View style={{ flexDirection: isWide ? "row" : "column", gap: 24, alignItems: "flex-start" }}>
        <View style={{ flex: isWide ? 1.6 : undefined, width: isWide ? undefined : "100%", gap: 16 }}>
          <ClientSelectField
            value={client}
            onChange={(c) => (setClient(c), setSiteId(null))}
            error={errors.clientId}
            testID="invoice-client"
          />
          <TextField
            label="Objet (facultatif)"
            value={title}
            onChangeText={setTitle}
            placeholder="ex. : Entretien des bureaux"
            maxLength={160}
            error={errors.title}
          />
          {client && siteOptions.length ? (
            <SelectField
              label="Lieu d'intervention (facultatif)"
              options={siteOptions}
              value={siteId}
              onChange={setSiteId}
              allowClear
              clearLabel="Aucun lieu"
              placeholder="Aucun"
            />
          ) : null}
          <View style={{ flexDirection: isWide ? "row" : "column", gap: 16 }}>
            <View style={{ flex: 1 }}>
              <DateField label="Échéance" value={dueDate} onChange={setDueDate} today={today} error={errors.dueDate} />
            </View>
            <View style={{ flex: 1 }}>
              <TextField
                label="Période (facultatif)"
                value={servicePeriod}
                onChangeText={setServicePeriod}
                placeholder="ex. : octobre 2026"
                maxLength={80}
                error={errors.servicePeriod}
              />
            </View>
          </View>
          <SectionTitle title="Prestations" />
          <LineEditor lines={lines} onChange={setLines} vatExempt={vatExempt} defaultVatRateBps={defaultVat} errors={errors} />
          <TextField
            label="Message sur la facture (facultatif)"
            value={notes}
            onChangeText={setNotes}
            multiline
            maxLength={4000}
            error={errors.notes}
          />
          <TextField
            label="Note interne (jamais visible du client)"
            value={internalNotes}
            onChangeText={setInternalNotes}
            multiline
            maxLength={4000}
            error={errors.internalNotes}
          />
          {errors.form ? (
            <Text variant="subhead" tone="danger" accessibilityRole="alert">
              {errors.form}
            </Text>
          ) : null}
        </View>
        <View style={{ flex: isWide ? 1 : undefined, width: isWide ? undefined : "100%" }}>
          <Card padding={18}>
            <TotalsSummary lines={lines} vatExempt={vatExempt} />
          </Card>
        </View>
      </View>
    </Screen>
  );
}
