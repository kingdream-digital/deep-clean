import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Switch, TextInput, View } from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AudioLines, Building2, CalendarCheck, KeyRound, LifeBuoy, ShieldCheck, UserRound } from "lucide-react-native";
import { BRAND, loginSchema } from "@aussitot/shared";
import { ApiError } from "@/api/client";
import { useAuth } from "@/auth/AuthProvider";
import { useBreakpoint, useTheme } from "@/theme/ThemeProvider";
import { Button, LogoMark, PressableScale, Text, TextField, Wordmark } from "@/ui";

const ACCOUNT_HELP = "Pour tout problème de connexion ou de compte, contactez la RH.";

/**
 * Connexion. Pas de création de compte ici : les comptes sont créés par la
 * RH (ou l'administrateur) de l'entreprise, qui transmet un identifiant et un
 * mot de passe temporaire à changer à la première connexion.
 */
export default function LoginScreen() {
  const { colors, radius } = useTheme();
  const { isWide } = useBreakpoint();
  const insets = useSafeAreaInsets();
  const { login, lastOrganization } = useAuth();
  const [organization, setOrganization] = useState(lastOrganization ?? "");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | undefined>>({});
  const [showHelp, setShowHelp] = useState(false);
  const identifierRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  useEffect(() => {
    if (lastOrganization && !organization) setOrganization(lastOrganization);
  }, [lastOrganization, organization]);

  const submit = async () => {
    setError(null);
    const parsed = loginSchema.safeParse({ organization, identifier, password, rememberMe });
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) errors[String(issue.path[0])] ??= issue.message;
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    setSubmitting(true);
    try {
      await login({ organization, identifier, password, rememberMe });
      // La redirection (accueil ou changement du mot de passe temporaire) suit le changement de session.
    } catch (err) {
      setPassword("");
      if (err instanceof ApiError) {
        setError(err.code === "NETWORK" ? "Pas de connexion internet. Vérifiez votre réseau et réessayez." : err.message);
      } else {
        setError("La connexion a échoué. Réessayez dans un instant.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const form = (
    <Animated.View entering={FadeInDown.duration(320)} style={{ width: "100%", maxWidth: 420, alignSelf: "center", gap: 18 }}>
      {!isWide ? (
        <View style={{ gap: 18, marginBottom: 10 }}>
          <LogoMark size={56} />
          <View style={{ gap: 6 }}>
            <Text variant="title1" accessibilityRole="header">
              Bienvenue
            </Text>
            <Text variant="callout" tone="secondary">
              Connectez-vous avec les identifiants transmis par votre entreprise.
            </Text>
          </View>
        </View>
      ) : (
        <View style={{ gap: 6, marginBottom: 8 }}>
          <Text variant="title1" accessibilityRole="header">
            Connexion
          </Text>
          <Text variant="callout" tone="secondary">
            Avec les identifiants transmis par votre entreprise.
          </Text>
        </View>
      )}

      <TextField
        label="Code entreprise"
        icon={Building2}
        value={organization}
        onChangeText={setOrganization}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="organization"
        placeholder="ex. : deep-clean"
        returnKeyType="next"
        onSubmitEditing={() => identifierRef.current?.focus()}
        error={fieldErrors.organization}
        testID="login-organization"
      />
      <TextField
        ref={identifierRef}
        label="Identifiant ou email"
        icon={UserRound}
        value={identifier}
        onChangeText={setIdentifier}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="username"
        textContentType="username"
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
        error={fieldErrors.identifier}
        testID="login-identifier"
      />
      <TextField
        ref={passwordRef}
        label="Mot de passe"
        icon={KeyRound}
        value={password}
        onChangeText={setPassword}
        secureToggle
        autoCapitalize="none"
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={submit}
        error={fieldErrors.password}
        testID="login-password"
      />

      <PressableScale
        onPress={() => setRememberMe((v) => !v)}
        scaleTo={1}
        haptic="selection"
        accessibilityRole="switch"
        accessibilityState={{ checked: rememberMe }}
        accessibilityLabel="Rester connecté"
        style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 4 }}
      >
        <View style={{ flex: 1 }}>
          <Text variant="callout" weight="medium">
            Rester connecté
          </Text>
          <Text variant="footnote" tone="tertiary">
            {rememberMe ? "Session gardée de façon sécurisée sur cet appareil." : "Vous devrez vous reconnecter à la fermeture."}
          </Text>
        </View>
        <Switch
          value={rememberMe}
          onValueChange={setRememberMe}
          trackColor={{ true: colors.accentFill, false: colors.borderStrong }}
          thumbColor="#FFFFFF"
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      </PressableScale>

      {error ? (
        <Animated.View entering={FadeIn.duration(180)} accessibilityRole="alert" accessibilityLiveRegion="assertive" style={{ backgroundColor: colors.dangerSoft, borderRadius: radius.md, padding: 14, gap: 4 }}>
          <Text variant="subhead" tone="danger" weight="semibold">
            {error}
          </Text>
          <Text variant="footnote" tone="danger">
            {ACCOUNT_HELP}
          </Text>
        </Animated.View>
      ) : null}

      <Button label="Se connecter" size="lg" fullWidth loading={submitting} onPress={submit} testID="login-submit" />

      <PressableScale
        onPress={() => setShowHelp((v) => !v)}
        scaleTo={1}
        accessibilityState={{ expanded: showHelp }}
        style={{ alignSelf: "center", paddingVertical: 8, paddingHorizontal: 12, borderRadius: radius.sm }}
        pressedStyle={{ backgroundColor: colors.surfacePressed }}
      >
        <Text variant="subhead" tone="accent" weight="medium">
          Mot de passe oublié ou compte bloqué ?
        </Text>
      </PressableScale>
      {showHelp ? (
        <Animated.View entering={FadeInDown.duration(200)} style={{ flexDirection: "row", gap: 12, backgroundColor: colors.surfaceMuted, borderRadius: radius.md, padding: 14 }}>
          <LifeBuoy size={20} color={colors.accentText} />
          <Text variant="subhead" tone="secondary" style={{ flex: 1 }}>
            {ACCOUNT_HELP} Elle peut réinitialiser votre accès sans jamais connaître votre mot de passe.
          </Text>
        </Animated.View>
      ) : null}
    </Animated.View>
  );

  const footer = (
    <Text variant="footnote" tone="tertiary" align="center" style={{ marginTop: 28 }}>
      {ACCOUNT_HELP}
    </Text>
  );

  if (isWide) {
    return (
      <View style={{ flex: 1, flexDirection: "row", backgroundColor: colors.bg }}>
        <LinearGradient colors={["#1B33C7", "#3B5BFF", "#5B3FF0"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1.05, padding: 56, justifyContent: "space-between" }}>
          <Wordmark size={24} inverse />
          <View style={{ gap: 28, maxWidth: 520 }}>
            <Text style={{ color: "#FFFFFF", fontSize: 46, lineHeight: 52, letterSpacing: -1.4 }} weight="bold">
              {BRAND.tagline}
            </Text>
            <Text variant="title3" style={{ color: "rgba(255,255,255,0.86)" }} weight="regular">
              Devis, factures, planning et équipe : dites-le, c'est fait. À la voix ou par écrit, depuis le chantier ou le bureau.
            </Text>
            <View style={{ gap: 16 }}>
              {[
                { icon: AudioLines, text: "« Fais un devis pour la boulangerie Martin » : prêt en quelques secondes" },
                { icon: CalendarCheck, text: "Planning et missions à jour en temps réel pour toute l'équipe" },
                { icon: ShieldCheck, text: "Rien n'est envoyé à un client sans votre confirmation" },
              ].map(({ icon: Icon, text }) => (
                <View key={text} style={{ flexDirection: "row", gap: 14, alignItems: "center" }}>
                  <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.14)", alignItems: "center", justifyContent: "center" }}>
                    <Icon size={20} color="#FFFFFF" />
                  </View>
                  <Text variant="callout" style={{ color: "#FFFFFF", flex: 1 }}>
                    {text}
                  </Text>
                </View>
              ))}
            </View>
          </View>
          <Text variant="footnote" style={{ color: "rgba(255,255,255,0.7)" }}>
            © {new Date().getFullYear()} {BRAND.name}
          </Text>
        </LinearGradient>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 48 }} keyboardShouldPersistTaps="handled">
          {form}
          {footer}
        </ScrollView>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: "center", paddingHorizontal: 24, paddingTop: insets.top + 32, paddingBottom: insets.bottom + 24 }}
        keyboardShouldPersistTaps="handled"
      >
        {form}
        {footer}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
