import { useState } from "react";
import { View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useInfiniteQuery } from "@tanstack/react-query";
import { FilePlus2, FileText } from "lucide-react-native";
import { formatDayShort, formatEuro, type QuoteStatus } from "@aussitot/shared";
import { endpoints } from "@/api/endpoints";
import { useAuth } from "@/auth/AuthProvider";
import { DocumentRow, ListCard } from "@/features/sales/DocumentRow";
import { SalesTabs } from "@/features/sales/SalesTabs";
import { QuoteStatusBadge } from "@/features/status";
import { useDebounced } from "@/lib/useDebounced";
import { Button, Card, EmptyState, ErrorState, FilterChips, Screen, SearchField, SkeletonList } from "@/ui";

type Filter = "all" | QuoteStatus;
const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "Tous" },
  { value: "DRAFT", label: "Brouillons" },
  { value: "SENT", label: "Envoyés" },
  { value: "ACCEPTED", label: "Acceptés" },
  { value: "DECLINED", label: "Refusés" },
  { value: "EXPIRED", label: "Expirés" },
];

export default function QuotesScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ filtre?: string }>();
  const { can } = useAuth();
  const [filter, setFilter] = useState<Filter>(params.filtre === "envoyes" ? "SENT" : params.filtre === "brouillons" ? "DRAFT" : "all");
  const [search, setSearch] = useState("");
  const q = useDebounced(search.trim());

  const list = useInfiniteQuery({
    queryKey: ["quotes", { filter, q }],
    queryFn: ({ pageParam }) =>
      endpoints.quotes.list({ status: filter === "all" ? undefined : filter, q: q || undefined, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <Screen
      title="Ventes"
      actions={
        can("quotes.write") ? (
          <Button label="Nouveau devis" icon={FilePlus2} size="sm" onPress={() => router.push("/devis/nouveau")} testID="quote-new" />
        ) : undefined
      }
      refreshing={list.isRefetching && !list.isFetchingNextPage}
      onRefresh={() => void list.refetch()}
      testID="quotes"
    >
      <SalesTabs value="devis" />
      <View style={{ gap: 12 }}>
        <SearchField value={search} onChangeText={setSearch} placeholder="Client, numéro, objet…" testID="quotes-search" />
        <FilterChips options={FILTERS} value={filter} onChange={setFilter} />
      </View>
      {list.isPending ? (
        <SkeletonList rows={5} />
      ) : list.isError && !list.data ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon={FileText}
            title={q || filter !== "all" ? "Aucun devis trouvé" : "Pas encore de devis"}
            message={
              q || filter !== "all"
                ? "Essayez une autre recherche ou un autre filtre."
                : "Créez votre premier devis, ou dites à l'assistant : « fais un devis pour… »."
            }
            actionLabel={!q && filter === "all" && can("quotes.write") ? "Créer un devis" : undefined}
            onAction={() => router.push("/devis/nouveau")}
          />
        </Card>
      ) : (
        <ListCard>
          {items.map((quote, index) => (
            <DocumentRow
              key={quote.id}
              first={index === 0}
              title={quote.clientName}
              subtitle={`${quote.number}${quote.title ? ` · ${quote.title}` : ""} · ${formatDayShort(quote.issueDate, { year: false })}`}
              amount={formatEuro(quote.totalCents)}
              badge={<QuoteStatusBadge status={quote.status} />}
              onPress={() => router.push(`/devis/${quote.id}`)}
              accessibilityLabel={`Devis ${quote.number}, ${quote.clientName}, ${formatEuro(quote.totalCents)}`}
              testID={`quote-row-${quote.number}`}
            />
          ))}
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
