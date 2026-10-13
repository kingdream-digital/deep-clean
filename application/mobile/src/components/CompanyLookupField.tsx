import React, { useState } from "react";
import { Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "./Card";
import { TextField } from "./TextField";
import { Button } from "./Button";
import { useTheme } from "../theme/ThemeProvider";
import { extractErrorMessage } from "../api/client";
import { lookupCompany } from "../api/clients.api";
import type { CompanyLookup } from "../api/clients.api";

interface Props {
  onFound: (company: CompanyLookup) => void;
}

/**
 * « Remplir avec le SIRET / SIREN » (retour explicite du client) : on tape le
 * numéro d'un futur client, l'application récupère dans l'annuaire officiel
 * des entreprises le nom, l'adresse, le code postal, la ville, le SIRET et le
 * SIREN, et remplit la fiche. Les champs restent modifiables ensuite.
 */
export function CompanyLookupField({ onFound }: Props) {
  const { colors, spacing, type } = useTheme();
  const [number, setNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState<CompanyLookup | null>(null);

  const digits = number.replace(/[\s.-]/g, "");
  const valid = /^(\d{9}|\d{14})$/.test(digits);

  async function search() {
    setError(null);
    setFound(null);
    setLoading(true);
    try {
      const company = await lookupCompany(digits);
      setFound(company);
      onFound(company);
    } catch (err) {
      setError(extractErrorMessage(err, "La recherche n'a pas abouti. Remplissez la fiche à la main."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card style={{ marginBottom: spacing.lg }}>
      <Text style={[type.headline, { color: colors.ink, marginBottom: spacing.xxs }]}>Remplir avec le SIRET ou le SIREN</Text>
      <Text style={[type.footnote, { color: colors.inkSecondary, marginBottom: spacing.md }]}>
        Le nom et l'adresse sont récupérés dans l'annuaire officiel des entreprises.
      </Text>
      <TextField
        label="SIRET (14 chiffres) ou SIREN (9 chiffres)"
        placeholder="123 456 789 00012"
        value={number}
        onChangeText={(v) => {
          setNumber(v);
          setError(null);
        }}
        keyboardType="number-pad"
        returnKeyType="search"
        onSubmitEditing={() => valid && !loading && void search()}
      />
      <Button label="Rechercher l'entreprise" icon="search-outline" variant="secondary" onPress={search} loading={loading} disabled={!valid} />

      {!!error && <Text style={[type.footnote, { color: colors.danger, marginTop: spacing.sm }]}>{error}</Text>}
      {!!found && (
        <View style={{ flexDirection: "row", alignItems: "flex-start", marginTop: spacing.md }}>
          <Ionicons
            name={found.active ? "checkmark-circle" : "warning"}
            size={20}
            color={found.active ? colors.success : colors.warning}
            style={{ marginTop: 1 }}
          />
          <View style={{ flex: 1, marginLeft: spacing.sm }}>
            <Text style={[type.subhead, { color: colors.ink, fontWeight: "600" }]}>{found.companyName}</Text>
            <Text style={[type.footnote, { color: colors.inkSecondary }]}>
              {[found.address, [found.postalCode, found.city].filter(Boolean).join(" ")].filter(Boolean).join(", ") || "Adresse non diffusée"}
              {found.siret ? ` · ${found.isHeadOffice ? "siège" : "établissement"}` : ""}
            </Text>
            <Text style={[type.footnote, { color: found.active ? colors.inkTertiary : colors.warning, marginTop: 2 }]}>
              {found.active
                ? "Fiche remplie : vérifiez et complétez le contact."
                : "Attention : cette entreprise ou cet établissement est fermé selon l'annuaire."}
            </Text>
          </View>
        </View>
      )}
    </Card>
  );
}
