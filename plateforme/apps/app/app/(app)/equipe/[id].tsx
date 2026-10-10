import { useEffect, useState } from "react";
import { Linking, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, KeyRound, Mail, Pencil, Phone, UserCheck, UserX } from "lucide-react-native";
import {
  assignableRoles,
  canManageAccount,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  type CreatedUserDto,
  type Role,
  type UserDto,
} from "@aussitot/shared";
import { endpoints } from "@/api/endpoints";
import { ApiError } from "@/api/client";
import { useAuth } from "@/auth/AuthProvider";
import { CredentialsCard } from "@/features/CredentialsCard";
import { formatInstant } from "@/lib/format";
import { useOrgTimezone } from "@/lib/today";
import {
  Avatar,
  Badge,
  Button,
  Card,
  ConfirmSheet,
  ErrorState,
  ListGroup,
  ListRow,
  Screen,
  SelectField,
  Sheet,
  Skeleton,
  Text,
  TextField,
  useToast,
} from "@/ui";

/** Fiche d'un membre de l'équipe ; gestion du compte selon les droits (jamais sur un rang supérieur au sien). */
export default function UserScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const toast = useToast();
  const queryClient = useQueryClient();
  const timezone = useOrgTimezone();
  const { user: me, can } = useAuth();
  const [sheet, setSheet] = useState<null | "edit" | "deactivate" | "reset">(null);
  const [credentials, setCredentials] = useState<CreatedUserDto | null>(null);
  const query = useQuery({ queryKey: ["user", id], queryFn: () => endpoints.users.get(id), enabled: Boolean(id) });
  const person = query.data;

  const refresh = (updated: UserDto) => {
    queryClient.setQueryData(["user", id], updated);
    void queryClient.invalidateQueries({ queryKey: ["users"] });
    void queryClient.invalidateQueries({ queryKey: ["staff"] });
  };
  const toggle = useMutation({
    mutationFn: () => (person?.isActive ? endpoints.users.deactivate(id) : endpoints.users.reactivate(id)),
    onSuccess: (updated) => {
      refresh(updated);
      setSheet(null);
      toast(updated.isActive ? "Compte réactivé" : "Compte désactivé : ses sessions sont fermées");
    },
  });
  const reset = useMutation({
    mutationFn: () => endpoints.users.resetAccess(id),
    onSuccess: (result) => {
      refresh(result.user);
      setSheet(null);
      setCredentials(result);
    },
  });

  if (query.isPending) {
    return (
      <Screen back="Équipe" title=" ">
        <Skeleton height={200} radius={18} />
      </Screen>
    );
  }
  if (!person || !me) {
    return (
      <Screen back="Équipe" title="Compte">
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      </Screen>
    );
  }

  const self = person.id === me.id;
  const manageable = !self && canManageAccount(me.role, person.role);

  return (
    <Screen
      back="Équipe"
      title={`${person.firstName} ${person.lastName}`}
      subtitle={[ROLE_LABELS[person.role], person.jobTitle].filter(Boolean).join(" · ")}
      maxWidth={760}
      testID="user-detail"
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
        <Avatar firstName={person.firstName} lastName={person.lastName} size={56} />
        <View style={{ flex: 1, gap: 6 }}>
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            {person.isActive ? <Badge label="Actif" tone="success" /> : <Badge label="Désactivé" tone="neutral" />}
            {person.mustChangePassword ? <Badge label="Mot de passe temporaire" tone="warning" /> : null}
          </View>
          <Text variant="footnote" tone="tertiary">
            Identifiant : {person.username} ·{" "}
            {person.lastLoginAt ? `dernière connexion ${formatInstant(person.lastLoginAt, timezone)}` : "jamais connecté"}
          </Text>
        </View>
      </View>

      {credentials ? (
        <CredentialsCard
          organization={me.organization.slug}
          username={credentials.user.username}
          temporaryPassword={credentials.temporaryPassword}
          personName={person.firstName}
        />
      ) : null}

      <ListGroup title="Coordonnées">
        {person.email ? (
          <ListRow title={person.email} icon={Mail} onPress={() => void Linking.openURL(`mailto:${person.email}`)} />
        ) : (
          <ListRow title="Pas d'email" icon={Mail} iconTone="neutral" />
        )}
        {person.phone ? (
          <ListRow title={person.phone} icon={Phone} onPress={() => void Linking.openURL(`tel:${person.phone?.replace(/[^\d+]/g, "")}`)} />
        ) : null}
        {person.weeklyHours !== null ? (
          <ListRow title={`${person.weeklyHours} h par semaine`} icon={CalendarDays} iconTone="neutral" />
        ) : null}
      </ListGroup>

      {manageable && (can("users.update") || can("users.deactivate") || can("users.resetAccess")) ? (
        <ListGroup
          title="Gestion du compte"
          footer="Pour tout problème de connexion, la RH réinitialise l'accès : un nouveau mot de passe temporaire est créé, sans jamais voir l'ancien."
        >
          {can("users.update") ? (
            <ListRow
              title="Modifier le compte"
              subtitle="Rôle, poste, coordonnées"
              icon={Pencil}
              onPress={() => setSheet("edit")}
              testID="user-edit"
            />
          ) : null}
          {can("users.resetAccess") && person.isActive ? (
            <ListRow
              title="Réinitialiser l'accès"
              subtitle="Nouveau mot de passe temporaire, sessions fermées"
              icon={KeyRound}
              iconTone="warning"
              onPress={() => setSheet("reset")}
              testID="user-reset"
            />
          ) : null}
          {can("users.deactivate") ? (
            <ListRow
              title={person.isActive ? "Désactiver le compte" : "Réactiver le compte"}
              subtitle={person.isActive ? "La personne ne peut plus se connecter" : "La personne pourra de nouveau se connecter"}
              icon={person.isActive ? UserX : UserCheck}
              iconTone={person.isActive ? "danger" : "success"}
              destructive={person.isActive}
              onPress={() => (person.isActive ? setSheet("deactivate") : toggle.mutate())}
              testID="user-toggle"
            />
          ) : null}
        </ListGroup>
      ) : self ? (
        <Card>
          <Text variant="subhead" tone="secondary">
            C'est votre compte. Votre mot de passe se change depuis votre profil.
          </Text>
        </Card>
      ) : null}

      <ConfirmSheet
        visible={sheet === "deactivate"}
        title={`Désactiver le compte de ${person.firstName} ?`}
        message="Ses sessions sont fermées immédiatement sur tous ses appareils. Son historique est conservé ; le compte peut être réactivé."
        confirmLabel="Désactiver"
        tone="danger"
        loading={toggle.isPending}
        error={toggle.error instanceof ApiError ? toggle.error.message : null}
        onConfirm={() => toggle.mutate()}
        onClose={() => setSheet(null)}
      />
      <ConfirmSheet
        visible={sheet === "reset"}
        title={`Réinitialiser l'accès de ${person.firstName} ?`}
        message="Un nouveau mot de passe temporaire est créé et ses sessions en cours sont fermées. Il devra choisir un nouveau mot de passe à sa prochaine connexion."
        confirmLabel="Réinitialiser"
        loading={reset.isPending}
        error={reset.error instanceof ApiError ? reset.error.message : null}
        onConfirm={() => reset.mutate()}
        onClose={() => setSheet(null)}
      />
      <EditUserSheet
        visible={sheet === "edit"}
        person={person}
        actorRole={me.role}
        onClose={() => setSheet(null)}
        onSaved={(u) => (refresh(u), setSheet(null), toast("Compte modifié"))}
      />
    </Screen>
  );
}

function EditUserSheet({
  visible,
  person,
  actorRole,
  onClose,
  onSaved,
}: {
  visible: boolean;
  person: UserDto;
  actorRole: Role;
  onClose: () => void;
  onSaved: (user: UserDto) => void;
}) {
  const [role, setRole] = useState<Role>(person.role);
  const [jobTitle, setJobTitle] = useState(person.jobTitle ?? "");
  const [email, setEmail] = useState(person.email ?? "");
  const [phone, setPhone] = useState(person.phone ?? "");
  const [weeklyHours, setWeeklyHours] = useState(person.weeklyHours === null ? "" : String(person.weeklyHours));
  useEffect(() => {
    if (!visible) return;
    setRole(person.role);
    setJobTitle(person.jobTitle ?? "");
    setEmail(person.email ?? "");
    setPhone(person.phone ?? "");
    setWeeklyHours(person.weeklyHours === null ? "" : String(person.weeklyHours));
  }, [visible, person]);
  const save = useMutation({
    mutationFn: () =>
      endpoints.users.update(person.id, {
        role,
        jobTitle: jobTitle || null,
        email: email || null,
        phone: phone || null,
        weeklyHours: weeklyHours ? Number(weeklyHours.replace(",", ".")) : null,
      }),
    onSuccess: onSaved,
  });
  const err = save.error instanceof ApiError ? save.error : null;
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Modifier le compte"
      footer={<Button label="Enregistrer" size="lg" fullWidth loading={save.isPending} onPress={() => save.mutate()} testID="user-save" />}
    >
      <SelectField
        label="Rôle"
        options={assignableRoles(actorRole).map((r) => ({ value: r, label: ROLE_LABELS[r], description: ROLE_DESCRIPTIONS[r] }))}
        value={role}
        onChange={(r) => r && setRole(r as Role)}
        error={err?.field("role")}
      />
      <TextField label="Poste" value={jobTitle} onChangeText={setJobTitle} error={err?.field("jobTitle")} />
      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        error={err?.field("email")}
      />
      <TextField label="Téléphone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" error={err?.field("phone")} />
      <TextField
        label="Heures par semaine"
        value={weeklyHours}
        onChangeText={setWeeklyHours}
        keyboardType="decimal-pad"
        error={err?.field("weeklyHours")}
      />
      {err && !err.details ? (
        <Text variant="subhead" tone="danger">
          {err.message}
        </Text>
      ) : null}
    </Sheet>
  );
}
