import { Linking, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { CircleDollarSign, FileClock, FilePlus2, FileText, Mail, MapPin, Pencil, Phone, ReceiptText } from "lucide-react-native";
import { CLIENT_KIND_LABELS, formatEuro } from "@aussitot/shared";
import { endpoints } from "@/api/endpoints";
import { useAuth } from "@/auth/AuthProvider";
import { DocumentRow, ListCard } from "@/features/sales/DocumentRow";
import { MetricTile } from "@/features/MetricTile";
import { InvoiceStatusBadge, QuoteStatusBadge } from "@/features/status";
import { formatDayShort } from "@/lib/format";
import { useBreakpoint } from "@/theme/ThemeProvider";
import { Button, Card, ErrorState, ListGroup, ListRow, Screen, SectionTitle, Skeleton, Text } from "@/ui";

/** Fiche client : coordonnées (appel / email en un toucher), chiffres, devis et factures. */
export default function ClientScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { isWide } = useBreakpoint();
  const { can } = useAuth();
  const query = useQuery({ queryKey: ["client", id], queryFn: () => endpoints.clients.get(id), enabled: Boolean(id) });
  const quotes = useQuery({
    queryKey: ["quotes", { clientId: id }],
    queryFn: () => endpoints.quotes.list({ clientId: id }),
    enabled: Boolean(id) && can("quotes.read"),
  });
  const invoices = useQuery({
    queryKey: ["invoices", { clientId: id }],
    queryFn: () => endpoints.invoices.list({ clientId: id }),
    enabled: Boolean(id) && can("invoices.read"),
  });
  const client = query.data;

  if (query.isPending) {
    return (
      <Screen back="Clients" title=" ">
        <Skeleton height={200} radius={18} />
      </Screen>
    );
  }
  if (!client) {
    return (
      <Screen back="Clients" title="Client">
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      </Screen>
    );
  }

  const contact = [client.contactFirstName, client.contactLastName].filter(Boolean).join(" ");
  const address = [client.addressLine1, client.addressLine2, [client.postalCode, client.city].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join("\n");

  return (
    <Screen
      back="Clients"
      title={client.name}
      subtitle={[CLIENT_KIND_LABELS[client.kind], contact].filter(Boolean).join(" · ")}
      actions={
        can("clients.write") ? (
          <Button
            label="Modifier"
            icon={Pencil}
            size="sm"
            variant="secondary"
            onPress={() => router.push(`/clients/nouveau?id=${id}`)}
            testID="client-edit"
          />
        ) : undefined
      }
      testID="client-detail"
    >
      <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
        {can("quotes.write") ? (
          <Button
            label="Nouveau devis"
            icon={FilePlus2}
            onPress={() => router.push(`/devis/nouveau?clientId=${id}`)}
            testID="client-new-quote"
          />
        ) : null}
        {can("invoices.write") ? (
          <Button
            label="Nouvelle facture"
            icon={ReceiptText}
            variant="secondary"
            onPress={() => router.push(`/factures/nouvelle?clientId=${id}`)}
          />
        ) : null}
      </View>

      {client.stats ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          <MetricTile icon={FileText} label="Devis" value={String(client.stats.quotesCount)} />
          {can("invoices.read") ? (
            <MetricTile icon={CircleDollarSign} tone="success" label="Facturé" value={formatEuro(client.stats.invoicedCents)} />
          ) : null}
          {can("invoices.read") ? (
            <MetricTile
              icon={FileClock}
              tone={client.stats.outstandingCents ? "warning" : "accent"}
              label="Reste dû"
              value={formatEuro(client.stats.outstandingCents)}
            />
          ) : null}
        </View>
      ) : null}

      <View style={{ flexDirection: isWide ? "row" : "column", gap: 16, alignItems: "flex-start" }}>
        <View style={{ flex: isWide ? 1 : undefined, width: isWide ? undefined : "100%", gap: 16 }}>
          <ListGroup title="Coordonnées">
            {client.email ? (
              <ListRow
                title={client.email}
                subtitle="Écrire un email"
                icon={Mail}
                onPress={() => void Linking.openURL(`mailto:${client.email}`)}
              />
            ) : (
              <ListRow title="Pas d'email" subtitle="Nécessaire pour envoyer devis et factures" icon={Mail} iconTone="warning" />
            )}
            {client.phone ? (
              <ListRow
                title={client.phone}
                subtitle="Appeler"
                icon={Phone}
                onPress={() => void Linking.openURL(`tel:${client.phone?.replace(/[^\d+]/g, "")}`)}
              />
            ) : null}
            {address ? <ListRow title={address} icon={MapPin} /> : null}
          </ListGroup>
          {client.siret || client.vatNumber ? (
            <ListGroup title="Identification">
              {client.siret ? <ListRow title={client.siret} subtitle="SIRET" /> : null}
              {client.vatNumber ? <ListRow title={client.vatNumber} subtitle="N° de TVA intracommunautaire" /> : null}
            </ListGroup>
          ) : null}
          {client.notes ? (
            <Card padding={18}>
              <Text variant="overline" tone="tertiary" uppercase style={{ marginBottom: 6 }}>
                Notes
              </Text>
              <Text variant="callout">{client.notes}</Text>
            </Card>
          ) : null}
        </View>
        <View style={{ flex: isWide ? 1.2 : undefined, width: isWide ? undefined : "100%", gap: 16 }}>
          {can("quotes.read") ? (
            <View style={{ gap: 12 }}>
              <SectionTitle title="Devis" />
              {quotes.data?.items.length ? (
                <ListCard>
                  {quotes.data.items.slice(0, 8).map((q, i) => (
                    <DocumentRow
                      key={q.id}
                      first={i === 0}
                      title={q.title ?? `Devis ${q.number}`}
                      subtitle={`${q.number} · ${formatDayShort(q.issueDate)}`}
                      amount={formatEuro(q.totalCents)}
                      badge={<QuoteStatusBadge status={q.status} />}
                      onPress={() => router.push(`/devis/${q.id}`)}
                      accessibilityLabel={`Devis ${q.number}, ${formatEuro(q.totalCents)}`}
                    />
                  ))}
                </ListCard>
              ) : (
                <Text variant="subhead" tone="tertiary">
                  {quotes.isPending ? "Chargement…" : "Aucun devis pour ce client."}
                </Text>
              )}
            </View>
          ) : null}
          {can("invoices.read") ? (
            <View style={{ gap: 12 }}>
              <SectionTitle title="Factures" />
              {invoices.data?.items.length ? (
                <ListCard>
                  {invoices.data.items.slice(0, 8).map((inv, i) => (
                    <DocumentRow
                      key={inv.id}
                      first={i === 0}
                      title={inv.title ?? `${inv.kind === "CREDIT_NOTE" ? "Avoir" : "Facture"} ${inv.number ?? "brouillon"}`}
                      subtitle={`${inv.number ?? "Brouillon"}${inv.dueDate ? ` · échéance ${formatDayShort(inv.dueDate)}` : ""}`}
                      amount={formatEuro(inv.totalCents)}
                      badge={<InvoiceStatusBadge status={inv.status} overdue={inv.isOverdue} kind={inv.kind} />}
                      onPress={() => router.push(`/factures/${inv.id}`)}
                      accessibilityLabel={`Facture ${inv.number ?? "brouillon"}, ${formatEuro(inv.totalCents)}`}
                    />
                  ))}
                </ListCard>
              ) : (
                <Text variant="subhead" tone="tertiary">
                  {invoices.isPending ? "Chargement…" : "Aucune facture pour ce client."}
                </Text>
              )}
            </View>
          ) : null}
        </View>
      </View>
    </Screen>
  );
}
