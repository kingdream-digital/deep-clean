import React, { useState } from "react";
import { KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeIn } from "react-native-reanimated";
import { useTheme } from "../../theme/ThemeProvider";
import { TextField } from "../../components/TextField";
import { Button } from "../../components/Button";
import { Checkbox } from "../../components/Checkbox";
import { SegmentedControl } from "../../components/SegmentedControl";
import { extractErrorMessage } from "../../api/client";
import { PUBLIC_SERVICES, submitQuoteRequest, type PublicService } from "../../api/public.api";
import { COMPANY_CONTACT, PRIVACY_URL } from "../../config/links";
import type { PublicStackParamList } from "../../navigation/RootNavigator";

// Demande de devis sans compte (espace public de l'application). Les
// informations partent dans le module commercial de DEEP CLEAN, qui recontacte
// la personne ; aucun compte n'est créé (les comptes restent créés par la RH).
export function QuoteRequestScreen() {
  const { colors, spacing, radius, type } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<PublicStackParamList>>();

  const [customerType, setCustomerType] = useState<"INDIVIDUAL" | "BUSINESS" | "OWNER">("INDIVIDUAL");
  const [companyName, setCompanyName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [city, setCity] = useState("");
  const [service, setService] = useState<PublicService | null>(null);
  const [message, setMessage] = useState("");
  const [consent, setConsent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  function validate(): string | null {
    if (customerType === "BUSINESS" && !companyName.trim()) return "Indiquez le nom de votre entreprise.";
    if (!firstName.trim() || !lastName.trim()) return "Indiquez votre prénom et votre nom.";
    if (!phone.trim() && !email.trim()) return "Indiquez un téléphone ou un email pour que nous puissions vous répondre.";
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return "Adresse email invalide.";
    if (postalCode.trim() && !/^\d{5}$/.test(postalCode.trim())) return "Code postal invalide (5 chiffres).";
    if (!service) return "Choisissez la prestation souhaitée.";
    if (message.trim().length < 10) return "Décrivez votre besoin en quelques mots.";
    if (!consent) return "Votre accord est nécessaire pour que nous puissions vous recontacter.";
    return null;
  }

  async function handleSubmit() {
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setSending(true);
    try {
      const confirmation = await submitQuoteRequest({
        customerType,
        companyName: customerType === "BUSINESS" ? companyName.trim() : undefined,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        postalCode: postalCode.trim() || undefined,
        city: city.trim() || undefined,
        service: service!,
        message: message.trim(),
        consent: true,
      });
      setSent(confirmation);
    } catch (err) {
      setError(extractErrorMessage(err, "Votre demande n'a pas pu être envoyée. Réessayez ou appelez-nous."));
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <Animated.View
        entering={FadeIn.duration(300)}
        style={{ flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center", padding: spacing.xl }}
      >
        <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.successSoft, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="checkmark" size={38} color={colors.success} />
        </View>
        <Text style={[type.title2, { color: colors.ink, marginTop: spacing.lg, textAlign: "center" }]}>Demande envoyée</Text>
        <Text style={[type.callout, { color: colors.inkSecondary, marginTop: spacing.sm, textAlign: "center" }]}>{sent}</Text>
        <View style={{ alignSelf: "stretch", marginTop: spacing.xl }}>
          <Button label="Retour à la présentation" onPress={() => navigation.navigate("Discover")} />
        </View>
        <Text style={[type.footnote, { color: colors.inkTertiary, marginTop: spacing.lg, textAlign: "center" }]}>
          Une urgence ? Appelez-nous au {COMPANY_CONTACT.phone}.
        </Text>
      </Animated.View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl + insets.bottom }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[type.title2, { color: colors.ink }]}>Demander un devis</Text>
        <Text style={[type.subhead, { color: colors.inkSecondary, marginTop: spacing.xxs, marginBottom: spacing.lg }]}>
          Le devis est gratuit. Décrivez votre besoin : nous revenons vers vous sous 24 à 48 h avec une proposition adaptée.
        </Text>

        <Text style={[type.subhead, { color: colors.inkSecondary, marginBottom: spacing.xxs }]}>Vous êtes</Text>
        <SegmentedControl
          options={[
            { label: "Particulier", value: "INDIVIDUAL" },
            { label: "Professionnel", value: "BUSINESS" },
            { label: "Propriétaire", value: "OWNER" },
          ]}
          value={customerType}
          onChange={setCustomerType}
        />
        <View style={{ height: spacing.md }} />

        {customerType === "BUSINESS" && (
          <TextField label="Entreprise" placeholder="Nom de l'entreprise" value={companyName} onChangeText={setCompanyName} autoComplete="organization" maxLength={120} />
        )}
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <TextField label="Prénom" value={firstName} onChangeText={setFirstName} autoComplete="given-name" textContentType="givenName" maxLength={60} />
          </View>
          <View style={{ flex: 1 }}>
            <TextField label="Nom" value={lastName} onChangeText={setLastName} autoComplete="family-name" textContentType="familyName" maxLength={60} />
          </View>
        </View>
        <TextField label="Téléphone" placeholder="06 12 34 56 78" value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber" maxLength={25} />
        <TextField
          label="Email"
          placeholder="vous@exemple.fr"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
          maxLength={160}
        />
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <View style={{ width: 120 }}>
            <TextField label="Code postal" placeholder="04100" value={postalCode} onChangeText={setPostalCode} keyboardType="number-pad" autoComplete="postal-code" maxLength={5} />
          </View>
          <View style={{ flex: 1 }}>
            <TextField label="Commune" placeholder="Manosque" value={city} onChangeText={setCity} maxLength={80} />
          </View>
        </View>

        <Text style={[type.subhead, { color: colors.inkSecondary, marginBottom: spacing.xs }]}>Quel service vous intéresse ?</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginBottom: spacing.md }} accessibilityRole="radiogroup">
          {PUBLIC_SERVICES.map((item) => {
            const selected = service === item;
            return (
              <Pressable
                key={item}
                onPress={() => setService(item)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                style={{
                  paddingHorizontal: spacing.sm,
                  paddingVertical: 8,
                  borderRadius: radius.pill,
                  borderWidth: 1,
                  borderColor: selected ? colors.accentFill : colors.borderStrong,
                  backgroundColor: selected ? colors.accentFill : colors.backgroundElevated,
                }}
              >
                <Text style={[type.footnote, { color: selected ? colors.onAccent : colors.ink, fontWeight: "600" }]}>{item}</Text>
              </Pressable>
            );
          })}
        </View>

        <TextField
          label="Votre besoin"
          placeholder="Surface, état, disponibilités…"
          value={message}
          onChangeText={setMessage}
          multiline
          numberOfLines={5}
          maxLength={2000}
        />

        <View style={{ marginTop: spacing.xs }}>
          <Checkbox
            label="J'accepte que DEEP CLEAN utilise ces informations pour me recontacter au sujet de ma demande."
            checked={consent}
            onChange={setConsent}
          />
        </View>
        <Pressable onPress={() => void Linking.openURL(PRIVACY_URL)} accessibilityRole="link" style={{ marginTop: spacing.xs, marginBottom: spacing.md }}>
          <Text style={[type.footnote, { color: colors.accentText, fontWeight: "600" }]}>Politique de confidentialité</Text>
        </Pressable>

        {!!error && <Text style={[type.footnote, { color: colors.danger, marginBottom: spacing.md }]}>{error}</Text>}

        <Button label="Envoyer ma demande" icon="paper-plane-outline" size="lg" onPress={() => void handleSubmit()} loading={sending} />
        <Text style={[type.footnote, { color: colors.inkTertiary, marginTop: spacing.md, textAlign: "center" }]}>
          Aucun compte n'est créé : vos coordonnées servent uniquement à vous répondre.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
