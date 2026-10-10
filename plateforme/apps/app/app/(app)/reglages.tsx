import { useEffect, useState } from "react";
import { Image, Platform, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImageUp, Sparkles } from "lucide-react-native";
import {
  formatVatRate,
  organizationSettingsSchema,
  VAT_RATES_BPS,
  type OrganizationDto,
  type OrganizationSettingsInput,
  type VatRegime,
} from "@aussitot/shared";
import { endpoints, uploadLogo } from "@/api/endpoints";
import { ApiError } from "@/api/client";
import { useAuth } from "@/auth/AuthProvider";
import { useOrgLogo } from "@/lib/logo";
import { useBreakpoint, useTheme } from "@/theme/ThemeProvider";
import {
  AccessDenied,
  Button,
  Card,
  ErrorState,
  FilterChips,
  Screen,
  SectionTitle,
  Segmented,
  SelectField,
  Skeleton,
  Text,
  TextField,
  useToast,
} from "@/ui";

type Form = Record<keyof OrganizationSettingsInput, string>;
const TEXT_KEYS = [
  "name",
  "legalName",
  "legalForm",
  "shareCapital",
  "siren",
  "siret",
  "vatNumber",
  "rcs",
  "addressLine1",
  "addressLine2",
  "postalCode",
  "city",
  "country",
  "email",
  "phone",
  "website",
  "iban",
  "bic",
  "latePenaltyText",
  "timezone",
  "quotePrefix",
  "invoicePrefix",
  "creditNotePrefix",
  "brandColor",
  "emailSignature",
] as const;

const TIMEZONES = [
  { value: "Europe/Paris", label: "France métropolitaine (Paris)" },
  { value: "Europe/Brussels", label: "Belgique (Bruxelles)" },
  { value: "Europe/Luxembourg", label: "Luxembourg" },
  { value: "Europe/Zurich", label: "Suisse (Zurich)" },
  { value: "America/Martinique", label: "Martinique" },
  { value: "America/Guadeloupe", label: "Guadeloupe" },
  { value: "America/Cayenne", label: "Guyane" },
  { value: "Indian/Reunion", label: "La Réunion" },
  { value: "Indian/Mayotte", label: "Mayotte" },
  { value: "Pacific/Noumea", label: "Nouvelle-Calédonie" },
  { value: "Pacific/Tahiti", label: "Polynésie (Tahiti)" },
  { value: "America/Montreal", label: "Québec (Montréal)" },
];

function toForm(org: OrganizationDto): Form {
  const form = {} as Form;
  for (const key of TEXT_KEYS) form[key] = (org[key] as string | null) ?? "";
  form.vatRegime = org.vatRegime;
  form.defaultVatRateBps = String(org.defaultVatRateBps);
  form.paymentTermsDays = String(org.paymentTermsDays);
  form.quoteValidityDays = String(org.quoteValidityDays);
  return form;
}

function toInput(form: Form): OrganizationSettingsInput {
  return {
    ...Object.fromEntries(TEXT_KEYS.map((k) => [k, form[k]])),
    brandColor: form.brandColor.trim() || null,
    vatRegime: form.vatRegime as VatRegime,
    defaultVatRateBps: Number(form.defaultVatRateBps),
    paymentTermsDays: Number(form.paymentTermsDays),
    quoteValidityDays: Number(form.quoteValidityDays),
  } as OrganizationSettingsInput;
}

/**
 * Réglages de l'entreprise (administrateur du compte) : ce qui figure sur les
 * devis et factures (mentions légales obligatoires), TVA, délais, numérotation, logo.
 */
export default function SettingsScreen() {
  const { colors, radius } = useTheme();
  const { isWide } = useBreakpoint();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const org = useQuery({ queryKey: ["organization"], queryFn: endpoints.organization.get });
  const [form, setForm] = useState<Form | null>(null);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const logo = useOrgLogo(Boolean(org.data?.hasLogo), org.dataUpdatedAt.toString());

  useEffect(() => {
    if (org.data && !form) setForm(toForm(org.data));
  }, [org.data, form]);

  const save = useMutation({
    mutationFn: (input: OrganizationSettingsInput) => endpoints.organization.update(input),
    onSuccess: (updated) => {
      queryClient.setQueryData(["organization"], updated);
      setForm(toForm(updated));
      toast("Réglages enregistrés");
    },
    onError: (err) => {
      if (err instanceof ApiError && err.details) setErrors(Object.fromEntries(Object.entries(err.details).map(([k, v]) => [k, v[0]])));
      else toast(err instanceof ApiError ? err.message : "Enregistrement impossible.", "error");
    },
  });
  const upload = useMutation({
    mutationFn: async () => {
      const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.9, allowsMultipleSelection: false });
      if (picked.canceled || !picked.assets[0]) return null;
      const asset = picked.assets[0];
      return uploadLogo({
        uri: asset.uri,
        name: asset.fileName ?? "logo.png",
        type: asset.mimeType ?? "image/png",
        webFile: Platform.OS === "web" ? (asset.file ?? undefined) : undefined,
      });
    },
    onSuccess: (updated) => {
      if (!updated) return;
      queryClient.setQueryData(["organization"], updated);
      toast("Logo mis à jour : il figure sur vos prochains devis et factures");
    },
    onError: (err) => toast(err instanceof ApiError ? err.message : "Le logo n'a pas pu être envoyé.", "error"),
  });

  if (!can("org.update")) {
    return (
      <Screen title="Réglages">
        <AccessDenied title="Accès réservé" message="Les réglages de l'entreprise sont réservés à l'administrateur du compte." />
      </Screen>
    );
  }
  if (org.isError && !org.data) {
    return (
      <Screen title="Réglages">
        <ErrorState error={org.error} onRetry={() => void org.refetch()} />
      </Screen>
    );
  }
  if (!form || !org.data) {
    return (
      <Screen title="Réglages">
        <Skeleton height={400} radius={18} />
      </Screen>
    );
  }

  const set = (key: keyof Form) => (value: string) => setForm((f) => (f ? { ...f, [key]: value } : f));
  const field = (key: (typeof TEXT_KEYS)[number], label: string, extra: Partial<React.ComponentProps<typeof TextField>> = {}) => (
    <View style={{ flex: 1, minWidth: isWide ? 220 : undefined }}>
      <TextField label={label} value={form[key]} onChangeText={set(key)} error={errors[key]} {...extra} />
    </View>
  );
  const row = (children: React.ReactNode) => <View style={{ flexDirection: isWide ? "row" : "column", gap: 16 }}>{children}</View>;

  const submit = () => {
    const input = toInput(form);
    const parsed = organizationSettingsSchema.safeParse(input);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) next[String(issue.path[0])] ??= issue.message;
      setErrors(next);
      toast("Certains champs sont à corriger.", "error");
      return;
    }
    setErrors({});
    save.mutate(input);
  };

  const franchise = form.vatRegime === "FRANCHISE";

  return (
    <Screen
      title="Réglages"
      subtitle="Ces informations figurent sur vos devis et factures."
      maxWidth={880}
      footer={
        <Button label="Enregistrer les réglages" size="lg" fullWidth loading={save.isPending} onPress={submit} testID="settings-save" />
      }
      testID="settings"
    >
      <Card padding={18}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
          <View
            style={{
              width: 120,
              height: 64,
              borderRadius: radius.md,
              backgroundColor: colors.surfaceMuted,
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
            }}
          >
            {logo ? (
              <Image source={logo} style={{ width: 112, height: 56 }} resizeMode="contain" accessibilityLabel="Logo de l'entreprise" />
            ) : (
              <Text variant="footnote" tone="tertiary">
                Pas de logo
              </Text>
            )}
          </View>
          <View style={{ flex: 1, gap: 8 }}>
            <Text variant="headline">Logo</Text>
            <Text variant="footnote" tone="secondary">
              PNG, JPEG ou WebP, 2 Mo au plus. Affiché en tête des documents.
            </Text>
            <Button
              label={org.data.hasLogo ? "Changer le logo" : "Ajouter un logo"}
              icon={ImageUp}
              size="sm"
              variant="secondary"
              loading={upload.isPending}
              onPress={() => upload.mutate()}
            />
          </View>
        </View>
      </Card>

      <SectionTitle title="Identité" />
      {row(
        <>
          {field("name", "Nom commercial")}
          {field("legalName", "Raison sociale")}
        </>,
      )}
      {row(
        <>
          {field("legalForm", "Forme juridique", { placeholder: "SAS, SARL, EI…" })}
          {field("shareCapital", "Capital social", { placeholder: "ex. : 10 000 €" })}
        </>,
      )}
      {row(
        <>
          {field("siren", "SIREN", { keyboardType: "number-pad" })}
          {field("siret", "SIRET", { keyboardType: "number-pad" })}
        </>,
      )}
      {row(
        <>
          {field("vatNumber", "N° de TVA intracommunautaire", { autoCapitalize: "characters" })}
          {field("rcs", "RCS", { placeholder: "ex. : RCS Lyon" })}
        </>,
      )}

      <SectionTitle title="Coordonnées" />
      {field("addressLine1", "Adresse")}
      {field("addressLine2", "Complément")}
      {row(
        <>
          {field("postalCode", "Code postal", { keyboardType: "number-pad" })}
          {field("city", "Ville")}
        </>,
      )}
      {row(
        <>
          {field("email", "Email", { keyboardType: "email-address", autoCapitalize: "none" })}
          {field("phone", "Téléphone", { keyboardType: "phone-pad" })}
        </>,
      )}
      {field("website", "Site web", { autoCapitalize: "none" })}

      <SectionTitle title="TVA" />
      <Segmented<VatRegime>
        options={[
          { value: "NORMAL", label: "Assujetti à la TVA" },
          { value: "FRANCHISE", label: "Franchise en base" },
        ]}
        value={form.vatRegime as VatRegime}
        onChange={(v) =>
          setForm((f) =>
            f
              ? {
                  ...f,
                  vatRegime: v,
                  defaultVatRateBps: v === "FRANCHISE" ? "0" : f.defaultVatRateBps === "0" ? "2000" : f.defaultVatRateBps,
                }
              : f,
          )
        }
      />
      {franchise ? (
        <Text variant="footnote" tone="secondary">
          Vos documents portent la mention « TVA non applicable, art. 293 B du CGI » et aucune TVA n'est calculée.
        </Text>
      ) : (
        <View style={{ gap: 6 }}>
          <Text variant="subhead" weight="medium" tone="secondary">
            Taux par défaut des nouvelles lignes
          </Text>
          <FilterChips
            options={VAT_RATES_BPS.map((r) => ({ value: String(r), label: formatVatRate(r) }))}
            value={form.defaultVatRateBps}
            onChange={set("defaultVatRateBps")}
          />
        </View>
      )}

      <SectionTitle title="Paiement" />
      {row(
        <>
          {field("iban", "IBAN", { autoCapitalize: "characters" })}
          {field("bic", "BIC", { autoCapitalize: "characters" })}
        </>,
      )}
      {row(
        <>
          <View style={{ flex: 1 }}>
            <TextField
              label="Délai de paiement (jours)"
              value={form.paymentTermsDays}
              onChangeText={set("paymentTermsDays")}
              keyboardType="number-pad"
              error={errors.paymentTermsDays}
              hint="60 jours au maximum (Code de commerce)"
            />
          </View>
          <View style={{ flex: 1 }}>
            <TextField
              label="Validité des devis (jours)"
              value={form.quoteValidityDays}
              onChangeText={set("quoteValidityDays")}
              keyboardType="number-pad"
              error={errors.quoteValidityDays}
            />
          </View>
        </>,
      )}
      {field("latePenaltyText", "Taux des pénalités de retard", {
        placeholder: "Vide : taux BCE majoré de 10 points (mention par défaut)",
        hint: "Complète « En cas de retard de paiement : pénalités au … ». L'indemnité de 40 € (clients professionnels) est toujours mentionnée.",
      })}

      <SectionTitle title="Numérotation et envois" />
      {row(
        <>
          {field("quotePrefix", "Préfixe des devis", { autoCapitalize: "characters" })}
          {field("invoicePrefix", "Préfixe des factures", { autoCapitalize: "characters" })}
          {field("creditNotePrefix", "Préfixe des avoirs", { autoCapitalize: "characters" })}
        </>,
      )}
      <SelectField
        label="Fuseau horaire"
        options={TIMEZONES}
        value={form.timezone}
        onChange={(v) => v && set("timezone")(v)}
        error={errors.timezone}
      />
      {row(
        <>
          {field("brandColor", "Couleur de marque (documents)", { placeholder: "#2347F5", autoCapitalize: "none" })}
          <View
            style={{
              width: 50,
              height: 50,
              borderRadius: radius.md,
              marginTop: isWide ? 25 : 0,
              backgroundColor: /^#[0-9A-Fa-f]{6}$/.test(form.brandColor) ? form.brandColor : colors.surfaceMuted,
              borderWidth: 1,
              borderColor: colors.border,
            }}
            accessibilityLabel="Aperçu de la couleur"
          />
        </>,
      )}
      {field("emailSignature", "Signature des emails", { multiline: true })}

      <Card padding={16}>
        <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
          <Sparkles size={20} color={colors.sparkText} />
          <View style={{ flex: 1 }}>
            <Text variant="callout" weight="semibold">
              Assistant {org.data.assistantEnabled ? "activé" : "non activé"}
            </Text>
            <Text variant="footnote" tone="secondary">
              Formule « {org.data.plan} » · code entreprise « {org.data.slug} »
            </Text>
          </View>
        </View>
      </Card>
    </Screen>
  );
}
