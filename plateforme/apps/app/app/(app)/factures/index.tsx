import { useState } from "react";
import { View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useInfiniteQuery } from "@tanstack/react-query";
import { FilePlus2, Receipt } from "lucide-react-native";
import { formatDayShort, formatEuro } from "@aussitot/shared";
import { endpoints } from "@/api/endpoints";
import { useAuth } from "@/auth/AuthProvider";
import { DocumentRow, ListCard } from "@/features/sales/DocumentRow";
import { SalesTabs } from "@/features/sales/SalesTabs";
import { InvoiceStatusBadge } from "@/features/status";
import { useDebounced } from "@/lib/useDebounced";
import { AccessDenied, Button, Card, EmptyState, ErrorState, FilterChips, Screen, SearchField, SkeletonList } from "@/ui";

type Filter = "all" | "unpaid" | "overdue" | "DRAFT" | "PAID";
const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "Toutes" },
  { value: "unpaid", label: "À encaisser" },
  { value: "overdue", label: "En retard" },
  { value: "DRAFT", label: "Brouillons" },
  { value: "PAID", label: "Payées" },
];

export default function InvoicesScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ filtre?: string }>();
  const { can } = useAuth();
  const [filter, setFilter] = useState<Filter>(params.filtre === "retard" ? "overdue" : params.filtre === "impayees" ? "unpaid" : "all");
  const [search, setSearch] = useState("");
  const q = useDebounced(search.trim());

  const list = useInfiniteQuery({
    queryKey: ["invoices", { filter, q }],
    queryFn: ({ pageParam }) =>
      endpoints.invoices.list({
        status: filter === "DRAFT" || filter === "PAID" ? filter : undefined,
        overdue: filter === "overdue" || undefined,
        unpaid: filter === "unpaid" || undefined,
        q: q || undefined,
        cursor: pageParam,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: can("invoices.read"),
  });
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];

  if (!can("invoices.read")) {
    return (
      <Screen title="Ventes">
        <SalesTabs value="devis" />
        <AccessDenied title="Accès réservé" message="Les factures sont réservées aux personnes chargées de la facturation." />
      </Screen>
    );
  }

  return (
    <Screen
      title="Ventes"
      actions={
        can("invoices.write") ? (
          <Button
            label="Nouvelle facture"
            icon={FilePlus2}
            size="sm"
            onPress={() => router.push("/factures/nouvelle")}
            testID="invoice-new"
          />
        ) : undefined
      }
      refreshing={list.isRefetching && !list.isFetchingNextPage}
      onRefresh={() => void list.refetch()}
      testID="invoices"
    >
      <SalesTabs value="factures" />
      <View style={{ gap: 12 }}>
        <SearchField value={search} onChangeText={setSearch} placeholder="Client, numéro, objet…" testID="invoices-search" />
        <FilterChips options={FILTERS} value={filter} onChange={setFilter} />
      </View>
      {list.isPending ? (
        <SkeletonList rows={5} />
      ) : list.isError && !list.data ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon={Receipt}
            title={
              filter === "overdue" ? "Aucune facture en retard" : q || filter !== "all" ? "Aucune facture trouvée" : "Pas encore de facture"
            }
            message={
              filter === "overdue"
                ? "Tous vos clients sont à jour de leurs paiements."
                : q || filter !== "all"
                  ? "Essayez une autre recherche ou un autre filtre."
                  : "Transformez un devis accepté en facture, ou créez-en une directement."
            }
            actionLabel={!q && filter === "all" ? "Créer une facture" : undefined}
            onAction={() => router.push("/factures/nouvelle")}
          />
        </Card>
      ) : (
        <ListCard>
          {items.map((invoice, index) => {
            const remaining = invoice.totalCents - invoice.amountPaidCents;
            const due = invoice.dueDate
              ? `échéance ${formatDayShort(invoice.dueDate, { year: false })}`
              : invoice.issueDate
                ? formatDayShort(invoice.issueDate, { year: false })
                : "brouillon";
            return (
              <DocumentRow
                key={invoice.id}
                first={index === 0}
                title={invoice.clientName}
                subtitle={`${invoice.kind === "CREDIT_NOTE" ? "Avoir " : ""}${invoice.number ?? "Brouillon"}${invoice.title ? ` · ${invoice.title}` : ""} · ${due}`}
                amount={formatEuro(invoice.status === "PARTIALLY_PAID" ? remaining : invoice.totalCents)}
                badge={<InvoiceStatusBadge status={invoice.status} overdue={invoice.isOverdue} kind={invoice.kind} />}
                onPress={() => router.push(`/factures/${invoice.id}`)}
                accessibilityLabel={`${invoice.kind === "CREDIT_NOTE" ? "Avoir" : "Facture"} ${invoice.number ?? "brouillon"}, ${invoice.clientName}, ${formatEuro(invoice.totalCents)}${invoice.isOverdue ? ", en retard" : ""}`}
                testID={`invoice-row-${invoice.number ?? invoice.id}`}
              />
            );
          })}
        </ListCard>
      )}
      {list.hasNextPage ? (
        <Button
          label="Afficher plus"
          variant="secondary"
          loading={list.isFetchingNextPage}
          onPress={() => void list.fetchNextPage()}
          style={{ alignSelf: "center" }}
        />
      ) : null}
    </Screen>
  );
}
