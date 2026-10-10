import { useEffect, useState } from "react";
import { Mail } from "lucide-react-native";
import { ApiError } from "@/api/client";
import { ConfirmSheet, Text, TextField } from "@/ui";

/** Envoi d'un document par email : destinataire (fiche client par défaut) et message facultatif. */
export function SendSheet({
  visible,
  title,
  defaultTo,
  confirmLabel,
  note,
  loading,
  error,
  onSend,
  onClose,
}: {
  visible: boolean;
  title: string;
  defaultTo: string | null;
  confirmLabel: string;
  note?: string;
  loading: boolean;
  error: unknown;
  onSend: (input: { to?: string; message?: string | null }) => void;
  onClose: () => void;
}) {
  const [to, setTo] = useState(defaultTo ?? "");
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (visible) {
      setTo(defaultTo ?? "");
      setMessage("");
    }
  }, [visible, defaultTo]);
  const apiError = error instanceof ApiError ? error : null;
  return (
    <ConfirmSheet
      visible={visible}
      title={title}
      confirmLabel={confirmLabel}
      loading={loading}
      error={apiError ? (apiError.field("to") ?? apiError.message) : error ? "Envoi impossible pour le moment." : null}
      onConfirm={() => onSend({ to: to.trim() || undefined, message: message.trim() || null })}
      onClose={onClose}
      confirmDisabled={!to.trim()}
    >
      <TextField
        label="Destinataire"
        icon={Mail}
        value={to}
        onChangeText={setTo}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="email@client.fr"
        testID="send-to"
      />
      <TextField
        label="Message (facultatif)"
        value={message}
        onChangeText={setMessage}
        multiline
        maxLength={2000}
        placeholder="Bonjour, veuillez trouver ci-joint…"
      />
      <Text variant="footnote" tone="tertiary">
        {note ?? "Le PDF est joint à l'email. Une copie de l'envoi est gardée dans l'historique."}
      </Text>
    </ConfirmSheet>
  );
}
