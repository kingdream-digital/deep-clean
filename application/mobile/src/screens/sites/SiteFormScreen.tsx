import React, { useCallback, useEffect, useState } from "react";
import { Platform, ScrollView, Text, View } from "react-native";
import { Alert } from "../../utils/alert";
import * as DocumentPicker from "expo-document-picker";
import { Ionicons } from "@expo/vector-icons";
import { Picker } from "@react-native-picker/picker";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { StateView } from "../../components/StateView";
import { TextField } from "../../components/TextField";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Checkbox } from "../../components/Checkbox";
import { PressableScale } from "../../components/PressableScale";
import { useTheme } from "../../theme/ThemeProvider";
import { useResponsive } from "../../hooks/useResponsive";
import { extractErrorMessage } from "../../api/client";
import { createSite, getSite, updateSite } from "../../api/sites.api";
import { listUsers } from "../../api/users.api";
import type { DirectoryUser } from "../../api/users.api";
import { attachStandardDocument, createStandard } from "../../api/standards.api";
import type { LocalDocumentAsset } from "../../api/standards.api";
import { pickWebFile } from "../../utils/webImagePicker";
import { formatFileSize } from "../../utils/fileSize";
import type { HomeStackParamList } from "../../navigation/HomeStack";

type Route = RouteProp<{ SiteForm: { siteId?: string } | undefined }, "SiteForm">;
const NONE = "__none__";

export function SiteFormScreen() {
  const { colors, spacing, type } = useTheme();
  const { isDesktopWeb } = useResponsive();
  const route = useRoute<Route>();
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const siteId = route.params?.siteId;
  const isEdit = !!siteId;

  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [managers, setManagers] = useState<DirectoryUser[]>([]);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [description, setDescription] = useState("");
  const [managerId, setManagerId] = useState<string>(NONE);
  const [isActive, setIsActive] = useState(true);
  // Position GPS de référence du chantier (retour explicite du client :
  // vérifier automatiquement, en interne, que les pointages sont faits à
  // proximité) — calculée par le serveur à partir de l'adresse tapée (voir
  // sites.service.ts::geocodeAddress), jamais saisie ici : purement
  // informatif, pour savoir si la vérification de distance sera active.
  const [siteLatitude, setSiteLatitude] = useState<number | null>(null);
  const [siteLongitude, setSiteLongitude] = useState<number | null>(null);
  // Standard PDF importable directement à la création (retour explicite du
  // client : le chantier n'a pas besoin d'un chef d'équipe à la création,
  // juste ses infos + le standard qu'il fournit déjà en PDF) — jamais
  // proposé en édition, un chantier existant gère ses standards depuis
  // "Standards de nettoyage" (StandardsListScreen).
  const [pdfAsset, setPdfAsset] = useState<LocalDocumentAsset | null>(null);
  const [pdfSizeBytes, setPdfSizeBytes] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      setLoadState("loading");
      // Le chef d'équipe ne se choisit plus à la création (retour
      // explicite du client) : inutile de charger la liste hors édition.
      if (isEdit) {
        const managersRes = await listUsers({ role: "SITE_MANAGER", isActive: true });
        setManagers(managersRes.items);
      }

      if (isEdit && siteId) {
        const site = await getSite(siteId);
        setName(site.name);
        setAddress(site.address);
        setDescription(site.description ?? "");
        setManagerId(site.managerId ?? NONE);
        setIsActive(site.isActive);
        setSiteLatitude(site.latitude);
        setSiteLongitude(site.longitude);
      }
      setLoadState("ready");
    } catch {
      setLoadState("error");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId, isEdit]);

  async function handlePickPdf() {
    if (Platform.OS === "web") {
      const picked = await pickWebFile({ accept: "application/pdf" });
      if (!picked) return;
      setPdfAsset({ uri: picked.uri, fileName: picked.fileName ?? "standard.pdf", file: picked.file });
      setPdfSizeBytes(picked.file?.size ?? null);
    } else {
      const result = await DocumentPicker.getDocumentAsync({ type: "application/pdf", copyToCacheDirectory: true });
      if (result.canceled || !result.assets?.[0]) return;
      setPdfAsset({ uri: result.assets[0].uri, fileName: result.assets[0].name });
      setPdfSizeBytes(result.assets[0].size ?? null);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId]);

  async function handleSave() {
    setError(null);
    if (!name.trim()) {
      setError("Le nom du chantier est requis.");
      return;
    }
    if (!address.trim()) {
      setError("L'adresse du chantier est requise.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        address: address.trim(),
        description: description.trim() || undefined,
        managerId: managerId === NONE ? undefined : managerId,
      };
      // La position GPS n'est jamais envoyée : le serveur la déduit lui-même
      // de l'adresse tapée (voir sites.service.ts::geocodeAddress). On
      // prévient seulement si elle n'a pas pu être trouvée, sans jamais
      // bloquer l'enregistrement pour autant.
      const warnIfNoPosition = (site: { latitude: number | null }) => {
        if (site.latitude == null) {
          Alert.alert(
            "Position GPS non trouvée",
            "L'adresse n'a pas été reconnue automatiquement : la vérification de distance des pointages ne sera pas active pour ce chantier. Vérifiez l'orthographe de l'adresse si besoin."
          );
        }
      };

      if (isEdit && siteId) {
        const updated = await updateSite(siteId, { ...payload, managerId: managerId === NONE ? null : managerId, isActive });
        warnIfNoPosition(updated);
        navigation.goBack();
      } else {
        const created = await createSite(payload);
        warnIfNoPosition(created);

        if (pdfAsset) {
          // Le chantier existe déjà à ce stade : un échec ici ne doit jamais
          // faire croire que la création du chantier a échoué, ni bloquer la
          // navigation — juste prévenir que le PDF n'a pas pu être importé,
          // récupérable ensuite depuis "Standards de nettoyage".
          try {
            const standardName = pdfAsset.fileName.replace(/\.pdf$/i, "").trim() || "Standard importé";
            const standard = await createStandard({ siteId: created.id, name: standardName, tasks: [], equipment: [] });
            await attachStandardDocument(standard.id, pdfAsset);
          } catch (err) {
            Alert.alert(
              "Chantier créé",
              `Le chantier a bien été créé, mais l'import du standard PDF a échoué : ${extractErrorMessage(err)}. Vous pouvez réessayer depuis "Standards de nettoyage".`
            );
          }
        }

        navigation.replace("SiteDetail", { siteId: created.id });
      }
    } catch (err) {
      setError(extractErrorMessage(err, "Impossible d'enregistrer le chantier."));
    } finally {
      setSaving(false);
    }
  }

  if (loadState === "loading") {
    return (
      <ScreenContainer>
        <StateView kind="loading" />
      </ScreenContainer>
    );
  }
  if (loadState === "error") {
    return (
      <ScreenContainer>
        <StateView kind="error" onRetry={load} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer avoidKeyboard style={{ paddingTop: spacing.lg }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          { paddingBottom: spacing.xxxl },
          isDesktopWeb && { maxWidth: 640, width: "100%", alignSelf: "center" },
        ]}
      >
        <TextField label="Nom du chantier" placeholder="Tour Horizon" value={name} onChangeText={setName} />
        <TextField label="Adresse" placeholder="12 rue des Fleurs, 04100 Manosque" value={address} onChangeText={setAddress} />
        <Text style={[type.footnote, { color: colors.inkTertiary, marginTop: -spacing.sm, marginBottom: spacing.md }]}>
          {isEdit
            ? siteLatitude != null
              ? "Position GPS trouvée automatiquement à partir de cette adresse — les pointages de l'équipe seront comparés à cette position."
              : "Position GPS non trouvée pour cette adresse : la vérification de distance des pointages ne sera pas active pour ce chantier."
            : "La position GPS du chantier sera calculée automatiquement à partir de cette adresse, pour vérifier les pointages de l'équipe."}
        </Text>
        <TextField
          label="Description (optionnel)"
          placeholder="Informations complémentaires"
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={3}
        />

        {isEdit && (
          <View style={{ marginBottom: spacing.md }}>
            <Text style={[type.subhead, { color: colors.inkSecondary, marginBottom: spacing.xxs }]}>Chef d'équipe</Text>
            <Card padded={false}>
              <Picker selectedValue={managerId} onValueChange={setManagerId} style={{ color: colors.ink }}>
                <Picker.Item label="Aucun pour le moment" value={NONE} />
                {managers.map((m) => (
                  <Picker.Item key={m.id} label={`${m.firstName} ${m.lastName}`} value={m.id} />
                ))}
              </Picker>
            </Card>
          </View>
        )}

        {!isEdit && (
          <View style={{ marginBottom: spacing.lg }}>
            <Text style={[type.subhead, { color: colors.inkSecondary, marginBottom: spacing.xxs }]}>
              Standard de nettoyage (PDF, optionnel)
            </Text>
            {pdfAsset ? (
              <Card style={{ flexDirection: "row", alignItems: "center" }}>
                <Ionicons name="document-attach-outline" size={18} color={colors.purple} />
                <View style={{ marginLeft: spacing.sm, flex: 1 }}>
                  <Text style={[type.callout, { color: colors.ink }]} numberOfLines={1}>
                    {pdfAsset.fileName}
                  </Text>
                  {pdfSizeBytes !== null && (
                    <Text style={[type.footnote, { color: colors.inkTertiary, marginTop: 2 }]}>
                      {formatFileSize(pdfSizeBytes)}
                    </Text>
                  )}
                </View>
                <PressableScale
                  onPress={() => {
                    setPdfAsset(null);
                    setPdfSizeBytes(null);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Retirer le PDF"
                  style={{ marginLeft: spacing.xs, padding: spacing.xxs }}
                >
                  <Ionicons name="close-circle-outline" size={20} color={colors.inkTertiary} />
                </PressableScale>
              </Card>
            ) : (
              <Card padded={false}>
                <Button label="Importer votre standard en PDF" variant="secondary" onPress={handlePickPdf} />
              </Card>
            )}
            <Text style={[type.footnote, { color: colors.inkTertiary, marginTop: spacing.xxs }]}>
              Déposez directement votre standard tel quel, sans avoir à le retaper. Vous pourrez le remplacer ou en
              ajouter d'autres ensuite depuis "Standards de nettoyage".
            </Text>
          </View>
        )}

        {isEdit && (
          <View style={{ marginBottom: spacing.lg }}>
            <Checkbox label="Chantier actif" checked={isActive} onChange={setIsActive} />
          </View>
        )}

        {error && <Text style={[type.footnote, { color: colors.danger, marginBottom: spacing.md }]}>{error}</Text>}

        <Button label={isEdit ? "Enregistrer les modifications" : "Créer le chantier"} onPress={handleSave} loading={saving} />
      </ScrollView>
    </ScreenContainer>
  );
}
