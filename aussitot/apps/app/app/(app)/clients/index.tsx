import { useState } from "react";
import { useRouter } from "expo-router";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Building2, UserPlus, UserRound } from "lucide-react-native";
import { endpoints } from "@/api/endpoints";
import { useAuth } from "@/auth/AuthProvider";
import { SalesTabs } from "@/features/sales/SalesTabs";
import { useDebounced } from "@/lib/useDebounced";
import { Button, Card, EmptyState, ErrorState, ListGroup, ListRow, Screen, SearchField, SkeletonList } from "@/ui";

export default function ClientsScreen() {
  const router = useRouter();
  const { can } = useAuth();
  const [search, setSearch] = useState("");
  const q = useDebounced(search.trim());
  const list = useInfiniteQuery({
    queryKey: ["clients", { q }],
    queryFn: ({ pageParam }) => endpoints.clients.list(q || undefined, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <Screen
      title="Ventes"
      actions={
        can("clients.write") ? (
          <Button label="Nouveau client" icon={UserPlus} size="sm" onPress={() => router.push("/clients/nouveau")} testID="client-new" />
        ) : undefined
      }
      refreshing={list.isRefetching && !list.isFetchingNextPage}
      onRefresh={() => void list.refetch()}
      testID="clients"
    >
      <SalesTabs value="clients" />
      <SearchField value={search} onChangeText={setSearch} placeholder="Nom, ville, email…" testID="clients-search" />
      {list.isPending ? (
        <SkeletonList rows={6} />
      ) : list.isError && !list.data ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon={UserRound}
            title={q ? "Aucun client trouvé" : "Pas encore de client"}
            message={
              q
                ? "L'assistant retrouve aussi un client mal orthographié : essayez-le."
                : "Ajoutez votre premier client pour lui faire un devis."
            }
            actionLabel={!q && can("clients.write") ? "Ajouter un client" : undefined}
            onAction={() => router.push("/clients/nouveau")}
          />
        </Card>
      ) : (
        <ListGroup>
          {items.map((client) => (
            <ListRow
              key={client.id}
              title={client.name}
              subtitle={
                [
                  client.kind === "COMPANY" && (client.contactFirstName || client.contactLastName)
                    ? [client.contactFirstName, client.contactLastName].filter(Boolean).join(" ")
                    : null,
                  client.city,
                  client.email,
                ]
                  .filter(Boolean)
                  .join(" · ") || null
              }
              icon={client.kind === "COMPANY" ? Building2 : UserRound}
              iconTone={client.kind === "COMPANY" ? "accent" : "spark"}
              onPress={() => router.push(`/clients/${client.id}`)}
              testID={`client-row-${client.id}`}
            />
          ))}
        </ListGroup>
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
