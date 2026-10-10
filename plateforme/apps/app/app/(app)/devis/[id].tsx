import { useState } from "react";
import { View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Check, Copy, FileDown, Pencil, Receipt, Send, ThumbsDown, Trash2 } from "lucide-react-native";
import { formatDayLong, formatEuro, type QuoteDto } from "@aussitot/shared";
import { endpoints } from "@/api/endpoints";
import { ApiError } from "@/api/client";
import { useAuth } from "@/auth/AuthProvider";
import { EmailStatusLine } from "@/features/sales/EmailStatus";
import { TotalsBlock } from "@/features/sales/LineEditor";
import { LinesTable } from "@/features/sales/LinesTable";
import { SendSheet } from "@/features/sales/SendSheet";
import { QuoteStatusBadge } from "@/features/status";
import { openPdf } from "@/lib/pdf";
import { useBreakpoint } from "@/theme/ThemeProvider";
import { Button, Card, ConfirmSheet, ErrorState, ListGroup, ListRow, Screen, Skeleton, Text, useToast } from "@/ui";

export default function QuoteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { isWide } = useBreakpoint();
  const { can } = useAuth();
  const [sendOpen, setSendOpen] = useState(false);
  const [confirm, setConfirm] = useState<null | "delete" | "cancel" | "decline">(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const query = useQuery({ queryKey: ["quote", id], queryFn: () => endpoints.quotes.get(id), enabled: Boolean(id) });
  const quote = query.data;

  const refresh = (updated: QuoteDto) => {
    queryClient.setQueryData(["quote", id], updated);
    void queryClient.invalidateQueries({ queryKey: ["quotes"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };
  const fail = (err: unknown) => toast(err instanceof ApiError ? err.message : "Action impossible pour le moment.", "error");

  const send = useMutation({
    mutationFn: (input: { to?: string; message?: string | null }) => endpoints.quotes.send(id, input),
    onSuccess: (updated) => {
      refresh(updated);
      setSendOpen(false);
      toast(`Devis envoyé à ${updated.lastEmail?.to ?? "votre client"}`);
    },
  });
  const transition = useMutation({
    mutationFn: async (kind: "accept" | "decline" | "cancel") => endpoints.quotes[kind](id),
    onSuccess: (updated, kind) => {
      refresh(updated);
      setConfirm(null);
      toast(kind === "accept" ? "Devis accepté" : kind === "decline" ? "Devis marqué refusé" : "Devis annulé");
    },
    onError: fail,
  });
  const duplicate = useMutation({
    mutationFn: () => endpoints.quotes.duplicate(id),
    onSuccess: (copy) => {
      void queryClient.invalidateQueries({ queryKey: ["quotes"] });
      toast(`Copie créée : ${copy.number}`);
      router.push(`/devis/${copy.id}`);
    },
    onError: fail,
  });
  const remove = useMutation({
    mutationFn: () => endpoints.quotes.remove(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["quotes"] });
      toast("Brouillon supprimé");
      router.replace("/devis");
    },
    onError: fail,
  });
  const invoice = useMutation({
    mutationFn: () => endpoints.invoices.fromQuote(id),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: ["invoices"] });
      void queryClient.invalidateQueries({ queryKey: ["quote", id] });
      toast("Facture brouillon créée depuis le devis");
      router.push(`/factures/${created.id}`);
    },
    onError: fail,
  });

  if (query.isPending) {
    return (
      <Screen back="Devis" title=" ">
        <Skeleton height={260} radius={18} />
      </Screen>
    );
  }
  if (!quote) {
    return (
      <Screen back="Devis" title="Devis">
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      </Screen>
    );
  }

  const write = can("quotes.write");
  const draft = quote.status === "DRAFT";
  const sent = quote.status === "SENT";

  const primary = !write ? null : draft || sent ? (
    <Button
      label={draft ? "Envoyer au client" : "Renvoyer"}
      icon={Send}
      size="lg"
      variant={draft ? "primary" : "secondary"}
      onPress={() => setSendOpen(true)}
      testID="quote-send"
    />
  ) : quote.status === "ACCEPTED" && can("invoices.write") && quote.invoiceIds.length === 0 ? (
    <Button
      label="Créer la facture"
      icon={Receipt}
      size="lg"
      loading={invoice.isPending}
      onPress={() => invoice.mutate()}
      testID="quote-invoice"
    />
  ) : null;

  const details = (
    <Card padding={18}>
      <View style={{ gap: 14 }}>
        <View style={{ gap: 4 }}>
          <Text variant="overline" tone="tertiary" uppercase>
            Client
          </Text>
          <Text variant="headline" tone="accent" onPress={() => router.push(`/clients/${quote.clientId}`)} accessibilityRole="link">
            {quote.clientName}
          </Text>
          {quote.clientEmail ? (
            <Text variant="subhead" tone="secondary">
              {quote.clientEmail}
            </Text>
          ) : null}
          {quote.siteName ? (
            <Text variant="subhead" tone="secondary">
              Lieu : {quote.siteName}
            </Text>
          ) : null}
        </View>
        <View style={{ flexDirection: "row", gap: 24, flexWrap: "wrap" }}>
          <View style={{ gap: 2 }}>
            <Text variant="overline" tone="tertiary" uppercase>
              Date
            </Text>
            <Text variant="subhead">{formatDayLong(quote.issueDate, { weekday: false })}</Text>
          </View>
          {quote.validUntil ? (
            <View style={{ gap: 2 }}>
              <Text variant="overline" tone="tertiary" uppercase>
                Valable jusqu'au
              </Text>
              <Text variant="subhead">{formatDayLong(quote.validUntil, { weekday: false })}</Text>
            </View>
          ) : null}
        </View>
        <EmailStatusLine email={quote.lastEmail} />
      </View>
    </Card>
  );

  return (
    <Screen
      back="Devis"
      title={quote.title ?? `Devis ${quote.number}`}
      subtitle={
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <Text variant="callout" tone="secondary">
            {quote.number} · {formatEuro(quote.totalCents)}
          </Text>
          <QuoteStatusBadge status={quote.status} />
        </View>
      }
      testID="quote-detail"
    >
      {primary ? <View style={{ flexDirection: "row" }}>{primary}</View> : null}
      <View style={{ flexDirection: isWide ? "row" : "column", gap: 16, alignItems: "flex-start" }}>
        <View style={{ flex: isWide ? 1.5 : undefined, width: isWide ? undefined : "100%", gap: 16 }}>
          <Card padding={18}>
            <Text variant="headline" style={{ marginBottom: 4 }}>
              Prestations
            </Text>
            <LinesTable lines={quote.lines} vatExempt={quote.vatExempt} />
            <View style={{ marginTop: 12 }}>
              <TotalsBlock
                subtotalCents={quote.subtotalCents}
                vatCents={quote.vatCents}
                totalCents={quote.totalCents}
                breakdown={quote.vatBreakdown}
                vatExempt={quote.vatExempt}
              />
            </View>
          </Card>
          {quote.notes ? (
            <Card padding={18}>
              <Text variant="overline" tone="tertiary" uppercase style={{ marginBottom: 6 }}>
                Message sur le devis
              </Text>
              <Text variant="callout">{quote.notes}</Text>
            </Card>
          ) : null}
          {quote.internalNotes ? (
            <Card padding={18}>
              <Text variant="overline" tone="tertiary" uppercase style={{ marginBottom: 6 }}>
                Note interne
              </Text>
              <Text variant="callout" tone="secondary">
                {quote.internalNotes}
              </Text>
            </Card>
          ) : null}
        </View>
        <View style={{ flex: isWide ? 1 : undefined, width: isWide ? undefined : "100%", gap: 16 }}>
          {details}
          <ListGroup title="Actions">
            <ListRow
              title={pdfLoading ? "Préparation du PDF…" : "Télécharger le PDF"}
              icon={FileDown}
              onPress={async () => {
                setPdfLoading(true);
                try {
                  await openPdf(endpoints.quotes.pdfPath(id), `Devis-${quote.number}.pdf`);
                } catch {
                  toast("Le PDF n'a pas pu être ouvert.", "error");
                } finally {
                  setPdfLoading(false);
                }
              }}
              testID="quote-pdf"
            />
            {write && draft ? (
              <ListRow title="Modifier" icon={Pencil} onPress={() => router.push(`/devis/nouveau?id=${id}`)} testID="quote-edit" />
            ) : null}
            {write && (draft || sent) ? (
              <ListRow
                title="Marquer comme accepté"
                subtitle="Accord du client reçu (signature, email…)"
                icon={Check}
                iconTone="success"
                onPress={() => transition.mutate("accept")}
                testID="quote-accept"
              />
            ) : null}
            {write && sent ? (
              <ListRow title="Marquer comme refusé" icon={ThumbsDown} iconTone="warning" onPress={() => setConfirm("decline")} />
            ) : null}
            {quote.invoiceIds.map((invoiceId, i) => (
              <ListRow
                key={invoiceId}
                title={quote.invoiceIds.length > 1 ? `Voir la facture ${i + 1}` : "Voir la facture"}
                icon={Receipt}
                onPress={() => router.push(`/factures/${invoiceId}`)}
              />
            ))}
            {write ? (
              <ListRow title="Dupliquer" subtitle="Nouvelle version en brouillon" icon={Copy} onPress={() => duplicate.mutate()} />
            ) : null}
            {write && (draft || sent) ? (
              <ListRow title="Annuler le devis" icon={Ban} iconTone="danger" destructive onPress={() => setConfirm("cancel")} />
            ) : null}
            {write && draft ? (
              <ListRow
                title="Supprimer le brouillon"
                icon={Trash2}
                iconTone="danger"
                destructive
                onPress={() => setConfirm("delete")}
                testID="quote-delete"
              />
            ) : null}
          </ListGroup>
          {quote.createdBy ? (
            <Text variant="footnote" tone="tertiary">
              Créé par {quote.createdBy.name}
            </Text>
          ) : null}
        </View>
      </View>

      <SendSheet
        visible={sendOpen}
        title={draft ? `Envoyer le devis ${quote.number}` : `Renvoyer le devis ${quote.number}`}
        defaultTo={quote.clientEmail}
        confirmLabel="Envoyer"
        loading={send.isPending}
        error={send.error}
        onSend={(input) => send.mutate(input)}
        onClose={() => setSendOpen(false)}
      />
      <ConfirmSheet
        visible={confirm !== null}
        title={
          confirm === "delete"
            ? "Supprimer ce brouillon ?"
            : confirm === "cancel"
              ? "Annuler ce devis ?"
              : "Marquer ce devis comme refusé ?"
        }
        message={
          confirm === "delete"
            ? "Le brouillon sera définitivement supprimé."
            : confirm === "cancel"
              ? "Le devis restera consultable, mais ne pourra plus être accepté ni facturé."
              : "Vous pourrez toujours le dupliquer pour proposer une nouvelle version."
        }
        confirmLabel={confirm === "delete" ? "Supprimer" : confirm === "cancel" ? "Annuler le devis" : "Marquer refusé"}
        tone="danger"
        loading={remove.isPending || transition.isPending}
        onConfirm={() => (confirm === "delete" ? remove.mutate() : transition.mutate(confirm === "cancel" ? "cancel" : "decline"))}
        onClose={() => setConfirm(null)}
      />
    </Screen>
  );
}
