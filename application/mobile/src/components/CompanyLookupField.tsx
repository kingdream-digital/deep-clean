import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { TextField } from "./TextField";
import { useTheme } from "../theme/ThemeProvider";
import { extractErrorMessage } from "../api/client";
import { lookupCompany } from "../api/clients.api";
import type { CompanyLookup } from "../api/clients.api";

interface Props {
  value: string;
  onChangeText: (value: string) => void;
  onFound: (company: CompanyLookup) => void;
}

const DEBOUNCE_MS = 350;

/**
 * Champ « SIRET ou SIREN » qui remplit la fiche tout seul (retour explicite
 * du client) : dès que le numéro est complet (9 ou 14 chiffres), l'annuaire
 * officiel des entreprises est interrogé — pas de bouton, pas de second champ.
 * Nom, adresse, code postal, ville, SIRET et SIREN sont remplis ; tout reste
 * modifiable.
 */
export function CompanyLookupField({ value, onChangeText, onFound }: Props) {
  const { colors, spacing, type } = useTheme();
  const [state, setState] = useState<"idle" | "loading" | "found" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [found, setFound] = useState<CompanyLookup | null>(null);
  // Numéro déjà cherché (ou déjà rempli par une recherche) : pas de nouvel appel.
  const lastSearched = useRef(value.replace(/[\s.-]/g, ""));
  const requestId = useRef(0);
  const onFoundRef = useRef(onFound);
  onFoundRef.current = onFound;

  const digits = value.replace(/[\s.-]/g, "");

  useEffect(() => {
    if (!/^(\d{9}|\d{14})$/.test(digits) || digits === lastSearched.current) return;
    const id = ++requestId.current;
    const timer = setTimeout(async () => {
      lastSearched.current = digits;
      setState("loading");
      setMessage(null);
      try {
        const company = await lookupCompany(digits);
        if (id !== requestId.current) return;
        // Le SIRET retourné (siège pour un SIREN) devient la valeur du champ :
        // on ne relance pas de recherche pour lui.
        if (company.siret) lastSearched.current = company.siret;
        setFound(company);
        setState("found");
        onFoundRef.current(company);
      } catch (err) {
        if (id !== requestId.current) return;
        lastSearched.current = "";
        setState("error");
        setMessage(extractErrorMessage(err, "Entreprise introuvable. Remplissez la fiche à la main."));
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [digits]);

  return (
    <View style={{ marginBottom: spacing.md }}>
      <TextField
        label="SIRET ou SIREN"
        placeholder="14 ou 9 chiffres"
        value={value}
        onChangeText={(v) => {
          onChangeText(v);
          if (state !== "loading") {
            setState("idle");
            setMessage(null);
          }
        }}
        keyboardType="number-pad"
      />
      {state === "idle" && (
        <Text style={[type.footnote, { color: colors.inkTertiary, marginTop: -spacing.xs }]}>
          Dès que le numéro est complet, la fiche se remplit toute seule.
        </Text>
      )}
      {state === "loading" && (
        <View style={{ flexDirection: "row", alignItems: "center", marginTop: -spacing.xs }}>
          <ActivityIndicator size="small" color={colors.accent} />
          <Text style={[type.footnote, { color: colors.inkSecondary, marginLeft: spacing.xs }]}>Recherche dans l'annuaire des entreprises…</Text>
        </View>
      )}
      {state === "found" && !!found && (
        <View style={{ flexDirection: "row", alignItems: "flex-start", marginTop: -spacing.xs }}>
          <Ionicons name={found.active ? "checkmark-circle" : "warning"} size={16} color={found.active ? colors.success : colors.warning} style={{ marginTop: 2 }} />
          <Text style={[type.footnote, { color: found.active ? colors.inkSecondary : colors.warning, marginLeft: spacing.xs, flex: 1 }]}>
            {found.active
              ? `${found.companyName} — fiche remplie${found.siret ? (found.isHeadOffice ? " (siège)" : " (établissement)") : ""}.`
              : `${found.companyName} — attention : entreprise ou établissement fermé selon l'annuaire.`}
          </Text>
        </View>
      )}
      {state === "error" && !!message && (
        <Text style={[type.footnote, { color: colors.danger, marginTop: -spacing.xs }]}>{message}</Text>
      )}
    </View>
  );
}
