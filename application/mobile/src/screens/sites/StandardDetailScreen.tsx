import React, { useCallback, useLayoutEffect, useState } from "react";
import { Platform, ScrollView, Text, View } from "react-native";
import { Alert } from "../../utils/alert";
import * as DocumentPicker from "expo-document-picker";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { StateView } from "../../components/StateView";
import { Card } from "../../components/Card";
import { PressableScale } from "../../components/PressableScale";
import { useTheme } from "../../theme/ThemeProvider";
import { useAuth } from "../../auth/AuthContext";
import { extractErrorMessage } from "../../api/client";
import { attachStandardDocument, downloadStandardDocument, getStandard, removeStandardDocument } from "../../api/standards.api";
import type { CleaningStandard } from "../../api/standards.api";
import { formatFileSize } from "../../utils/fileSize";
import { pickWebFile } from "../../utils/webImagePicker";
import { shareFile } from "../../utils/shareFile";

type Route = RouteProp<{ StandardDetail: { standardId: string } }, "StandardDetail">;
type Navigation = NativeStackNavigationProp<{ StandardForm: { siteId: string; standardId?: string } }>;

// Qui peut déposer/remplacer/retirer le PDF — mêmes droits que la gestion du
// standard lui-même (backend standards.service.ts::MANAGE_ROLES). Le reste de
// l'écran reste en lecture seule pour tous (voir commentaire plus bas).
const MANAGE_ROLES = ["SUPERVISOR", "HR", "DIRECTOR", "ADMIN"];

// Essentiellement en lecture seule — accessible à quiconque peut voir la
// mission qui l'applique (employés compris), depuis le lien "Basé sur le
// standard" du détail de mission. Seul le dépôt du PDF (retour explicite du
// client : il fournit déjà son propre standard en PDF plutôt que de le
// retaper) est réservé à la gestion du planning.
export function StandardDetailScreen() {
  const { colors, spacing, radius, type } = useTheme();
  const { user } = useAuth();
  const route = useRoute<Route>();
  const navigation = useNavigation<Navigation>();
  const { standardId } = route.params;

  const [standard, setStandard] = useState<CleaningStandard | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const canManage = user ? MANAGE_ROLES.includes(user.role) : false;

  const load = useCallback(async () => {
    try {
      setState((prev) => (prev === "ready" ? prev : "loading"));
      setStandard(await getStandard(standardId));
      setState("ready");
    } catch {
      setState("error");
    }
  }, [standardId]);

  // Rechargé à chaque retour sur l'écran : la fiche reflète tout de suite
  // une modification faite dans le formulaire.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const siteId = standard?.siteId;
  useLayoutEffect(() => {
    if (!canManage || !siteId) return;
    navigation.setOptions({
      headerRight: () => (
        <PressableScale
          onPress={() => navigation.navigate("StandardForm", { siteId, standardId })}
          accessibilityRole="button"
          accessibilityLabel="Modifier le standard"
          style={{ paddingHorizontal: spacing.xs, paddingVertical: spacing.xxs }}
        >
          <Text style={[type.callout, { color: colors.accent, fontWeight: "600" }]}>Modifier</Text>
        </PressableScale>
      ),
    });
  }, [canManage, siteId, standardId, navigation, colors.accent, spacing, type.callout]);

  async function handleAttachDocument() {
    try {
      let asset: { uri: string; fileName: string; file?: File } | null = null;
      if (Platform.OS === "web") {
        const picked = await pickWebFile({ accept: "application/pdf" });
        if (!picked) return;
        asset = { uri: picked.uri, fileName: picked.fileName ?? "standard.pdf", file: picked.file };
      } else {
        const result = await DocumentPicker.getDocumentAsync({ type: "application/pdf", copyToCacheDirectory: true });
        if (result.canceled || !result.assets?.[0]) return;
        asset = { uri: result.assets[0].uri, fileName: result.assets[0].name };
      }

      setActionLoading("document");
      const updated = await attachStandardDocument(standardId, asset);
      setStandard(updated);
    } catch (err) {
      Alert.alert("Envoi impossible", extractErrorMessage(err));
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDownloadDocument() {
    if (!standard?.documentFileName) return;
    setActionLoading("downloadDocument");
    try {
      const bytes = await downloadStandardDocument(standardId);
      await shareFile(standard.documentFileName, bytes, { mimeType: "application/pdf", uti: "com.adobe.pdf" });
    } catch (err) {
      Alert.alert("Téléchargement impossible", extractErrorMessage(err));
    } finally {
      setActionLoading(null);
    }
  }

  function handleRemoveDocument() {
    Alert.alert("Retirer ce document ?", "Il ne sera plus proposé à la création d'une mission sur ce standard.", [
      { text: "Retour", style: "cancel" },
      {
        text: "Retirer",
        style: "destructive",
        onPress: async () => {
          setActionLoading("removeDocument");
          try {
            setStandard(await removeStandardDocument(standardId));
          } catch (err) {
            Alert.alert("Action impossible", extractErrorMessage(err));
          } finally {
            setActionLoading(null);
          }
        },
      },
    ]);
  }

  if (state === "loading") {
    return (
      <ScreenContainer>
        <StateView kind="loading" />
      </ScreenContainer>
    );
  }
  if (state === "error" || !standard) {
    return (
      <ScreenContainer>
        <StateView kind="error" onRetry={load} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: spacing.lg, paddingBottom: spacing.xxxl }}>
        <Text style={[type.title1, { color: colors.ink }]}>{standard.name}</Text>
        <Text style={[type.footnote, { color: colors.inkTertiary, marginTop: spacing.xxs }]}>
          Standard de nettoyage — créé par {standard.createdBy.firstName} {standard.createdBy.lastName}
        </Text>

        <Card style={{ marginTop: spacing.lg }}>
          {standard.tasks.length > 0 && (
            <View style={{ marginBottom: standard.equipment.length > 0 ? spacing.md : 0 }}>
              <Text style={[type.footnote, { color: colors.inkTertiary, marginBottom: spacing.xxs }]}>Étapes</Text>
              {standard.tasks.map((task, i) => (
                <View key={i} style={{ flexDirection: "row", alignItems: "flex-start", marginTop: 4 }}>
                  <Ionicons name="checkmark-circle-outline" size={16} color={colors.accent} style={{ marginTop: 2 }} />
                  <Text style={[type.callout, { color: colors.ink, marginLeft: spacing.xs, flex: 1 }]}>{task}</Text>
                </View>
              ))}
            </View>
          )}
          {standard.equipment.length > 0 && (
            <View style={{ marginBottom: (standard.safetyInstructions || standard.notes) ? spacing.md : 0 }}>
              <Text style={[type.footnote, { color: colors.inkTertiary, marginBottom: spacing.xxs }]}>Matériel</Text>
              <Text style={[type.callout, { color: colors.ink }]}>{standard.equipment.join(" · ")}</Text>
            </View>
          )}
          {standard.safetyInstructions && (
            <View style={{ marginBottom: standard.notes ? spacing.md : 0 }}>
              <Text style={[type.footnote, { color: colors.warning, marginBottom: spacing.xxs }]}>Sécurité</Text>
              <Text style={[type.callout, { color: colors.ink }]}>{standard.safetyInstructions}</Text>
            </View>
          )}
          {standard.notes && (
            <View>
              <Text style={[type.footnote, { color: colors.inkTertiary, marginBottom: spacing.xxs }]}>Notes</Text>
              <Text style={[type.callout, { color: colors.ink }]}>{standard.notes}</Text>
            </View>
          )}
          {standard.tasks.length === 0 && standard.equipment.length === 0 && !standard.safetyInstructions && !standard.notes && (
            <Text style={[type.callout, { color: colors.inkTertiary }]}>Ce standard est vide.</Text>
          )}
        </Card>

        {(canManage || standard.documentFileName) && (
          <View style={{ marginTop: spacing.md }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: spacing.xs,
              }}
            >
              <Text style={[type.overline, { color: colors.inkTertiary }]}>DOCUMENT PDF</Text>
              {canManage && (
                <PressableScale onPress={handleAttachDocument}>
                  <Text style={[type.footnote, { color: colors.accent, fontWeight: "600" }]}>
                    {standard.documentFileName ? "Remplacer" : "Importer un PDF"}
                  </Text>
                </PressableScale>
              )}
            </View>

            {standard.documentFileName ? (
              <Card style={{ flexDirection: "row", alignItems: "center" }}>
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: radius.md,
                    backgroundColor: colors.purpleSoft,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons name="document-attach-outline" size={18} color={colors.purple} />
                </View>
                <View style={{ marginLeft: spacing.sm, flex: 1 }}>
                  <Text style={[type.callout, { color: colors.ink }]} numberOfLines={1}>
                    {standard.documentFileName}
                  </Text>
                  <Text style={[type.footnote, { color: colors.inkTertiary, marginTop: 2 }]} numberOfLines={1}>
                    {standard.documentSizeBytes !== null ? formatFileSize(standard.documentSizeBytes) : ""}
                  </Text>
                </View>
                <PressableScale
                  onPress={handleDownloadDocument}
                  accessibilityRole="button"
                  accessibilityLabel="Télécharger le document"
                  style={{ marginLeft: spacing.xs, padding: spacing.xxs }}
                >
                  <Ionicons name="download-outline" size={20} color={colors.accent} />
                </PressableScale>
                {canManage && (
                  <PressableScale
                    onPress={handleRemoveDocument}
                    accessibilityRole="button"
                    accessibilityLabel="Retirer le document"
                    style={{ marginLeft: spacing.xs, padding: spacing.xxs }}
                  >
                    <Ionicons name="trash-outline" size={20} color={colors.danger} />
                  </PressableScale>
                )}
              </Card>
            ) : (
              <Card>
                <Text style={[type.callout, { color: colors.inkTertiary }]}>
                  Aucun document importé. Vous pouvez déposer le standard tel quel en PDF plutôt que de le retaper
                  ci-dessus.
                </Text>
              </Card>
            )}
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
