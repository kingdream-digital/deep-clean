import React, { useEffect, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import { Button } from "./Button";
import { TextField } from "./TextField";

interface DeleteAccountModalProps {
  visible: boolean;
  loading?: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: (password: string) => void;
}

// Suppression de son compte depuis l'application (règle App Store 5.1.1(v)) :
// ce qui se passe est dit clairement avant de confirmer avec le mot de passe.
export function DeleteAccountModal({ visible, loading = false, error, onCancel, onConfirm }: DeleteAccountModalProps) {
  const { colors, spacing, radius, type } = useTheme();
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (visible) setPassword("");
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <Pressable onPress={onCancel} style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: "center", padding: spacing.lg }} accessibilityLabel="Fermer">
          <Pressable
            onPress={() => undefined}
            style={{ backgroundColor: colors.backgroundElevated, borderRadius: radius.xl, padding: spacing.lg, width: "100%", maxWidth: 480, alignSelf: "center", maxHeight: "90%" }}
          >
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={[type.title3, { color: colors.ink }]}>Supprimer mon compte</Text>
              <Text style={[type.callout, { color: colors.inkSecondary, marginTop: spacing.sm, lineHeight: 21 }]}>
                Votre compte sera désactivé immédiatement : vous serez déconnecté de tous vos appareils et ne recevrez plus de
                notifications.{"\n\n"}La RH effacera ensuite vos données sous un mois, sauf celles que la loi impose à
                l'employeur de conserver (heures travaillées, pointages, congés, documents de paie), gardées pendant la durée
                légale seulement.
              </Text>
              <View style={{ marginTop: spacing.md }}>
                <TextField
                  label="Mot de passe"
                  placeholder="Confirmez avec votre mot de passe"
                  isPassword
                  autoCapitalize="none"
                  autoComplete="password"
                  value={password}
                  onChangeText={setPassword}
                  error={error ?? undefined}
                />
              </View>
              <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <Button label="Annuler" variant="secondary" onPress={onCancel} />
                </View>
                <View style={{ flex: 1 }}>
                  <Button label="Supprimer" variant="destructive" loading={loading} disabled={!password} onPress={() => onConfirm(password)} />
                </View>
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
