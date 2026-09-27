import React from "react";
import { ScrollView, Text, View } from "react-native";
import { ScreenContainer } from "../../components/ScreenContainer";
import { ChangePasswordForm } from "../../components/ChangePasswordForm";
import { LogoMark } from "../../components/LogoMark";
import { useTheme } from "../../theme/ThemeProvider";

// Affiché obligatoirement tant que l'utilisateur utilise le mot de passe temporaire
// fourni par la RH — aucune autre partie de l'application n'est accessible avant.
export function ForcePasswordChangeScreen() {
  const { colors, spacing, type } = useTheme();

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
            C'est votre première connexion. Choisissez un mot de passe personnel avant de continuer.
          </Text>
        </View>

        <ChangePasswordForm submitLabel="Définir mon mot de passe" onSuccess={() => {}} />
      </ScrollView>
    </ScreenContainer>
  );
}
