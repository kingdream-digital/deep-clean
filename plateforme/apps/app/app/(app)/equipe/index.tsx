import { useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { UserPlus, Users } from "lucide-react-native";
import { ROLE_LABELS } from "@aussitot/shared";
import { endpoints } from "@/api/endpoints";
import { useAuth } from "@/auth/AuthProvider";
import { timeAgo } from "@/lib/format";
import { useOrgTimezone } from "@/lib/today";
import { useDebounced } from "@/lib/useDebounced";
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  ListGroup,
  ListRow,
  Screen,
  SearchField,
  SkeletonList,
  SwitchRow,
} from "@/ui";

/** Équipe : comptes de l'entreprise. Seule la RH (et l'administrateur) crée des comptes. */
export default function TeamScreen() {
  const router = useRouter();
  const timezone = useOrgTimezone();
  const { can } = useAuth();
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const q = useDebounced(search.trim());
  const users = useQuery({
    queryKey: ["users", { q, showInactive }],
    queryFn: () => endpoints.users.list(q || undefined, showInactive),
    enabled: can("users.read"),
  });

  if (!can("users.read")) {
    return (
      <Screen title="Équipe">
        <EmptyState title="Accès réservé" message="La liste des comptes est réservée à l'encadrement et à la RH." />
      </Screen>
    );
  }

  return (
    <Screen
      title="Équipe"
      subtitle={users.data ? `${users.data.length} compte${users.data.length > 1 ? "s" : ""}${showInactive ? "" : " actifs"}` : undefined}
      actions={
        can("users.create") ? (
          <Button label="Nouveau compte" icon={UserPlus} size="sm" onPress={() => router.push("/equipe/nouveau")} testID="user-new" />
        ) : undefined
      }
      refreshing={users.isRefetching}
      onRefresh={() => void users.refetch()}
      testID="team"
    >
      <View style={{ gap: 10 }}>
        <SearchField value={search} onChangeText={setSearch} placeholder="Nom, identifiant, email…" />
        <Card padding={0}>
          <SwitchRow title="Afficher les comptes désactivés" value={showInactive} onValueChange={setShowInactive} />
        </Card>
      </View>
      {users.isPending ? (
        <SkeletonList rows={6} />
      ) : users.isError ? (
        <ErrorState error={users.error} onRetry={() => void users.refetch()} />
      ) : users.data.length === 0 ? (
        <Card>
          <EmptyState icon={Users} title="Aucun compte trouvé" message={q ? "Essayez une autre recherche." : undefined} />
        </Card>
      ) : (
        <ListGroup>
          {users.data.map((u) => (
            <ListRow
              key={u.id}
              title={`${u.firstName} ${u.lastName}`}
              subtitle={[ROLE_LABELS[u.role], u.jobTitle, u.lastLoginAt ? `vu ${timeAgo(u.lastLoginAt, timezone)}` : "jamais connecté"]
                .filter(Boolean)
                .join(" · ")}
              leading={<Avatar firstName={u.firstName} lastName={u.lastName} size={38} />}
              trailing={
                !u.isActive ? (
                  <Badge label="Désactivé" tone="neutral" />
                ) : u.mustChangePassword ? (
                  <Badge label="Première connexion" tone="warning" />
                ) : undefined
              }
              onPress={() => router.push(`/equipe/${u.id}`)}
              testID={`user-row-${u.username}`}
            />
          ))}
        </ListGroup>
      )}
    </Screen>
  );
}
