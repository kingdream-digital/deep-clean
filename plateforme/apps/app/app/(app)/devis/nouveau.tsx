import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, type CreateQuoteInput } from "@aussitot/shared";
import { endpoints } from "@/api/endpoints";
import { ApiError } from "@/api/client";
import { useAuth } from "@/auth/AuthProvider";
import { ClientSelectField } from "@/features/sales/ClientSelectField";
import { LineEditor, TotalsCompact, TotalsSummary } from "@/features/sales/LineEditor";
import { emptyLine, fromDto, toInput, type DraftLine } from "@/features/sales/lines";
import { useToday } from "@/lib/today";
import { useBreakpoint } from "@/theme/ThemeProvider";
import { AccessDenied, Button, Card, DateField, Screen, SectionTitle, SelectField, Skeleton, Text, TextField, useToast } from "@/ui";

/** Création / modification d'un devis brouillon. Les montants sont recalculés par le serveur. */
export default function QuoteFormScreen() {
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
    queryKey: ["quote", editingId],
    queryFn: () => endpoints.quotes.get(editingId as string),
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
  const [validUntil, setValidUntil] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (initialized) return;
    if (editingId) {
      const q = existing.data;
      if (!q) return;
      setClient({ id: q.clientId, name: q.clientName });
      setTitle(q.title ?? "");
      setSiteId(q.siteId);
      setValidUntil(q.validUntil);
      setNotes(q.notes ?? "");
      setInternalNotes(q.internalNotes ?? "");
      setLines(q.lines.map(fromDto));
      setInitialized(true);
    } else if (org.data) {
      setLines([emptyLine(defaultVat)]);
      setValidUntil(addDays(today, org.data.quoteValidityDays));
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
    mutationFn: async (input: CreateQuoteInput) => (editingId ? endpoints.quotes.update(editingId, input) : endpoints.quotes.create(input)),
    onSuccess: (quote) => {
      queryClient.setQueryData(["quote", quote.id], quote);
      void queryClient.invalidateQueries({ queryKey: ["quotes"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast(editingId ? "Devis enregistré" : `Devis ${quote.number} créé`);
      // Modification : retour à la fiche déjà ouverte ; création : la nouvelle fiche remplace le formulaire.
      if (editingId && router.canGoBack()) router.back();
      else router.replace(`/devis/${quote.id}`);
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
      validUntil: validUntil ?? undefined,
      notes: notes || null,
      internalNotes: internalNotes || null,
      lines: filled.map(toInput),
    });
  };

  if (!can("quotes.write")) {
    return (
      <Screen back title="Devis">
        <AccessDenied title="Accès réservé" message="La création de devis est réservée aux personnes qui gèrent les ventes." />
      </Screen>
    );
  }
  if (!initialized) {
    return (
      <Screen back title={editingId ? "Modifier le devis" : "Nouveau devis"}>
        <Skeleton height={320} radius={18} />
      </Screen>
    );
  }

  const summary = (
    <Card padding={18}>
      <TotalsSummary lines={lines} vatExempt={vatExempt} />
    </Card>
  );

  return (
    <Screen
      back
      title={editingId ? `Modifier ${existing.data?.number ?? "le devis"}` : "Nouveau devis"}
      maxWidth={isWide ? 1120 : 760}
      footer={
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          {!isWide ? (
            <View style={{ flex: 1 }}>
              <TotalsCompact lines={lines} vatExempt={vatExempt} />
            </View>
          ) : (
            <View style={{ flex: 1 }} />
          )}
          <Button
            label={editingId ? "Enregistrer" : "Créer le devis"}
            size="lg"
            loading={save.isPending}
            onPress={submit}
            testID="quote-save"
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
            testID="quote-client"
          />
          <TextField
            label="Objet (facultatif)"
            value={title}
            onChangeText={setTitle}
            placeholder="ex. : Entretien des bureaux — octobre"
            maxLength={160}
            error={errors.title}
            testID="quote-title"
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
          <DateField label="Valable jusqu'au" value={validUntil} onChange={setValidUntil} today={today} error={errors.validUntil} />
          <SectionTitle title="Prestations" />
          <LineEditor lines={lines} onChange={setLines} vatExempt={vatExempt} defaultVatRateBps={defaultVat} errors={errors} />
          <TextField
            label="Message sur le devis (facultatif)"
            value={notes}
            onChangeText={setNotes}
            multiline
            maxLength={4000}
            placeholder="Conditions, modalités d'intervention…"
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
        <View style={{ flex: isWide ? 1 : undefined, width: isWide ? undefined : "100%" }}>{summary}</View>
      </View>
    </Screen>
  );
}
