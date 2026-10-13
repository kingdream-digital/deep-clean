import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PressableScale } from "./PressableScale";
import { useTheme } from "../theme/ThemeProvider";
import { Alert } from "../utils/alert";
import { extractErrorMessage } from "../api/client";
import { getInboxStatus, syncInbox } from "../api/quotes.api";
import type { InboxStatus } from "../api/quotes.api";

function sinceLabel(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `il y a ${hours} h` : `il y a ${Math.round(hours / 24)} j`;
}

/**
 * État de la lecture des réponses aux devis dans la boîte mail : adresse
 * lue, dernière vérification, erreur éventuelle, et « Vérifier maintenant ».
 */
export function InboxStatusBar({ onSynced }: { onSynced?: () => void }) {
  const { colors, spacing, type } = useTheme();
  const [status, setStatus] = useState<InboxStatus | null>(null);
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(() => {
    getInboxStatus()
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  useEffect(refresh, [refresh]);

  async function handleSync() {
    setSyncing(true);
    try {
      const result = await syncInbox();
      setStatus(result.inbox);
      Alert.alert(
        "Boîte mail vérifiée",
        result.summary.recorded > 0
          ? `${result.summary.recorded} nouvelle${result.summary.recorded > 1 ? "s" : ""} réponse${result.summary.recorded > 1 ? "s" : ""} de client.`
          : "Aucune nouvelle réponse de client."
      );
      onSynced?.();
    } catch (err) {
      Alert.alert("Vérification impossible", extractErrorMessage(err));
      refresh();
    } finally {
      setSyncing(false);
    }
  }

  if (!status) return null;

  if (!status.configured) {
    return (
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: spacing.sm }}>
        <Ionicons name="mail-outline" size={14} color={colors.inkTertiary} />
        <Text style={[type.footnote, { color: colors.inkTertiary, marginLeft: 6, flex: 1 }]}>
          Lecture des réponses par email non configurée.
        </Text>
      </View>
    );
  }

  const hasError = !!status.lastError;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", marginBottom: spacing.sm }}>
      <Ionicons name={hasError ? "warning-outline" : "mail-open-outline"} size={14} color={hasError ? colors.warning : colors.success} />
      <Text style={[type.footnote, { color: hasError ? colors.warning : colors.inkSecondary, marginLeft: 6, flex: 1 }]} numberOfLines={2}>
        {hasError
          ? status.lastError
          : `Réponses lues dans ${status.address}${status.lastSyncAt ? ` · ${sinceLabel(status.lastSyncAt)}` : ""}`}
      </Text>
      <PressableScale onPress={handleSync} disabled={syncing} style={{ paddingVertical: 4, paddingLeft: spacing.sm }}>
        {syncing ? (
          <ActivityIndicator size="small" color={colors.accent} />
        ) : (
          <Text style={[type.footnote, { color: colors.accentText, fontWeight: "600" }]}>Vérifier</Text>
        )}
      </PressableScale>
    </View>
  );
}
