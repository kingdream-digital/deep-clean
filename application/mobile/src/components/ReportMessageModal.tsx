import React, { useEffect, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeProvider";
import { Button } from "./Button";
import { TextField } from "./TextField";
import type { MessageReportReason } from "../api/messages.api";

const REASONS: { value: MessageReportReason; label: string }[] = [
  { value: "HARASSMENT", label: "Harcèlement ou menaces" },
  { value: "INSULT", label: "Propos injurieux ou discriminatoires" },
  { value: "INAPPROPRIATE", label: "Contenu inapproprié" },
  { value: "SPAM", label: "Message indésirable" },
  { value: "OTHER", label: "Autre motif" },
];

interface ReportMessageModalProps {
  visible: boolean;
  senderName: string;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: (reason: MessageReportReason, comment: string) => void;
}

// Signalement d'un message à la RH (règle App Store 1.2). Fenêtre plutôt
// qu'Alert : Android n'affiche jamais plus de trois boutons dans une alerte.
export function ReportMessageModal({ visible, senderName, loading = false, onCancel, onConfirm }: ReportMessageModalProps) {
  const { colors, spacing, radius, type } = useTheme();
  const [reason, setReason] = useState<MessageReportReason | null>(null);
  const [comment, setComment] = useState("");

  useEffect(() => {
    if (visible) {
      setReason(null);
      setComment("");
    }
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <Pressable
          onPress={onCancel}
          style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: "center", padding: spacing.lg }}
          accessibilityLabel="Fermer"
        >
          <Pressable
            onPress={() => undefined}
            style={{ backgroundColor: colors.backgroundElevated, borderRadius: radius.xl, padding: spacing.lg, width: "100%", maxWidth: 480, alignSelf: "center", maxHeight: "90%" }}
          >
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={[type.title3, { color: colors.ink }]}>Signaler ce message</Text>
              <Text style={[type.footnote, { color: colors.inkSecondary, marginTop: spacing.xxs }]}>
                Message de {senderName}. La RH est prévenue aussitôt et peut intervenir ; l'auteur n'est pas informé de votre signalement.
              </Text>

              <View style={{ marginTop: spacing.md }} accessibilityRole="radiogroup">
                {REASONS.map((item) => {
                  const selected = reason === item.value;
                  return (
                    <Pressable
                      key={item.value}
                      onPress={() => setReason(item.value)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        paddingVertical: spacing.sm,
                        paddingHorizontal: spacing.sm,
                        marginBottom: spacing.xxs,
                        borderRadius: radius.md,
                        backgroundColor: selected ? colors.accentSoft : colors.surface,
                      }}
                    >
                      <Ionicons
                        name={selected ? "radio-button-on" : "radio-button-off"}
                        size={20}
                        color={selected ? colors.accent : colors.inkTertiary}
                      />
                      <Text style={[type.callout, { color: colors.ink, marginLeft: spacing.xs, flex: 1 }]}>{item.label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={{ marginTop: spacing.sm }}>
                <TextField
                  label="Précisions (facultatif)"
                  placeholder="Ce qui s'est passé"
                  value={comment}
                  onChangeText={setComment}
                  multiline
                  numberOfLines={3}
                  maxLength={500}
                />
              </View>

              <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <Button label="Annuler" variant="secondary" onPress={onCancel} />
                </View>
                <View style={{ flex: 1 }}>
                  <Button
                    label="Signaler"
                    variant="destructive"
                    loading={loading}
                    disabled={!reason}
                    onPress={() => reason && onConfirm(reason, comment.trim())}
                  />
                </View>
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
