import React, { useCallback, useState } from "react";
import { Text, View } from "react-native";
import { Alert } from "../../utils/alert";
import { Ionicons } from "@expo/vector-icons";

import { ScreenContainer } from "../../components/ScreenContainer";
import { StateView } from "../../components/StateView";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { useTheme } from "../../theme/ThemeProvider";
import { extractErrorMessage } from "../../api/client";
import { downloadDocument, listMyDocuments } from "../../api/documents.api";
import type { EmployeeDocument } from "../../api/documents.api";
import { shareFile } from "../../utils/shareFile";
import { formatFileSize } from "../../utils/fileSize";
import { frenchDateFormat } from "../../utils/frenchDate";
import { useLiveFocusEffect, isBackgroundRefresh } from "../../sync/liveSync";

const dayFmt = frenchDateFormat({ day: "numeric", month: "long", year: "numeric" });

// Espace documents personnel (retour explicite du client) : ce que la
// RH/direction a déposé dans l'espace de la personne connectée — contrat,
// avenant, attestation... Lecture seule ici, le dépôt reste réservé à la RH
// (voir UserDocumentsScreen.tsx).
export function MyDocumentsScreen() {
  const { colors, spacing, radius, type } = useTheme();
  const [items, setItems] = useState<EmployeeDocument[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const silent = isBackgroundRefresh();
    try {
      if (!silent) setState("loading");
      setItems(await listMyDocuments());
      setState("ready");
    } catch {
      if (!silent) setState("error");
    }
  }, []);

  useLiveFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  async function handleOpen(doc: EmployeeDocument) {
    setBusyId(doc.id);
    try {
      const bytes = await downloadDocument(doc.id);
      await shareFile(doc.fileName, bytes, { mimeType: "application/pdf", uti: "com.adobe.pdf" });
    } catch (err) {
      Alert.alert("Ouverture impossible", extractErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  if (state === "loading") {
    return (
      <ScreenContainer>
        <StateView kind="loading" />
      </ScreenContainer>
    );
  }
  if (state === "error") {
    return (
      <ScreenContainer>
        <StateView kind="error" onRetry={load} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer style={{ paddingTop: spacing.lg }}>
      <Text style={[type.footnote, { color: colors.inkTertiary, marginBottom: spacing.md }]}>
        Vos documents personnels déposés par la RH — contrat, avenant, attestation...
      </Text>

      {items.length === 0 ? (
        <StateView kind="empty" icon="folder-open-outline" message="Aucun document pour le moment." />
      ) : (
        items.map((doc) => (
          <Card key={doc.id} style={{ marginBottom: spacing.sm }}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: radius.md,
                  backgroundColor: colors.purpleSoft,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="document-text-outline" size={20} color={colors.purple} />
              </View>
              <View style={{ marginLeft: spacing.sm, flex: 1 }}>
                <Text style={[type.callout, { color: colors.ink, fontWeight: "600" }]} numberOfLines={1}>
                  {doc.title}
                </Text>
                <Text style={[type.footnote, { color: colors.inkTertiary }]} numberOfLines={1}>
                  {formatFileSize(doc.sizeBytes)} · {dayFmt.format(new Date(doc.createdAt))}
                </Text>
              </View>
            </View>
            <View style={{ marginTop: spacing.sm }}>
              <Button label="Ouvrir" variant="secondary" size="md" loading={busyId === doc.id} onPress={() => handleOpen(doc)} />
            </View>
          </Card>
        ))
      )}
    </ScreenContainer>
  );
}
