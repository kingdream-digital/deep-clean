import { useRouter } from "expo-router";
import { Bell, CircleUserRound, History, Settings, UserRound, Users } from "lucide-react-native";
import { ROLE_LABELS } from "@aussitot/shared";
import { useAuth } from "@/auth/AuthProvider";
import { useUnreadCount } from "@/navigation/useUnreadCount";
import { Avatar, Badge, ListGroup, ListRow, Screen } from "@/ui";

/** « Plus » (téléphone) : les sections qui ne tiennent pas dans la barre d'onglets, selon le rôle. */
export default function MoreScreen() {
  const router = useRouter();
  const { user, can } = useAuth();
  const unread = useUnreadCount();
  if (!user) return null;
  return (
    <Screen title="Plus" maxWidth={720} testID="more">
      <ListGroup>
        <ListRow
          title={`${user.firstName} ${user.lastName}`}
          subtitle={`${ROLE_LABELS[user.role]} · ${user.organization.name}`}
          leading={<Avatar firstName={user.firstName} lastName={user.lastName} size={44} />}
          onPress={() => router.push("/profil")}
          testID="more-profile"
        />
      </ListGroup>
      <ListGroup title="Suivi">
        <ListRow
          title="Notifications"
          icon={Bell}
          trailing={unread ? <Badge label={`${unread} non lue${unread > 1 ? "s" : ""}`} tone="accent" /> : undefined}
          onPress={() => router.push("/notifications")}
          testID="more-notifications"
        />
        {can("activity.read") ? (
          <ListRow
            title="Journal d'activité"
            subtitle="Qui a fait quoi, et quand"
            icon={History}
            onPress={() => router.push("/activite")}
          />
        ) : null}
      </ListGroup>
      <ListGroup title="Entreprise">
        {can("users.read") ? (
          <ListRow
            title="Équipe"
            subtitle={can("users.create") ? "Comptes, rôles, accès" : "Membres de l'entreprise"}
            icon={Users}
            onPress={() => router.push("/equipe")}
            testID="more-team"
          />
        ) : null}
        {can("clients.read") ? <ListRow title="Clients" icon={UserRound} onPress={() => router.push("/clients")} /> : null}
        {can("org.update") ? (
          <ListRow
            title="Réglages de l'entreprise"
            subtitle="Mentions légales, TVA, numérotation, logo"
            icon={Settings}
            onPress={() => router.push("/reglages")}
            testID="more-settings"
          />
        ) : null}
        <ListRow title="Profil et sécurité" icon={CircleUserRound} onPress={() => router.push("/profil")} />
      </ListGroup>
    </Screen>
  );
}
