import { useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Mail, Phone } from "lucide-react-native";
import { assignableRoles, createUserSchema, ROLE_DESCRIPTIONS, ROLE_LABELS, type CreatedUserDto, type Role } from "@aussitot/shared";
import { endpoints } from "@/api/endpoints";
import { ApiError } from "@/api/client";
import { useAuth } from "@/auth/AuthProvider";
import { CredentialsCard } from "@/features/CredentialsCard";
import { useBreakpoint } from "@/theme/ThemeProvider";
import { AccessDenied, Button, Screen, SelectField, Text, TextField, useToast } from "@/ui";

/**
 * Création d'un compte (RH / administrateur uniquement — contrôlé par le
 * serveur). L'identifiant et un mot de passe temporaire sont générés par le
 * serveur et affichés une seule fois.
 */
export default function NewUserScreen() {
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { isWide } = useBreakpoint();
  const { user, can } = useAuth();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [role, setRole] = useState<Role>("EMPLOYEE");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [weeklyHours, setWeeklyHours] = useState("");
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [created, setCreated] = useState<CreatedUserDto | null>(null);

  const create = useMutation({
    mutationFn: () =>
      endpoints.users.create({
        firstName,
        lastName,
        role,
        email: email || null,
        phone: phone || null,
        jobTitle: jobTitle || null,
        weeklyHours: weeklyHours ? Number(weeklyHours.replace(",", ".")) : null,
      }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["users"] });
      void queryClient.invalidateQueries({ queryKey: ["staff"] });
      setCreated(result);
      toast("Compte créé");
    },
    onError: (err) => {
      if (err instanceof ApiError && err.details) setErrors(Object.fromEntries(Object.entries(err.details).map(([k, v]) => [k, v[0]])));
      else setErrors({ form: err instanceof ApiError ? err.message : "Création impossible. Réessayez." });
    },
  });

  if (!user || !can("users.create")) {
    return (
      <Screen back title="Nouveau compte">
        <AccessDenied title="Accès réservé à la RH" message="Seule la RH (ou l'administrateur du compte) peut créer des comptes." />
      </Screen>
    );
  }

  if (created) {
    return (
      <Screen
        back
        title="Compte créé"
        subtitle={`${created.user.firstName} ${created.user.lastName} · ${ROLE_LABELS[created.user.role]}`}
        maxWidth={640}
      >
        <CredentialsCard
          organization={user.organization.slug}
          username={created.user.username}
          temporaryPassword={created.temporaryPassword}
          personName={created.user.firstName}
        />
        <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
          <Button label="Voir la fiche" onPress={() => router.replace(`/equipe/${created.user.id}`)} />
          <Button
            label="Créer un autre compte"
            variant="secondary"
            onPress={() => {
              setCreated(null);
              setFirstName("");
              setLastName("");
              setEmail("");
              setPhone("");
              setJobTitle("");
              setWeeklyHours("");
              setRole("EMPLOYEE");
            }}
          />
        </View>
      </Screen>
    );
  }

  const submit = () => {
    const parsed = createUserSchema.safeParse({
      firstName,
      lastName,
      role,
      email: email || null,
      phone: phone || null,
      jobTitle: jobTitle || null,
      weeklyHours: weeklyHours ? Number(weeklyHours.replace(",", ".")) : null,
    });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) next[String(issue.path[0])] ??= issue.message;
      setErrors(next);
      return;
    }
    setErrors({});
    create.mutate();
  };

  const roleOptions = assignableRoles(user.role).map((r) => ({ value: r, label: ROLE_LABELS[r], description: ROLE_DESCRIPTIONS[r] }));
  const row = { flexDirection: isWide ? ("row" as const) : ("column" as const), gap: 16 };

  return (
    <Screen
      back
      title="Nouveau compte"
      subtitle="L'identifiant et le mot de passe temporaire sont générés automatiquement."
      maxWidth={700}
      footer={<Button label="Créer le compte" size="lg" fullWidth loading={create.isPending} onPress={submit} testID="user-create" />}
    >
      <View style={row}>
        <View style={{ flex: 1 }}>
          <TextField
            label="Prénom"
            value={firstName}
            onChangeText={setFirstName}
            error={errors.firstName}
            autoComplete="off"
            testID="user-first-name"
          />
        </View>
        <View style={{ flex: 1 }}>
          <TextField
            label="Nom"
            value={lastName}
            onChangeText={setLastName}
            error={errors.lastName}
            autoComplete="off"
            testID="user-last-name"
          />
        </View>
      </View>
      <SelectField
        label="Rôle"
        options={roleOptions}
        value={role}
        onChange={(r) => r && setRole(r as Role)}
        error={errors.role}
        testID="user-role"
      />
      <Text variant="footnote" tone="tertiary" style={{ marginTop: -8 }}>
        {ROLE_DESCRIPTIONS[role]}
      </Text>
      <View style={row}>
        <View style={{ flex: 1 }}>
          <TextField
            label="Email (facultatif)"
            icon={Mail}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            error={errors.email}
          />
        </View>
        <View style={{ flex: 1 }}>
          <TextField
            label="Téléphone (facultatif)"
            icon={Phone}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            error={errors.phone}
          />
        </View>
      </View>
      <View style={row}>
        <View style={{ flex: 1.4 }}>
          <TextField
            label="Poste (facultatif)"
            value={jobTitle}
            onChangeText={setJobTitle}
            placeholder="ex. : Agent d'entretien"
            error={errors.jobTitle}
          />
        </View>
        <View style={{ flex: 1 }}>
          <TextField
            label="Heures par semaine (facultatif)"
            value={weeklyHours}
            onChangeText={setWeeklyHours}
            keyboardType="decimal-pad"
            placeholder="35"
            error={errors.weeklyHours}
          />
        </View>
      </View>
      {errors.form ? (
        <Text variant="subhead" tone="danger" accessibilityRole="alert">
          {errors.form}
        </Text>
      ) : null}
    </Screen>
  );
}
