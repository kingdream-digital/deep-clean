import React, { useEffect, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, Text, View } from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import { Button } from "./Button";
import { TextField } from "./TextField";

interface ReasonPromptModalProps {
  visible: boolean;
  title: string;
  subtitle?: string;
  label?: string;
  placeholder?: string;
  confirmLabel: string;
  /** Motif obligatoire (sinon facultatif). */
  required?: boolean;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}

// Fenêtre de saisie d'un motif (refus d'une absence…) — Alert.alert ne permet
// pas de saisir du texte, sur le web comme sur téléphone.
export function ReasonPromptModal({
  visible,
  title,
  subtitle,
  label = "Motif",
  placeholder,
  confirmLabel,
  required = false,
  loading = false,
  onCancel,
  onConfirm,
}: ReasonPromptModalProps) {
  const { colors, spacing, radius, type } = useTheme();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setReason("");
      setError(null);
    }
  }, [visible]);

  function confirm() {
    if (required && !reason.trim()) {
      setError("Indiquez le motif : il sera transmis à la personne concernée.");
      return;
    }
    onConfirm(reason.trim());
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <Pressable onPress={onCancel} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: spacing.lg }}>
          <Pressable
            onPress={() => undefined}
            style={{ backgroundColor: colors.backgroundElevated, borderRadius: radius.xl, padding: spacing.lg, width: "100%", maxWidth: 480, alignSelf: "center" }}
          >
            <Text style={[type.title3, { color: colors.ink }]}>{title}</Text>
            {!!subtitle && <Text style={[type.footnote, { color: colors.inkSecondary, marginTop: spacing.xxs }]}>{subtitle}</Text>}
            <View style={{ marginTop: spacing.md }}>
              <TextField
                label={required ? label : `${label} (facultatif)`}
                placeholder={placeholder}
                value={reason}
                onChangeText={(t) => {
                  setReason(t);
                  setError(null);
                }}
                multiline
                numberOfLines={3}
                error={error ?? undefined}
                autoFocus
              />
            </View>
            <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm }}>
              <View style={{ flex: 1 }}>
                <Button label="Annuler" variant="secondary" onPress={onCancel} />
              </View>
              <View style={{ flex: 1 }}>
                <Button label={confirmLabel} variant="destructive" loading={loading} onPress={confirm} />
              </View>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
