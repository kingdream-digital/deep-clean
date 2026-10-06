import React from "react";
import { ScrollView, Text, View } from "react-native";
import { ScreenContainer } from "../../components/ScreenContainer";
import { ChangePasswordForm } from "../../components/ChangePasswordForm";
import { LogoMark } from "../../components/LogoMark";
import { useTheme } from "../../theme/ThemeProvider";
import { useAuth } from "../../auth/AuthContext";
import { PressableScale } from "../../components/PressableScale";

// Affiché obligatoirement tant que l'utilisateur utilise le mot de passe temporaire
// fourni par la RH — aucune autre partie de l'application n'est accessible avant.
export function ForcePasswordChangeScreen() {
  const { colors, spacing, type } = useTheme();
  const { logout } = useAuth();

  return (
    <ScreenContainer noHeader avoidKeyboard>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={{ alignItems: "center", marginTop: spacing.xxl, marginBottom: spacing.xxl }}>
          <LogoMark size={48} />
          <Text style={[type.title2, { color: colors.ink, marginTop: spacing.md, textAlign: "center" }]}>
            Définissez votre mot de passe
          </Text>
          <Text
            style={[
              type.subhead,
              { color: colors.inkSecondary, marginTop: spacing.xxs, textAlign: "center" },
            ]}
          >
            Vous vous connectez avec un mot de passe temporaire donné par la RH. Choisissez votre mot de passe personnel avant de continuer.
          </Text>
        </View>

        <ChangePasswordForm submitLabel="Définir mon mot de passe" onSuccess={() => {}} />

        {/* Mauvais compte ou identifiants : une issue, et le bon contact. */}
        <Text style={[type.footnote, { color: colors.inkTertiary, textAlign: "center", marginTop: spacing.lg }]}>
          Pour tout problème de connexion ou de compte, contactez la RH.
        </Text>
        <PressableScale onPress={() => void logout()} style={{ alignSelf: "center", marginTop: spacing.sm, padding: spacing.xs }}>
          <Text style={[type.footnote, { color: colors.accentText, fontWeight: "600" }]}>Se déconnecter</Text>
        </PressableScale>
      </ScrollView>
    </ScreenContainer>
  );
}
