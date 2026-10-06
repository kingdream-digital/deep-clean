import React, { useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { Alert } from "../../utils/alert";
import { ScreenContainer } from "../../components/ScreenContainer";
import { LogoHalo } from "../../components/LogoHalo";
import { TextField } from "../../components/TextField";
import { Checkbox } from "../../components/Checkbox";
import { Button } from "../../components/Button";
import { LogoMark } from "../../components/LogoMark";
import { useTheme } from "../../theme/ThemeProvider";
import { useAuth } from "../../auth/AuthContext";
import { useResponsive } from "../../hooks/useResponsive";
import { extractErrorMessage } from "../../api/client";
import { biometricLabel, getAvailableBiometricKind } from "../../auth/biometrics";

export function LoginScreen() {
  const { colors, spacing, type } = useTheme();
  const { login, sessionExpired, status, biometricEnabled, enableBiometricLogin } = useAuth();
  const { isDesktopWeb } = useResponsive();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function offerBiometricEnrollment() {
    // Ne propose jamais sans "Rester connecté" (rien à déverrouiller plus
    // tard) — vérifié aussi côté contexte (enableBiometricLogin), mais
    // inutile de montrer la question dans ce cas. Ne reprend pas non plus si
    // c'est déjà activé (ex. même compte reconnecté au mot de passe depuis
    // l'écran de déverrouillage : login() a alors conservé le réglage).
    if (!rememberMe || biometricEnabled) return;
    const kind = await getAvailableBiometricKind();
    if (!kind) return;
    const label = biometricLabel(kind);
    Alert.alert(`Activer ${label} ?`, "Retrouvez votre compte plus vite la prochaine fois, sans ressaisir votre mot de passe.", [
      { text: "Plus tard", style: "cancel" },
      { text: "Activer", onPress: () => void enableBiometricLogin() },
    ]);
  }

  async function handleSubmit() {
    if (!username.trim() || !password) {
      setError("Merci de renseigner votre identifiant et votre mot de passe.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await login(username.trim(), password, rememberMe);
      await offerBiometricEnrollment();
    } catch (err) {
      setError(extractErrorMessage(err, "Connexion impossible."));
    } finally {
      setLoading(false);
    }
  }

  // Session persistée ("Rester connecté") + déverrouillage biométrique
  // activé : on propose Face ID/Touch ID au lieu du formulaire, jamais une
  // alternative au mot de passe — juste un raccourci vers la session déjà
  // ouverte (voir AuthContext.unlockWithBiometrics).
  if (status === "locked") {
    return <BiometricUnlockPanel />;
  }

  const form = (
    <>
      {sessionExpired && (
        <View
          style={{
            backgroundColor: colors.warningSoft,
            borderRadius: 12,
            padding: spacing.md,
            marginBottom: spacing.lg,
          }}
        >
          <Text style={[type.footnote, { color: colors.warning }]}>
            Votre session a expiré. Reconnectez-vous pour continuer.
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

      {error && <Text style={[type.footnote, { color: colors.danger, marginBottom: spacing.md }]}>{error}</Text>}

      <Button label="Se connecter" onPress={handleSubmit} loading={loading} />
    </>
  );

  const helpLine = (
    <Text style={[type.footnote, { color: colors.inkTertiary, textAlign: "center" }]}>
      Pour tout problème de connexion ou de compte, contactez la RH.
    </Text>
  );

  // Panneau desktop web : hero de marque à gauche, formulaire dans une carte
  // centrée à droite — le formulaire mobile (colonne unique, centré verticalement)
  // n'est jamais rendu dans cette branche, et inversement, donc aucun changement
  // pour l'app mobile.
  if (isDesktopWeb) {
    return (
      <View style={styles.desktopWrap}>
        <LinearGradient
          colors={colors.accentGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.desktopHero}
        >
          <View style={{ maxWidth: 420 }}>
            <LogoMark size={48} variant="white" />
            <Text style={[type.largeTitle, { color: colors.onAccent, marginTop: spacing.xl }]}>Deep Clean</Text>
            <Text style={[type.title3, { color: "rgba(255,255,255,0.85)", marginTop: spacing.sm }]}>
              Le panel de pilotage de vos chantiers, de vos équipes et de vos plannings.
            </Text>
          </View>
        </LinearGradient>

        <View style={[styles.desktopFormSide, { backgroundColor: colors.background }]}>
          <View style={[styles.desktopCard, { backgroundColor: colors.backgroundElevated, borderColor: colors.border, shadowColor: colors.shadow }]}>
            <Text style={[type.title2, { color: colors.ink }]}>Connexion</Text>
            <Text style={[type.subhead, { color: colors.inkSecondary, marginTop: spacing.xxs, marginBottom: spacing.xl }]}>
              Connectez-vous avec les identifiants fournis par la RH.
            </Text>
            {form}
            <View style={{ marginTop: spacing.xl }}>{helpLine}</View>
          </View>
        </View>
      </View>
    );
  }

  return (
    <ScreenContainer noHeader avoidKeyboard gradient style={styles.container}>
      <View>
        <View style={styles.brand}>
          <LogoHalo />
          <LogoMark size={56} />
          <Text style={[type.title2, { color: colors.ink, marginTop: spacing.md }]}>Deep Clean</Text>
          <Text style={[type.subhead, { color: colors.inkSecondary, marginTop: spacing.xxs }]}>
            Connectez-vous avec les identifiants fournis par la RH.
          </Text>
        </View>

        <View style={{ marginTop: spacing.xxl }}>{form}</View>
      </View>

      <View style={styles.footer}>{helpLine}</View>
    </ScreenContainer>
  );
}

// Écran de déverrouillage (status === "locked") : propose Face ID/Touch ID/
// empreinte pour rejouer la session déjà persistée, avec un repli explicite
// vers le mot de passe — jamais l'inverse, jamais de bascule automatique
// silencieuse vers le mot de passe en cas d'échec répété.
function BiometricUnlockPanel() {
  const { colors, spacing, type } = useTheme();
  const { lockedUsername, biometricKind, unlockWithBiometrics, useFallbackPassword } = useAuth();
  const [unlocking, setUnlocking] = useState(false);
  const [failed, setFailed] = useState(false);

  const label = biometricLabel(biometricKind);
  const icon: keyof typeof Ionicons.glyphMap = biometricKind === "faceId" ? "scan-outline" : "finger-print-outline";

  async function attemptUnlock() {
    setUnlocking(true);
    setFailed(false);
    try {
      const ok = await unlockWithBiometrics();
      if (!ok) setFailed(true);
    } finally {
      setUnlocking(false);
    }
  }

  // Propose Face ID/Touch ID dès l'arrivée sur l'écran, comme les apps
  // bancaires/de messagerie — un bouton reste disponible pour réessayer ou
  // en cas de refus du système au premier appel.
  useEffect(() => {
    void attemptUnlock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ScreenContainer noHeader gradient style={styles.container}>
      <View>
        <View style={styles.brand}>
          <LogoHalo />
          <LogoMark size={56} />
          <Text style={[type.title2, { color: colors.ink, marginTop: spacing.md }]}>
            {lockedUsername ? `Bon retour, ${lockedUsername}` : "Bon retour"}
          </Text>
          <Text style={[type.subhead, { color: colors.inkSecondary, marginTop: spacing.xxs, textAlign: "center" }]}>
            Déverrouillez avec {label} pour retrouver votre session.
          </Text>
        </View>

        <View style={{ alignItems: "center", marginTop: spacing.xxl }}>
          <Pressable
            onPress={attemptUnlock}
            disabled={unlocking}
            accessibilityLabel={`Déverrouiller avec ${label}`}
            style={[styles.unlockCircle, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}
          >
            <Ionicons name={icon} size={40} color={colors.accent} />
          </Pressable>

          {failed && !unlocking && (
            <Text style={[type.footnote, { color: colors.danger, marginTop: spacing.lg, textAlign: "center" }]}>
              Échec de la reconnaissance. Appuyez pour réessayer.
            </Text>
          )}

          <View style={{ marginTop: spacing.xxl }}>
            <Button label={`Déverrouiller avec ${label}`} onPress={attemptUnlock} loading={unlocking} />
          </View>

          <Pressable onPress={useFallbackPassword} style={{ marginTop: spacing.lg }}>
            <Text style={[type.footnote, { color: colors.accent, fontWeight: "600" }]}>
              Se connecter avec mon mot de passe
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.footer}>
        <Text style={[type.footnote, { color: colors.inkTertiary, textAlign: "center" }]}>
          Pour tout problème de connexion ou de compte, contactez la RH.
        </Text>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  // "space-between" laisse le formulaire en haut et le message RH en bas, mais
  // dans le flux flex normal : quand le clavier s'ouvre, KeyboardAvoidingView
  // réduit la hauteur disponible et l'espace entre les deux se resserre au lieu
  // que le message (autrefois en position absolute) ne se superpose au clavier.
  container: { justifyContent: "space-between", paddingVertical: 24 },
  brand: { alignItems: "center" },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  footer: { paddingTop: 16 },
  desktopWrap: { flex: 1, flexDirection: "row", ...Platform.select({ web: { minHeight: "100vh" as unknown as number } }) },
  desktopHero: { flex: 1, alignItems: "center", justifyContent: "center", padding: 64 },
  desktopFormSide: { flex: 1, alignItems: "center", justifyContent: "center", padding: 48 },
  desktopCard: { width: "100%", maxWidth: 400, borderRadius: 20, borderWidth: 1, padding: 36, shadowOpacity: 0.5, shadowRadius: 24, shadowOffset: { width: 0, height: 12 } },
  unlockCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
});
