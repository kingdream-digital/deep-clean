import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { Redirect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyRound, LockKeyhole } from "lucide-react-native";
import { ApiError } from "@/api/client";
import { useAuth } from "@/auth/AuthProvider";
import { PasswordChecklist, passwordChecks } from "@/features/PasswordChecklist";
import { useTheme } from "@/theme/ThemeProvider";
import { Button, Text, TextField } from "@/ui";

/**
 * Première connexion : le mot de passe temporaire transmis par la RH doit
 * être remplacé avant tout accès (contrôlé aussi par l'API, qui refuse toute
 * autre requête tant que ce n'est pas fait).
 */
export default function FirstLoginScreen() {
  const { colors, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const { status, user, changePassword, logout } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status === "signedOut") return <Redirect href="/connexion" />;
  if (user && !user.mustChangePassword) return <Redirect href="/" />;

  const { checks, valid: passwordOk } = passwordChecks(next, confirm, user ? [user.firstName, user.lastName, user.username] : []);
  const valid = passwordOk && current.length > 0;

  const submit = async () => {
    if (!valid) return;
    setSubmitting(true);
    setError(null);
    try {
      await changePassword(current, next);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? (err.field("currentPassword") ?? err.field("newPassword") ?? err.message)
          : "Le changement a échoué. Réessayez.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "center",
          padding: 24,
          paddingTop: insets.top + 32,
          paddingBottom: insets.bottom + 24,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ width: "100%", maxWidth: 440, alignSelf: "center", gap: 18 }}>
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 18,
              backgroundColor: colors.accentSoft,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <LockKeyhole size={26} color={colors.accentText} />
          </View>
          <View style={{ gap: 6 }}>
            <Text variant="title1" accessibilityRole="header">
              Choisissez votre mot de passe
            </Text>
            <Text variant="callout" tone="secondary">
              {user ? `${user.firstName}, ` : ""}pour sécuriser votre compte, remplacez le mot de passe temporaire reçu de la RH. Personne
              d'autre ne connaîtra le nouveau.
            </Text>
          </View>
          <TextField
            label="Mot de passe temporaire"
            icon={KeyRound}
            value={current}
            onChangeText={setCurrent}
            secureToggle
            autoCapitalize="none"
            autoComplete="current-password"
            testID="first-current"
          />
          <TextField
            label="Nouveau mot de passe"
            value={next}
            onChangeText={setNext}
            secureToggle
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
            testID="first-new"
          />
          <TextField
            label="Confirmez le nouveau mot de passe"
            value={confirm}
            onChangeText={setConfirm}
            secureToggle
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
            onSubmitEditing={submit}
            testID="first-confirm"
          />
          <PasswordChecklist checks={checks} />
          {error ? (
            <View accessibilityRole="alert" style={{ backgroundColor: colors.dangerSoft, borderRadius: radius.md, padding: 14 }}>
              <Text variant="subhead" tone="danger" weight="semibold">
                {error}
              </Text>
            </View>
          ) : null}
          <Button
            label="Enregistrer et continuer"
            size="lg"
            fullWidth
            disabled={!valid}
            loading={submitting}
            onPress={submit}
            testID="first-submit"
          />
          <Button label="Se déconnecter" variant="ghost" onPress={() => void logout()} style={{ alignSelf: "center" }} />
          <Text variant="footnote" tone="tertiary" align="center">
            Pour tout problème de connexion ou de compte, contactez la RH.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
