import React, { useState } from "react";
import { Text, View } from "react-native";
import { TextField } from "./TextField";
import { Button } from "./Button";
import { useTheme } from "../theme/ThemeProvider";
import { useAuth } from "../auth/AuthContext";
import { useResponsive } from "../hooks/useResponsive";
import { extractErrorMessage } from "../api/client";

// Politique affichée côté client pour guider l'utilisateur — la seule validation
// qui fait foi reste celle appliquée par le serveur (voir backend/src/utils/password.ts).
const POLICY_HINT = "Au moins 10 caractères, une majuscule, une minuscule, un chiffre et un caractère spécial.";

interface ChangePasswordFormProps {
  onSuccess: () => void;
  submitLabel?: string;
}

export function ChangePasswordForm({ onSuccess, submitLabel = "Enregistrer" }: ChangePasswordFormProps) {
  const { colors, spacing, type } = useTheme();
  const { changePassword } = useAuth();
  const { isDesktopWeb } = useResponsive();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    if (!currentPassword || !newPassword || !confirmPassword) {
      setError("Merci de remplir tous les champs.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Les deux mots de passe ne correspondent pas.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await changePassword(currentPassword, newPassword);
      onSuccess();
    } catch (err) {
      setError(extractErrorMessage(err, "Impossible de mettre à jour le mot de passe."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={isDesktopWeb ? { maxWidth: 640, width: "100%", alignSelf: "center" } : undefined}>
      <TextField
        label="Mot de passe actuel"
        isPassword
        autoCapitalize="none"
        value={currentPassword}
        onChangeText={setCurrentPassword}
      />
      <TextField
        label="Nouveau mot de passe"
        isPassword
        autoCapitalize="none"
        value={newPassword}
        onChangeText={setNewPassword}
      />
      <TextField
        label="Confirmer le nouveau mot de passe"
        isPassword
        autoCapitalize="none"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
      />

      <Text style={[type.footnote, { color: colors.inkTertiary, marginBottom: spacing.md }]}>
        {POLICY_HINT}
      </Text>

      {error && <Text style={[type.footnote, { color: colors.danger, marginBottom: spacing.md }]}>{error}</Text>}

      <Button label={submitLabel} onPress={handleSubmit} loading={loading} />
    </View>
  );
}
