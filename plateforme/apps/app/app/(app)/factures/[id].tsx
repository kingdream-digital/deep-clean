import { useEffect, useState } from "react";
import { View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, CircleDollarSign, FileDown, FileText, Pencil, Send, Stamp, Trash2, Undo2 } from "lucide-react-native";
import {
  formatDayLong,
  formatDayShort,
  formatEuro,
  parseEurosToCents,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  type InvoiceDto,
  type PaymentMethod,
} from "@aussitot/shared";
import { endpoints } from "@/api/endpoints";
import { ApiError } from "@/api/client";
import { useAuth } from "@/auth/AuthProvider";
import { EmailStatusLine } from "@/features/sales/EmailStatus";
import { TotalsBlock } from "@/features/sales/LineEditor";
import { LinesTable } from "@/features/sales/LinesTable";
import { SendSheet } from "@/features/sales/SendSheet";
import { InvoiceStatusBadge } from "@/features/status";
import { openPdf } from "@/lib/pdf";
import { useToday } from "@/lib/today";
import { useBreakpoint, useTheme } from "@/theme/ThemeProvider";
import {
  Button,
  Card,
  ConfirmSheet,
  DateField,
  ErrorState,
  FilterChips,
  ListGroup,
  ListRow,
  Screen,
  Skeleton,
  Text,
  TextField,
  useToast,
} from "@/ui";

type SheetKind = null | "issue" | "send" | "remind" | "pay" | "cancel" | "delete";

export default function InvoiceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const today = useToday();
  const { colors, radius } = useTheme();
  const { isWide } = useBreakpoint();
  const { can } = useAuth();
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [reason, setReason] = useState("");
  const query = useQuery({ queryKey: ["invoice", id], queryFn: () => endpoints.invoices.get(id), enabled: Boolean(id) });
  const invoice = query.data;

  const refresh = (updated: InvoiceDto) => {
    queryClient.setQueryData(["invoice", updated.id], updated);
    void queryClient.invalidateQueries({ queryKey: ["invoices"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };
  const close = () => setSheet(null);

  const issue = useMutation({
    mutationFn: () => endpoints.invoices.issue(id),
    onSuccess: (updated) => {
      refresh(updated);
      close();
      toast(`Facture ${updated.number} émise`);
    },
  });
  const send = useMutation({
    mutationFn: (input: { to?: string; message?: string | null }) =>
      sheet === "remind" ? endpoints.invoices.remind(id, input) : endpoints.invoices.send(id, input),
    onSuccess: (updated) => {
      refresh(updated);
      const wasRemind = sheet === "remind";
      close();
      toast(wasRemind ? "Relance envoyée" : `Facture envoyée à ${updated.lastEmail?.to ?? "votre client"}`);
    },
  });
  const cancel = useMutation({
    mutationFn: () => endpoints.invoices.cancel(id, reason.trim() || undefined),
    onSuccess: (credit) => {
      void queryClient.invalidateQueries({ queryKey: ["invoice", id] });
      refresh(credit);
      close();
      toast(`Avoir ${credit.number} établi : la facture est annulée`);
      router.replace(`/factures/${credit.id}`);
    },
  });
  const remove = useMutation({
    mutationFn: () => endpoints.invoices.remove(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["invoices"] });
      toast("Brouillon supprimé");
      router.replace("/factures");
    },
  });

  if (query.isPending) {
    return (
      <Screen back="Factures" title=" ">
        <Skeleton height={260} radius={18} />
      </Screen>
    );
  }
  if (!invoice) {
    return (
      <Screen back="Factures" title="Facture">
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      </Screen>
    );
  }

  const isCredit = invoice.kind === "CREDIT_NOTE";
  const draft = invoice.status === "DRAFT";
  const open = !isCredit && (invoice.status === "ISSUED" || invoice.status === "SENT" || invoice.status === "PARTIALLY_PAID");
  const canIssue = can("invoices.issue");
  const remaining = invoice.totalCents - invoice.amountPaidCents;
  const label = isCredit ? "Avoir" : "Facture";

  const primary =
    draft && canIssue ? (
      <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
        <Button label="Émettre et envoyer" icon={Send} size="lg" onPress={() => setSheet("send")} testID="invoice-issue-send" />
        <Button
          label="Émettre sans envoyer"
          icon={Stamp}
          size="lg"
          variant="secondary"
          onPress={() => setSheet("issue")}
          testID="invoice-issue"
        />
      </View>
    ) : open && can("invoices.payments") ? (
      <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
        <Button label="Enregistrer un paiement" icon={CircleDollarSign} size="lg" onPress={() => setSheet("pay")} testID="invoice-pay" />
        {invoice.isOverdue && canIssue ? (
          <Button
            label="Relancer"
            icon={BellRing}
            size="lg"
            variant="secondary"
            onPress={() => setSheet("remind")}
            testID="invoice-remind"
          />
        ) : null}
      </View>
    ) : null;

  return (
    <Screen
      back="Factures"
      title={invoice.title ?? `${label} ${invoice.number ?? "brouillon"}`}
      subtitle={
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <Text variant="callout" tone="secondary">
            {invoice.number ?? "Brouillon"} · {formatEuro(invoice.totalCents)}
          </Text>
          <InvoiceStatusBadge status={invoice.status} overdue={invoice.isOverdue} kind={invoice.kind} />
        </View>
      }
      testID="invoice-detail"
    >
      {invoice.isOverdue ? (
        <View accessibilityRole="alert" style={{ padding: 14, borderRadius: radius.md, backgroundColor: colors.dangerSoft, gap: 2 }}>
          <Text variant="subhead" tone="danger" weight="semibold">
            En retard : {formatEuro(remaining)} attendus depuis le {invoice.dueDate ? formatDayShort(invoice.dueDate) : "—"}.
          </Text>
          <Text variant="footnote" tone="danger">
            Une relance par email rappelle le montant dû et joint la facture.
          </Text>
        </View>
      ) : null}
      {primary}
      <View style={{ flexDirection: isWide ? "row" : "column", gap: 16, alignItems: "flex-start" }}>
        <View style={{ flex: isWide ? 1.5 : undefined, width: isWide ? undefined : "100%", gap: 16 }}>
          <Card padding={18}>
            <Text variant="headline" style={{ marginBottom: 4 }}>
              Prestations
            </Text>
            <LinesTable lines={invoice.lines} vatExempt={invoice.vatExempt} />
            <View style={{ marginTop: 12 }}>
              <TotalsBlock
                subtotalCents={invoice.subtotalCents}
                vatCents={invoice.vatCents}
                totalCents={invoice.totalCents}
                breakdown={invoice.vatBreakdown}
                vatExempt={invoice.vatExempt}
                paidCents={invoice.amountPaidCents || undefined}
              />
            </View>
          </Card>
          {invoice.payments.length ? (
            <ListGroup title="Paiements reçus">
              {invoice.payments.map((p) => (
                <ListRow
                  key={p.id}
                  title={formatEuro(p.amountCents)}
                  subtitle={`${PAYMENT_METHOD_LABELS[p.method]} · ${formatDayLong(p.paidOn, { weekday: false })}${p.reference ? ` · ${p.reference}` : ""}`}
                  icon={CircleDollarSign}
                  iconTone="success"
                />
              ))}
            </ListGroup>
          ) : null}
          {invoice.notes ? (
            <Card padding={18}>
              <Text variant="overline" tone="tertiary" uppercase style={{ marginBottom: 6 }}>
                Message sur la facture
              </Text>
              <Text variant="callout">{invoice.notes}</Text>
            </Card>
          ) : null}
        </View>
        <View style={{ flex: isWide ? 1 : undefined, width: isWide ? undefined : "100%", gap: 16 }}>
          <Card padding={18}>
            <View style={{ gap: 14 }}>
              <View style={{ gap: 4 }}>
                <Text variant="overline" tone="tertiary" uppercase>
                  Client
                </Text>
                <Text variant="headline" tone="accent" onPress={() => router.push(`/clients/${invoice.clientId}`)} accessibilityRole="link">
                  {invoice.clientName}
                </Text>
                {invoice.clientEmail ? (
                  <Text variant="subhead" tone="secondary">
                    {invoice.clientEmail}
                  </Text>
                ) : null}
              </View>
              <View style={{ flexDirection: "row", gap: 24, flexWrap: "wrap" }}>
                {invoice.issueDate ? <Meta label="Émise le" value={formatDayLong(invoice.issueDate, { weekday: false })} /> : null}
                {invoice.dueDate && !isCredit ? <Meta label="Échéance" value={formatDayLong(invoice.dueDate, { weekday: false })} /> : null}
                {invoice.servicePeriod ? <Meta label="Période" value={invoice.servicePeriod} /> : null}
              </View>
              {invoice.creditedInvoiceId ? (
                <Text variant="subhead" tone="secondary">
                  Avoir de la facture{" "}
                  <Text
                    variant="subhead"
                    tone="accent"
                    weight="semibold"
                    onPress={() => router.push(`/factures/${invoice.creditedInvoiceId}`)}
                  >
                    {invoice.creditedInvoiceNumber}
                  </Text>
                </Text>
              ) : null}
              <EmailStatusLine email={invoice.lastEmail} />
            </View>
          </Card>
          <ListGroup title="Actions">
            <ListRow
              title={pdfLoading ? "Préparation du PDF…" : "Télécharger le PDF"}
              icon={FileDown}
              onPress={async () => {
                setPdfLoading(true);
                try {
                  await openPdf(endpoints.invoices.pdfPath(id), `${label}-${invoice.number ?? "brouillon"}.pdf`);
                } catch {
                  toast("Le PDF n'a pas pu être ouvert.", "error");
                } finally {
                  setPdfLoading(false);
                }
              }}
              testID="invoice-pdf"
            />
            {draft && can("invoices.write") ? (
              <ListRow title="Modifier le brouillon" icon={Pencil} onPress={() => router.push(`/factures/nouvelle?id=${id}`)} />
            ) : null}
            {!draft && invoice.status !== "CANCELLED" && canIssue ? (
              <ListRow
                title={invoice.sentAt ? "Renvoyer par email" : "Envoyer par email"}
                icon={Send}
                onPress={() => setSheet("send")}
                testID="invoice-send"
              />
            ) : null}
            {open && !invoice.isOverdue && canIssue ? (
              <ListRow title="Envoyer une relance" icon={BellRing} onPress={() => setSheet("remind")} />
            ) : null}
            {invoice.quoteId ? (
              <ListRow
                title={`Devis ${invoice.quoteNumber ?? ""}`.trim()}
                subtitle="Devis d'origine"
                icon={FileText}
                onPress={() => router.push(`/devis/${invoice.quoteId}`)}
              />
            ) : null}
            {open && invoice.amountPaidCents === 0 && canIssue ? (
              <ListRow
                title="Annuler par un avoir"
                subtitle="Une facture émise ne se supprime pas"
                icon={Undo2}
                iconTone="danger"
                destructive
                onPress={() => setSheet("cancel")}
                testID="invoice-cancel"
              />
            ) : null}
            {draft && can("invoices.write") ? (
              <ListRow title="Supprimer le brouillon" icon={Trash2} iconTone="danger" destructive onPress={() => setSheet("delete")} />
            ) : null}
          </ListGroup>
        </View>
      </View>

      <ConfirmSheet
        visible={sheet === "issue"}
        title={`Émettre la facture ?`}
        message="Elle reçoit son numéro définitif et ne pourra plus être modifiée ni supprimée (une erreur se corrige par un avoir)."
        confirmLabel="Émettre la facture"
        loading={issue.isPending}
        error={issue.error instanceof ApiError ? issue.error.message : issue.error ? "Émission impossible." : null}
        onConfirm={() => issue.mutate()}
        onClose={close}
      />
      <SendSheet
        visible={sheet === "send" || sheet === "remind"}
        title={
          sheet === "remind"
            ? `Relancer ${invoice.clientName}`
            : draft
              ? "Émettre et envoyer la facture"
              : `Envoyer la facture ${invoice.number ?? ""}`
        }
        defaultTo={invoice.clientEmail}
        confirmLabel={sheet === "remind" ? "Envoyer la relance" : draft ? "Émettre et envoyer" : "Envoyer"}
        note={
          draft
            ? "La facture est émise (numéro définitif) puis envoyée avec son PDF."
            : sheet === "remind"
              ? `Le client reçoit un rappel du montant restant dû (${formatEuro(remaining)}) avec la facture.`
              : undefined
        }
        loading={send.isPending}
        error={send.error}
        onSend={(input) => send.mutate(input)}
        onClose={close}
      />
      <PaymentSheet
        visible={sheet === "pay"}
        invoice={invoice}
        today={today}
        onClose={close}
        onRecorded={(updated) => (refresh(updated), close(), toast(updated.status === "PAID" ? "Facture soldée" : "Paiement enregistré"))}
      />
      <ConfirmSheet
        visible={sheet === "cancel"}
        title="Annuler par un avoir ?"
        message={`Un avoir de ${formatEuro(invoice.totalCents)} est établi et numéroté : la facture ${invoice.number} est annulée. Cette opération est définitive.`}
        confirmLabel="Établir l'avoir"
        tone="danger"
        loading={cancel.isPending}
        error={cancel.error instanceof ApiError ? cancel.error.message : cancel.error ? "Annulation impossible." : null}
        onConfirm={() => cancel.mutate()}
        onClose={close}
      >
        <TextField label="Motif (facultatif, figure sur l'avoir)" value={reason} onChangeText={setReason} maxLength={300} />
      </ConfirmSheet>
      <ConfirmSheet
        visible={sheet === "delete"}
        title="Supprimer ce brouillon ?"
        message="Le brouillon n'a pas de numéro : il est supprimé définitivement."
        confirmLabel="Supprimer"
        tone="danger"
        loading={remove.isPending}
        error={remove.error instanceof ApiError ? remove.error.message : null}
        onConfirm={() => remove.mutate()}
        onClose={close}
      />
    </Screen>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ gap: 2 }}>
      <Text variant="overline" tone="tertiary" uppercase>
        {label}
      </Text>
      <Text variant="subhead">{value}</Text>
    </View>
  );
}

const METHOD_OPTIONS = PAYMENT_METHODS.map((m) => ({ value: m, label: PAYMENT_METHOD_LABELS[m] }));

function PaymentSheet({
  visible,
  invoice,
  today,
  onClose,
  onRecorded,
}: {
  visible: boolean;
  invoice: InvoiceDto;
  today: string;
  onClose: () => void;
  onRecorded: (invoice: InvoiceDto) => void;
}) {
  const remaining = invoice.totalCents - invoice.amountPaidCents;
  const [amount, setAmount] = useState("");
  const [paidOn, setPaidOn] = useState<string | null>(today);
  const [method, setMethod] = useState<PaymentMethod>("TRANSFER");
  const [reference, setReference] = useState("");
  useEffect(() => {
    if (visible) {
      setAmount((remaining / 100).toFixed(2).replace(".", ","));
      setPaidOn(today);
      setMethod("TRANSFER");
      setReference("");
    }
  }, [visible, remaining, today]);
  const cents = parseEurosToCents(amount);
  const pay = useMutation({
    mutationFn: () =>
      endpoints.invoices.pay(invoice.id, { amountCents: cents ?? 0, paidOn: paidOn ?? today, method, reference: reference || null }),
    onSuccess: onRecorded,
  });
  const invalid =
    cents === null || cents <= 0
      ? "Indiquez un montant positif."
      : cents > remaining
        ? `Le montant dépasse le reste à payer (${formatEuro(remaining)}).`
        : null;
  return (
    <ConfirmSheet
      visible={visible}
      title="Enregistrer un paiement"
      message={`Reste à payer : ${formatEuro(remaining)}`}
      confirmLabel={cents && !invalid ? `Enregistrer ${formatEuro(cents)}` : "Enregistrer"}
      loading={pay.isPending}
      confirmDisabled={Boolean(invalid)}
      error={
        pay.error instanceof ApiError
          ? (pay.error.field("amountCents") ?? pay.error.message)
          : pay.error
            ? "Enregistrement impossible."
            : null
      }
      onConfirm={() => pay.mutate()}
      onClose={onClose}
    >
      <TextField
        label="Montant reçu (€)"
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        error={amount ? invalid : null}
        testID="payment-amount"
      />
      <DateField label="Date du paiement" value={paidOn} onChange={setPaidOn} today={today} />
      <View style={{ gap: 6 }}>
        <Text variant="subhead" weight="medium" tone="secondary">
          Moyen de paiement
        </Text>
        <FilterChips options={METHOD_OPTIONS} value={method} onChange={setMethod} />
      </View>
      <TextField
        label="Référence (facultatif)"
        value={reference}
        onChangeText={setReference}
        placeholder="ex. : n° de chèque, libellé du virement"
        maxLength={120}
      />
    </ConfirmSheet>
  );
}
