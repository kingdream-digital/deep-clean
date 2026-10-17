import React, { useState } from "react";
import { Image, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
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
import { PRIVACY_URL } from "../../config/links";
import type { PublicStackParamList } from "../../navigation/RootNavigator";
import { SERVICE_SHEETS } from "./publicContent";

// Demande de devis sans compte (accueil public de l'application) : le service,
// une description si on veut, de quoi être recontacté — et c'est parti. La
// demande arrive dans les prospects du module commercial (la Direction, la RH
// et l'admin technique en sont notifiés) ; aucun compte n'est créé (les
// comptes restent créés par la RH).
export function QuoteRequestScreen() {
  const { colors, spacing, radius, type } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<PublicStackParamList>>();
  const route = useRoute<RouteProp<PublicStackParamList, "QuoteRequest">>();

  // Service déjà choisi quand on vient de sa page.
  const [service, setService] = useState<PublicService | null>(route.params?.service ?? null);
  const [choosing, setChoosing] = useState(!route.params?.service);
  const [customerType, setCustomerType] = useState<"INDIVIDUAL" | "BUSINESS" | "OWNER">(route.params?.customerType ?? "INDIVIDUAL");
  const [message, setMessage] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [city, setCity] = useState("");
  const [consent, setConsent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  const sheet = SERVICE_SHEETS.find((s) => s.service === service);

  function validate(): string | null {
    if (!service) return "Choisissez le service souhaité.";
    if (customerType === "BUSINESS" && !companyName.trim()) return "Indiquez le nom de votre entreprise.";
    if (!firstName.trim() || !lastName.trim()) return "Indiquez votre prénom et votre nom.";
    if (!phone.trim() && !email.trim()) return "Indiquez un téléphone ou un email pour que nous puissions vous répondre.";
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return "Adresse email invalide.";
    if (postalCode.trim() && !/^\d{5}$/.test(postalCode.trim())) return "Code postal invalide (5 chiffres).";
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
        message: message.trim() || undefined,
        consent: true,
      });
      setSent(confirmation);
    } catch (err) {
      setError(extractErrorMessage(err, "Votre demande n'a pas pu être envoyée. Réessayez dans un instant."));
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <Animated.View entering={FadeIn.duration(300)} style={{ flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center", padding: spacing.xl }}>
        <View style={{ width: 76, height: 76, borderRadius: 38, backgroundColor: colors.successSoft, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="checkmark" size={40} color={colors.success} />
        </View>
        <Text style={[type.title2, { color: colors.ink, marginTop: spacing.lg, textAlign: "center" }]}>Demande envoyée</Text>
        <Text style={[type.callout, { color: colors.inkSecondary, marginTop: spacing.sm, textAlign: "center" }]}>{sent}</Text>
        <View style={{ alignSelf: "stretch", marginTop: spacing.xl }}>
          <Button label="Retour à l'accueil" onPress={() => navigation.navigate("PublicHome", undefined, { pop: true })} />
        </View>
      </Animated.View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl + insets.bottom }} showsVerticalScrollIndicator={false}>
        <Text style={[type.title2, { color: colors.ink }]}>Votre devis gratuit</Text>
        <Text style={[type.subhead, { color: colors.inkSecondary, marginTop: spacing.xxs, marginBottom: spacing.lg }]}>
          Quelques informations suffisent : nous revenons vers vous sous 24 à 48 h.
        </Text>

        {/* 1. Le service */}
        <Step number={1} label="Le service" />
        {service && !choosing ? (
          <Pressable
            onPress={() => setChoosing(true)}
            accessibilityRole="button"
            accessibilityHint="Changer de service"
            style={{ flexDirection: "row", alignItems: "center", padding: spacing.sm, borderRadius: radius.lg, backgroundColor: colors.backgroundElevated, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.lg }}
          >
            {sheet ? (
              <Image source={sheet.image} style={{ width: 52, height: 52, borderRadius: 14 }} resizeMode="cover" accessibilityIgnoresInvertColors />
            ) : (
              <View style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="sparkles-outline" size={22} color={colors.accentText} />
              </View>
            )}
            <View style={{ flex: 1, marginLeft: spacing.sm }}>
              <Text style={[type.headline, { color: colors.ink }]}>{sheet?.title ?? service}</Text>
              <Text style={[type.footnote, { color: colors.inkSecondary }]}>{sheet?.short ?? "Nous en parlerons ensemble"}</Text>
            </View>
            <Text style={[type.footnote, { color: colors.accentText, fontWeight: "600" }]}>Changer</Text>
          </Pressable>
        ) : (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginBottom: spacing.lg }} accessibilityRole="radiogroup">
            {PUBLIC_SERVICES.map((item) => {
              const selected = service === item;
              return (
                <Pressable
                  key={item}
                  onPress={() => {
                    setService(item);
                    setChoosing(false);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  style={{
                    paddingHorizontal: spacing.sm,
                    paddingVertical: 9,
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
        )}

        {/* 2. Le besoin */}
        <Step number={2} label="Votre besoin" />
        <SegmentedControl
          options={[
            { label: "Particulier", value: "INDIVIDUAL" },
            { label: "Professionnel", value: "BUSINESS" },
            { label: "Propriétaire", value: "OWNER" },
          ]}
          value={customerType}
          onChange={setCustomerType}
        />
        <View style={{ height: spacing.sm }} />
        <TextField label="Description (facultatif)" placeholder="Surface, état, disponibilités…" value={message} onChangeText={setMessage} multiline numberOfLines={4} maxLength={2000} />

        {/* 3. Les coordonnées */}
        <Step number={3} label="Pour vous répondre" />
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

        <View style={{ marginTop: spacing.xs }}>
          <Checkbox label="J'accepte que DEEP CLEAN utilise ces informations pour me recontacter au sujet de ma demande." checked={consent} onChange={setConsent} />
        </View>

        {!!error && <Text style={[type.footnote, { color: colors.danger, marginTop: spacing.md }]}>{error}</Text>}

        <View style={{ marginTop: spacing.lg }}>
          <Button label="Envoyer ma demande" icon="paper-plane-outline" size="lg" onPress={() => void handleSubmit()} loading={sending} />
        </View>
        <Text style={[type.footnote, { color: colors.inkTertiary, marginTop: spacing.md, textAlign: "center" }]}>
          Aucun compte n'est créé : vos coordonnées servent uniquement à vous répondre.
        </Text>
        <View style={{ flexDirection: "row", justifyContent: "center", gap: spacing.md, marginTop: spacing.xs }}>
          <Pressable onPress={() => void Linking.openURL(PRIVACY_URL)} accessibilityRole="link" hitSlop={6}>
            <Text style={[type.footnote, { color: colors.accentText, fontWeight: "600" }]}>Confidentialité</Text>
          </Pressable>
          <Pressable onPress={() => navigation.navigate("Legal")} accessibilityRole="link" hitSlop={6}>
            <Text style={[type.footnote, { color: colors.accentText, fontWeight: "600" }]}>Mentions légales</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Step({ number, label }: { number: number; label: string }) {
  const { colors, spacing, type } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", marginBottom: spacing.sm }}>
      <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colors.accentFill, alignItems: "center", justifyContent: "center" }}>
        <Text style={[type.caption, { color: colors.onAccent, fontWeight: "700" }]}>{number}</Text>
      </View>
      <Text style={[type.headline, { color: colors.ink, marginLeft: spacing.xs }]} accessibilityRole="header">
        {label}
      </Text>
    </View>
  );
}
