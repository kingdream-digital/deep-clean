import { useEffect, useState } from "react";
import { View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Mail, Phone, UserRound } from "lucide-react-native";
import { clientInputSchema, type ClientInput, type ClientKind } from "@aussitot/shared";
import { endpoints } from "@/api/endpoints";
import { ApiError } from "@/api/client";
import { useAuth } from "@/auth/AuthProvider";
import { useBreakpoint } from "@/theme/ThemeProvider";
import { Button, EmptyState, Screen, SectionTitle, Segmented, Skeleton, Text, TextField, useToast } from "@/ui";

type Form = Required<{ [K in keyof ClientInput]: string }>;
const EMPTY: Form = {
  kind: "COMPANY",
  name: "",
  contactFirstName: "",
  contactLastName: "",
  email: "",
  phone: "",
  addressLine1: "",
  addressLine2: "",
  postalCode: "",
  city: "",
  country: "FR",
  siren: "",
  siret: "",
  vatNumber: "",
  notes: "",
};

/** Création / modification d'un client. */
export default function ClientFormScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const editingId = params.id;
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { isWide } = useBreakpoint();
  const { can } = useAuth();
  const [form, setForm] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [loaded, setLoaded] = useState(!editingId);
  const existing = useQuery({
    queryKey: ["client", editingId],
    queryFn: () => endpoints.clients.get(editingId as string),
    enabled: Boolean(editingId),
  });

  useEffect(() => {
    const c = existing.data;
    if (!c || loaded) return;
    setForm({
      kind: c.kind,
      name: c.name,
      contactFirstName: c.contactFirstName ?? "",
      contactLastName: c.contactLastName ?? "",
      email: c.email ?? "",
      phone: c.phone ?? "",
      addressLine1: c.addressLine1 ?? "",
      addressLine2: c.addressLine2 ?? "",
      postalCode: c.postalCode ?? "",
      city: c.city ?? "",
      country: c.country,
      siren: c.siren ?? "",
      siret: c.siret ?? "",
      vatNumber: c.vatNumber ?? "",
      notes: c.notes ?? "",
    });
    setLoaded(true);
  }, [existing.data, loaded]);

  const set = (key: keyof Form) => (value: string) => setForm((f) => ({ ...f, [key]: value }));
  const save = useMutation({
    mutationFn: (input: ClientInput) => (editingId ? endpoints.clients.update(editingId, input) : endpoints.clients.create(input)),
    onSuccess: (client) => {
      queryClient.setQueryData(["client", client.id], client);
      void queryClient.invalidateQueries({ queryKey: ["clients"] });
      toast(editingId ? "Client enregistré" : `${client.name} ajouté`);
      router.replace(`/clients/${client.id}`);
    },
    onError: (err) => {
      if (err instanceof ApiError && err.details) setErrors(Object.fromEntries(Object.entries(err.details).map(([k, v]) => [k, v[0]])));
      else setErrors({ form: err instanceof ApiError ? err.message : "Enregistrement impossible. Réessayez." });
    },
  });

  const submit = () => {
    const input = { ...form, kind: form.kind as ClientKind };
    const parsed = clientInputSchema.safeParse(input);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) next[String(issue.path[0])] ??= issue.message;
      setErrors(next);
      return;
    }
    setErrors({});
    save.mutate(input);
  };

  if (!can("clients.write")) {
    return (
      <Screen back title="Client">
        <EmptyState title="Accès réservé" message="La gestion des clients est réservée aux personnes qui gèrent les ventes." />
      </Screen>
    );
  }
  if (!loaded) {
    return (
      <Screen back title="Modifier le client">
        <Skeleton height={300} radius={18} />
      </Screen>
    );
  }

  const company = form.kind === "COMPANY";
  const row = (children: React.ReactNode) => <View style={{ flexDirection: isWide ? "row" : "column", gap: 16 }}>{children}</View>;
  const cell = (children: React.ReactNode, flex = 1) => <View style={{ flex }}>{children}</View>;

  return (
    <Screen
      back
      title={editingId ? "Modifier le client" : "Nouveau client"}
      maxWidth={760}
      footer={
        <Button
          label={editingId ? "Enregistrer" : "Ajouter le client"}
          size="lg"
          fullWidth
          loading={save.isPending}
          onPress={submit}
          testID="client-save"
        />
      }
    >
      <Segmented
        options={[
          { value: "COMPANY", label: "Professionnel" },
          { value: "INDIVIDUAL", label: "Particulier" },
        ]}
        value={form.kind as ClientKind}
        onChange={(kind) => setForm((f) => ({ ...f, kind }))}
      />
      <TextField
        label={company ? "Raison sociale" : "Nom complet"}
        icon={company ? Building2 : UserRound}
        value={form.name}
        onChangeText={set("name")}
        error={errors.name}
        maxLength={200}
        testID="client-name"
      />
      {company
        ? row(
            <>
              {cell(
                <TextField
                  label="Prénom du contact"
                  value={form.contactFirstName}
                  onChangeText={set("contactFirstName")}
                  error={errors.contactFirstName}
                />,
              )}
              {cell(
                <TextField
                  label="Nom du contact"
                  value={form.contactLastName}
                  onChangeText={set("contactLastName")}
                  error={errors.contactLastName}
                />,
              )}
            </>,
          )
        : null}
      {row(
        <>
          {cell(
            <TextField
              label="Email"
              icon={Mail}
              value={form.email}
              onChangeText={set("email")}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              error={errors.email}
              hint="Pour envoyer devis et factures"
              testID="client-email"
            />,
          )}
          {cell(
            <TextField
              label="Téléphone"
              icon={Phone}
              value={form.phone}
              onChangeText={set("phone")}
              keyboardType="phone-pad"
              error={errors.phone}
            />,
          )}
        </>,
      )}
      <SectionTitle title="Adresse" />
      <TextField label="Adresse" value={form.addressLine1} onChangeText={set("addressLine1")} error={errors.addressLine1} />
      <TextField label="Complément (facultatif)" value={form.addressLine2} onChangeText={set("addressLine2")} error={errors.addressLine2} />
      {row(
        <>
          {cell(
            <TextField
              label="Code postal"
              value={form.postalCode}
              onChangeText={set("postalCode")}
              keyboardType="number-pad"
              error={errors.postalCode}
            />,
            0.6,
          )}
          {cell(<TextField label="Ville" value={form.city} onChangeText={set("city")} error={errors.city} />)}
        </>,
      )}
      {company ? (
        <>
          <SectionTitle title="Identification (facultatif)" />
          {row(
            <>
              {cell(
                <TextField label="SIRET" value={form.siret} onChangeText={set("siret")} keyboardType="number-pad" error={errors.siret} />,
              )}
              {cell(
                <TextField
                  label="N° de TVA intracommunautaire"
                  value={form.vatNumber}
                  onChangeText={set("vatNumber")}
                  autoCapitalize="characters"
                  error={errors.vatNumber}
                />,
              )}
            </>,
          )}
        </>
      ) : null}
      <TextField label="Notes (internes)" value={form.notes} onChangeText={set("notes")} multiline maxLength={2000} error={errors.notes} />
      {errors.form ? (
        <Text variant="subhead" tone="danger" accessibilityRole="alert">
          {errors.form}
        </Text>
      ) : null}
    </Screen>
  );
}
