import React, { useCallback, useEffect, useState } from "react";
import { ScrollView, Text } from "react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { useResponsive } from "../../hooks/useResponsive";
import { StateView } from "../../components/StateView";
import { TextField } from "../../components/TextField";
import { Button } from "../../components/Button";
import { useTheme } from "../../theme/ThemeProvider";
import { extractErrorMessage } from "../../api/client";
import { createClient, getClient, updateClient } from "../../api/clients.api";
import type { MenuStackParamList } from "../../navigation/MenuStack";

type Route = RouteProp<MenuStackParamList, "ClientForm">;

export function ClientFormScreen() {
  const { colors, spacing, type } = useTheme();
  const { isDesktopWeb } = useResponsive();
  const route = useRoute<Route>();
  const navigation = useNavigation<NativeStackNavigationProp<MenuStackParamList>>();
  const clientId = route.params?.clientId;
  const isEdit = !!clientId;

  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [companyName, setCompanyName] = useState("");
  const [contactFirstName, setContactFirstName] = useState("");
  const [contactLastName, setContactLastName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [billingAddress, setBillingAddress] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [city, setCity] = useState("");
  const [siret, setSiret] = useState("");
  const [siren, setSiren] = useState("");
  const [notes, setNotes] = useState("");

  const load = useCallback(async () => {
    try {
      setLoadState("loading");
      if (isEdit && clientId) {
        const client = await getClient(clientId);
        setCompanyName(client.companyName);
        setContactFirstName(client.contactFirstName ?? "");
        setContactLastName(client.contactLastName ?? "");
        setJobTitle(client.jobTitle ?? "");
        setPhone(client.phone ?? "");
        setEmail(client.email ?? "");
        setBillingAddress(client.billingAddress ?? "");
        setPostalCode(client.postalCode ?? "");
        setCity(client.city ?? "");
        setSiret(client.siret ?? "");
        setSiren(client.siren ?? "");
        setNotes(client.notes ?? "");
      }
      setLoadState("ready");
    } catch {
      setLoadState("error");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, isEdit]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  async function handleSave() {
    setError(null);
    if (!companyName.trim()) {
      setError("Le nom de l'entreprise est requis.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        companyName: companyName.trim(),
        contactFirstName: contactFirstName.trim() || undefined,
        contactLastName: contactLastName.trim() || undefined,
        jobTitle: jobTitle.trim() || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        billingAddress: billingAddress.trim() || undefined,
        postalCode: postalCode.trim() || undefined,
        city: city.trim() || undefined,
        siret: siret.trim() || undefined,
        siren: siren.replace(/\s/g, "") || undefined,
        notes: notes.trim() || undefined,
      };

      if (isEdit && clientId) {
        await updateClient(clientId, payload);
        navigation.goBack();
      } else {
        const created = await createClient(payload);
        navigation.replace("ClientDetail", { clientId: created.id });
      }
    } catch (err) {
      setError(extractErrorMessage(err, "Impossible d'enregistrer le client."));
    } finally {
      setSaving(false);
    }
  }

  if (loadState === "loading") {
    return (
      <ScreenContainer>
        <StateView kind="loading" />
      </ScreenContainer>
    );
  }
  if (loadState === "error") {
    return (
      <ScreenContainer>
        <StateView kind="error" onRetry={load} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer avoidKeyboard style={{ paddingTop: spacing.lg }}>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={[{ paddingBottom: spacing.xxxl }, isDesktopWeb && { maxWidth: 720, width: "100%", alignSelf: "center" }]}>
        <TextField label="Entreprise" placeholder="Entreprise ABC" value={companyName} onChangeText={setCompanyName} />
        <TextField label="Prénom du contact" placeholder="Julie" value={contactFirstName} onChangeText={setContactFirstName} />
        <TextField label="Nom du contact" placeholder="Dupont" value={contactLastName} onChangeText={setContactLastName} />
        <TextField label="Fonction" placeholder="Responsable des locaux" value={jobTitle} onChangeText={setJobTitle} />
        <TextField label="Téléphone" placeholder="06 00 00 00 00" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
        <TextField label="Email" placeholder="contact@entreprise.fr" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
        <TextField label="Adresse de facturation" placeholder="12 rue Exemple" value={billingAddress} onChangeText={setBillingAddress} />
        <TextField label="Code postal" placeholder="75000" value={postalCode} onChangeText={setPostalCode} keyboardType="number-pad" />
        <TextField label="Ville" placeholder="Paris" value={city} onChangeText={setCity} />
        <TextField label="SIRET" placeholder="123 456 789 00012" value={siret} onChangeText={setSiret} keyboardType="number-pad" />
        <TextField label="SIREN (si pas de SIRET)" placeholder="123 456 789" value={siren} onChangeText={setSiren} keyboardType="number-pad" />
        <Text style={[type.footnote, { color: colors.inkTertiary, marginTop: -spacing.xs, marginBottom: spacing.md }]}>
          Obligatoire pour la facture électronique (déduit du SIRET s'il est rempli).
        </Text>
        <TextField label="Notes" placeholder="Informations internes" value={notes} onChangeText={setNotes} multiline numberOfLines={3} />

        {!!error && <Text style={[type.footnote, { color: colors.danger, marginBottom: spacing.md }]}>{error}</Text>}

        <Button label={isEdit ? "Enregistrer les modifications" : "Créer le client"} onPress={handleSave} loading={saving} />
      </ScrollView>
    </ScreenContainer>
  );
}
