import React, { useCallback, useState } from "react";
import { Platform, Text, View } from "react-native";
import { Alert } from "../../utils/alert";
import * as DocumentPicker from "expo-document-picker";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRoute, RouteProp } from "@react-navigation/native";
import { ScreenContainer } from "../../components/ScreenContainer";
import { StateView } from "../../components/StateView";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { TextField } from "../../components/TextField";
import { PressableScale } from "../../components/PressableScale";
import { useTheme } from "../../theme/ThemeProvider";
import { extractErrorMessage } from "../../api/client";
import { deleteDocument, downloadDocument, listUserDocuments, uploadDocument } from "../../api/documents.api";
import type { EmployeeDocument, LocalDocumentAsset } from "../../api/documents.api";
import { pickWebFile } from "../../utils/webImagePicker";
import { shareFile } from "../../utils/shareFile";
import { formatFileSize } from "../../utils/fileSize";
import { frenchDateFormat } from "../../utils/frenchDate";

type Route = RouteProp<{ UserDocuments: { userId: string; fullName: string } }, "UserDocuments">;

const dayFmt = frenchDateFormat({ day: "numeric", month: "long", year: "numeric" });

// Gestion RH/direction de l'espace documents d'un collaborateur (retour
// explicite du client) : déposer un document (contrat, avenant...) dans son
// espace, le consulter, ou le retirer. Même schéma d'upload PDF que
// StandardFormScreen/SiteFormScreen (DocumentPicker natif, pickWebFile sur web).
export function UserDocumentsScreen() {
  const { colors, spacing, radius, type } = useTheme();
  const route = useRoute<Route>();
  const { userId, fullName } = route.params;

  const [items, setItems] = useState<EmployeeDocument[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [pdfAsset, setPdfAsset] = useState<LocalDocumentAsset | null>(null);
  const [title, setTitle] = useState("");
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setState("loading");
      setItems(await listUserDocuments(userId));
      setState("ready");
    } catch {
      setState("error");
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  async function handlePickPdf() {
    if (Platform.OS === "web") {
      const picked = await pickWebFile({ accept: "application/pdf" });
      if (!picked) return;
      setPdfAsset({ uri: picked.uri, fileName: picked.fileName ?? "document.pdf", file: picked.file });
    } else {
      const result = await DocumentPicker.getDocumentAsync({ type: "application/pdf", copyToCacheDirectory: true });
      if (result.canceled || !result.assets?.[0]) return;
      setPdfAsset({ uri: result.assets[0].uri, fileName: result.assets[0].name });
    }
  }

  async function handleUpload() {
    if (!pdfAsset || !title.trim()) return;
    setUploading(true);
    try {
      await uploadDocument(userId, title.trim(), pdfAsset);
      setPdfAsset(null);
      setTitle("");
      await load();
    } catch (err) {
      Alert.alert("Envoi impossible", extractErrorMessage(err));
    } finally {
      setUploading(false);
    }
  }

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

  function handleDelete(doc: EmployeeDocument) {
    Alert.alert("Retirer ce document ?", `« ${doc.title} » sera définitivement supprimé de l'espace de ${fullName}.`, [
      { text: "Annuler", style: "cancel" },
      {
        text: "Retirer",
        style: "destructive",
        onPress: async () => {
          setBusyId(doc.id);
          try {
            await deleteDocument(doc.id);
            await load();
          } catch (err) {
            Alert.alert("Suppression impossible", extractErrorMessage(err));
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);
  }

  return (
    <ScreenContainer style={{ paddingTop: spacing.lg }}>
      <Text style={[type.footnote, { color: colors.inkTertiary, marginBottom: spacing.md }]}>
        Documents visibles uniquement par {fullName} et par la RH/direction — contrat, avenant, attestation...
      </Text>

      <Card>
        <Text style={[type.footnote, { color: colors.inkTertiary, marginBottom: spacing.sm }]}>
          AJOUTER UN DOCUMENT
        </Text>
        <TextField label="Titre" placeholder="Contrat de travail" value={title} onChangeText={setTitle} />
        {pdfAsset ? (
          <View style={{ flexDirection: "row", alignItems: "center", marginTop: spacing.sm }}>
            <Ionicons name="document-attach-outline" size={18} color={colors.purple} />
            <Text style={[type.callout, { color: colors.ink, marginLeft: spacing.sm, flex: 1 }]} numberOfLines={1}>
              {pdfAsset.fileName}
            </Text>
            <PressableScale onPress={() => setPdfAsset(null)} hitSlop={10}>
              <Ionicons name="close-circle-outline" size={20} color={colors.inkTertiary} />
            </PressableScale>
          </View>
        ) : (
          <View style={{ marginTop: spacing.sm }}>
            <Button label="Choisir un PDF" variant="secondary" onPress={handlePickPdf} />
          </View>
        )}
        <View style={{ marginTop: spacing.sm }}>
          <Button
            label="Ajouter à l'espace de la personne"
            onPress={handleUpload}
            loading={uploading}
            disabled={!pdfAsset || !title.trim()}
          />
        </View>
      </Card>

      <Text style={[type.overline, { color: colors.inkTertiary, marginTop: spacing.xl, marginBottom: spacing.sm }]}>
        DOCUMENTS ({items.length})
      </Text>

      {state === "loading" && <StateView kind="loading" />}
      {state === "error" && <StateView kind="error" onRetry={load} />}
      {state === "ready" && items.length === 0 && (
        <StateView kind="empty" icon="folder-open-outline" message="Aucun document pour le moment." />
      )}
      {state === "ready" &&
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
                  {doc.uploadedBy ? ` · ${doc.uploadedBy.firstName} ${doc.uploadedBy.lastName}` : ""}
                </Text>
              </View>
            </View>
            <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm }}>
              <View style={{ flex: 1 }}>
                <Button label="Ouvrir" variant="secondary" size="md" loading={busyId === doc.id} onPress={() => handleOpen(doc)} />
              </View>
              <View style={{ flex: 1 }}>
                <Button label="Retirer" variant="destructive" size="md" loading={busyId === doc.id} onPress={() => handleDelete(doc)} />
              </View>
            </View>
          </Card>
        ))}
    </ScreenContainer>
  );
}
