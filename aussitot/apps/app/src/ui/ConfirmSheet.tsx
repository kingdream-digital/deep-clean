import type { ReactNode } from "react";
import { View } from "react-native";
import { Sheet } from "./Sheet";
import { Button } from "./Button";
import { Text } from "./Text";

/** Confirmation d'une action importante (émettre une facture, annuler une mission…), avec champs éventuels. */
export function ConfirmSheet({
  visible,
  title,
  message,
  confirmLabel,
  tone = "primary",
  loading,
  error,
  onConfirm,
  onClose,
  children,
  confirmDisabled,
}: {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel: string;
  tone?: "primary" | "danger";
  loading?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onClose: () => void;
  children?: ReactNode;
  confirmDisabled?: boolean;
}) {
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={title}
      footer={
        <View style={{ gap: 10 }}>
          <Button
            label={confirmLabel}
            variant={tone === "danger" ? "danger" : "primary"}
            fullWidth
            size="lg"
            loading={loading}
            disabled={confirmDisabled}
            onPress={onConfirm}
            testID="confirm-sheet-ok"
          />
          <Button label="Annuler" variant="ghost" fullWidth onPress={onClose} disabled={loading} />
        </View>
      }
    >
      {message ? (
        <Text variant="callout" tone="secondary">
          {message}
        </Text>
      ) : null}
      {children}
      {error ? (
        <Text variant="subhead" tone="danger" accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </Sheet>
  );
}
