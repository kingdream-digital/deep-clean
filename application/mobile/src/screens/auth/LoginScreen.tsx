import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInUp } from "react-native-reanimated";
import { LoginHero } from "../../components/LoginHero";
import { TextField } from "../../components/TextField";
import { Checkbox } from "../../components/Checkbox";
import { Button } from "../../components/Button";
import { useTheme } from "../../theme/ThemeProvider";
import { useAuth } from "../../auth/AuthContext";
import { useResponsive } from "../../hooks/useResponsive";
import { extractErrorMessage } from "../../api/client";

export function LoginScreen() {
  const { colors, spacing, type } = useTheme();
  const { login, sessionExpired, endMessage } = useAuth();
  const { isDesktopWeb } = useResponsive();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!username.trim() || !password) {
      setError("Merci de renseigner votre identifiant et votre mot de passe.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await login(username.trim(), password, rememberMe);
    } catch (err) {
      setError(extractErrorMessage(err, "Connexion impossible."));
    } finally {
      setLoading(false);
    }
  }

  const form = (
    <>
      {(!!sessionExpired || !!endMessage) && (
        <View
          style={{
            backgroundColor: colors.warningSoft,
            borderRadius: 12,
            padding: spacing.md,
            marginBottom: spacing.lg,
          }}
        >
          <Text style={[type.footnote, { color: colors.warning }]}>
            {endMessage ?? "Votre session a expiré. Reconnectez-vous pour continuer."}
          </Text>
        </View>
      )}
      <TextField
        label="Identifiant"
        placeholder="jdupont"
        autoCapitalize="none"
        autoComplete="username"
        keyboardType="default"
        value={username}
        onChangeText={setUsername}
      />
      <TextField
        label="Mot de passe"
        placeholder="••••••••••"
        isPassword
        autoCapitalize="none"
        autoComplete="password"
        value={password}
        onChangeText={setPassword}
      />

      <View style={[styles.row, { marginBottom: spacing.lg }]}>
        <Checkbox label="Rester connecté" checked={rememberMe} onChange={setRememberMe} />
      </View>

      {!!error && <Text style={[type.footnote, { color: colors.danger, marginBottom: spacing.md }]}>{error}</Text>}

      <Button label="Se connecter" onPress={handleSubmit} loading={loading} />
    </>
  );

  const helpLine = (
    <Text style={[type.footnote, { color: colors.inkTertiary, textAlign: "center" }]}>
      Pour tout problème de connexion ou de compte, contactez la RH.
    </Text>
  );

  // Ordinateur : visuel de marque animé à gauche, formulaire dans une carte
  // à droite. Téléphone : visuel en haut (sous la barre d'état), formulaire
  // qui glisse en dessous.
  if (isDesktopWeb) {
    return (
      <View style={[styles.desktopWrap, { backgroundColor: colors.background }]}>
        <View style={{ flex: 1.1 }}>
          <LoginHero emblemSize={230} titleWidth={380} pageColor={colors.background} fill />
        </View>
        <View style={[styles.desktopFormSide, { backgroundColor: colors.background }]}>
          <Animated.View
            entering={FadeInUp.duration(600).delay(200)}
            style={[styles.desktopCard, { backgroundColor: colors.backgroundElevated, borderColor: colors.border, shadowColor: colors.shadow }]}
          >
            <Text style={[type.title2, { color: colors.ink }]}>Connexion</Text>
            <Text style={[type.subhead, { color: colors.inkSecondary, marginTop: spacing.xxs, marginBottom: spacing.xl }]}>
              Connectez-vous avec les identifiants fournis par la RH.
            </Text>
            {form}
            <View style={{ marginTop: spacing.xl }}>{helpLine}</View>
          </Animated.View>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1 }} bounces={false}>
        <View style={{ paddingTop: insets.top }}>
          <View style={[StyleSheet.absoluteFill, { backgroundColor: "#1F2D69", bottom: "50%" }]} />
          <LoginHero emblemSize={Math.min(width * 0.4, height * 0.17, 170)} titleWidth={Math.min(width * 0.7, height * 0.36, 290)} pageColor={colors.background} />
        </View>
        <Animated.View entering={FadeInUp.duration(600).delay(300)} style={{ flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.lg + insets.bottom }}>
          <Text style={[type.title2, { color: colors.ink }]}>Connexion</Text>
          <Text style={[type.subhead, { color: colors.inkSecondary, marginTop: spacing.xxs, marginBottom: spacing.lg }]}>
            Connectez-vous avec les identifiants fournis par la RH.
          </Text>
          {form}
          <View style={{ flex: 1, minHeight: spacing.xl }} />
          <View style={styles.footer}>{helpLine}</View>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  // "space-between" laisse le formulaire en haut et le message RH en bas, mais
  // dans le flux flex normal : quand le clavier s'ouvre, KeyboardAvoidingView
  // réduit la hauteur disponible et l'espace entre les deux se resserre au lieu
  // que le message (autrefois en position absolute) ne se superpose au clavier.
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  footer: { paddingTop: 16 },
  desktopWrap: { flex: 1, flexDirection: "row", ...Platform.select({ web: { minHeight: "100vh" as unknown as number } }) },
  desktopFormSide: { flex: 1, alignItems: "center", justifyContent: "center", padding: 48 },
  desktopCard: { width: "100%", maxWidth: 400, borderRadius: 20, borderWidth: 1, padding: 36, shadowOpacity: 0.5, shadowRadius: 24, shadowOffset: { width: 0, height: 12 } },
});
