import React, { useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Alert } from "../../utils/alert";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { Switch } from "../../components/Switch";
import { AuthenticatedImage } from "../../components/AuthenticatedImage";
import { useTheme } from "../../theme/ThemeProvider";
import { useAuth } from "../../auth/AuthContext";
import { extractErrorMessage } from "../../api/client";
import { avatarUrl, removeAvatar, uploadAvatar } from "../../api/users.api";
import { pickWebImages } from "../../utils/webImagePicker";
import { useOnboarding } from "../../onboarding/OnboardingContext";
import type { RootStackParamList } from "../../navigation/RootNavigator";
import type { MenuStackParamList } from "../../navigation/MenuStack";
import type { Role } from "../../api/auth.api";

const ROLE_LABELS: Record<Role, string> = {
  EMPLOYEE: "Employé",
  SITE_MANAGER: "Chef d'équipe",
  SUPERVISOR: "Superviseur",
  HR: "Ressources humaines",
  DIRECTOR: "Directeur",
  ADMIN: "Administrateur technique",
};

export function ProfileScreen() {
  const { colors, spacing, radius, type, isDark, setDarkMode } = useTheme();
  const { user, logout, setHasAvatar } = useAuth();
  // Depuis le basculement vers le Menu (voir navigation/MenuStack.tsx), Profil
  // n'est plus un onglet à part : c'est un écran de MenuStack, lui-même sous
  // l'onglet — d'où les deux niveaux de `getParent()` pour atteindre le
  // RootStack et sa modale ChangePassword.
  const navigation = useNavigation<NativeStackNavigationProp<MenuStackParamList>>();
  const { replay: replayOnboarding } = useOnboarding();
  const [loggingOut, setLoggingOut] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);

  if (!user) return null;

  const initials = `${user.firstName[0] ?? ""}${user.lastName[0] ?? ""}`.toUpperCase();

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      setLoggingOut(false);
    }
  }

  async function submitAvatar(asset: { uri: string; fileName?: string | null; mimeType?: string | null; file?: File }) {
    setAvatarBusy(true);
    try {
      await uploadAvatar(asset);
      setHasAvatar(true);
    } catch (err) {
      Alert.alert("Photo non enregistrée", extractErrorMessage(err, "Impossible d'enregistrer cette photo."));
    } finally {
      setAvatarBusy(false);
    }
  }

  async function handleTakePhoto() {
    // Même contournement web que ReportProblemScreen — voir utils/webImagePicker.ts.
    if (Platform.OS === "web") {
      const [file] = await pickWebImages({ multiple: false, capture: true });
      if (file) await submitAvatar(file);
      return;
    }
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Accès refusé", "Autorisez l'accès à l'appareil photo dans les réglages pour prendre une photo.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.8 });
    if (!result.canceled) await submitAvatar(result.assets[0]);
  }

  async function handlePickFromLibrary() {
    if (Platform.OS === "web") {
      const [file] = await pickWebImages({ multiple: false });
      if (file) await submitAvatar(file);
      return;
    }
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Accès refusé", "Autorisez l'accès aux photos dans les réglages pour en sélectionner.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });
    if (!result.canceled) await submitAvatar(result.assets[0]);
  }

  function handleChangePhoto() {
    Alert.alert("Changer ma photo", undefined, [
      { text: "Prendre une photo", onPress: handleTakePhoto },
      { text: "Choisir dans la galerie", onPress: handlePickFromLibrary },
      { text: "Annuler", style: "cancel" },
    ]);
  }

  async function handleRemovePhoto() {
    setAvatarBusy(true);
    try {
      await removeAvatar();
      setHasAvatar(false);
    } catch (err) {
      Alert.alert("Erreur", extractErrorMessage(err, "Impossible de retirer cette photo."));
    } finally {
      setAvatarBusy(false);
    }
  }

  return (
    <ScreenContainer>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: spacing.lg }}>
        <Text style={[type.largeTitle, { color: colors.ink, marginBottom: spacing.lg }]}>Profil</Text>

        <Card glow style={styles.identityRow}>
          <Pressable onPress={handleChangePhoto} disabled={avatarBusy} accessibilityLabel="Changer ma photo de profil">
            {user.hasAvatar ? (
              <AuthenticatedImage
                uri={avatarUrl(user.id)}
                style={[styles.avatar, { borderRadius: radius.pill }]}
              />
            ) : (
              <View style={[styles.avatar, { backgroundColor: colors.accentSoft, borderRadius: radius.pill }]}>
                <Text style={[type.title3, { color: colors.accent }]}>{initials}</Text>
              </View>
            )}
            <View
              style={[
                styles.avatarBadge,
                { backgroundColor: colors.accentDeep, borderColor: colors.backgroundElevated },
              ]}
            >
              <Ionicons name="camera" size={11} color={colors.onAccent} />
            </View>
          </Pressable>
          <View style={{ marginLeft: spacing.md, flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Text style={[type.headline, { color: colors.ink }]} numberOfLines={1}>
                {user.firstName} {user.lastName}
              </Text>
              <View
                style={{
                  marginLeft: spacing.xs,
                  paddingHorizontal: 8,
                  paddingVertical: 2,
                  borderRadius: 999,
                  backgroundColor: colors.successSoft,
                }}
              >
                <Text style={[type.caption, { color: colors.success, fontWeight: "600" }]}>Actif</Text>
              </View>
            </View>
            <Text style={[type.subhead, { color: colors.inkSecondary }]}>{user.username}</Text>
            <Text style={[type.caption, { color: colors.accent, marginTop: spacing.xxs, fontWeight: "600" }]}>
              {ROLE_LABELS[user.role]}
            </Text>
          </View>
        </Card>
        <View style={{ flexDirection: "row", alignItems: "center", marginTop: spacing.sm, paddingHorizontal: spacing.xxs }}>
          <Pressable onPress={handleChangePhoto} disabled={avatarBusy}>
            <Text style={[type.footnote, { color: colors.accent, fontWeight: "600" }]}>Changer la photo</Text>
          </Pressable>
          {user.hasAvatar && (
            <Pressable onPress={handleRemovePhoto} disabled={avatarBusy} style={{ marginLeft: spacing.md }}>
              <Text style={[type.footnote, { color: colors.inkTertiary, fontWeight: "600" }]}>Retirer la photo</Text>
            </Pressable>
          )}
          <Text style={[type.footnote, { color: colors.inkTertiary, marginLeft: spacing.md }]}>— facultative</Text>
        </View>

        <Text style={[type.overline, { color: colors.inkTertiary, marginTop: spacing.xl, marginBottom: spacing.sm }]}>
          CONGÉS & ABSENCES
        </Text>
        <Card padded={false}>
          <Row
            icon="calendar-outline"
            label="Mes absences"
            onPress={() => navigation.navigate("MyAbsences")}
          />
        </Card>

        <Text style={[type.overline, { color: colors.inkTertiary, marginTop: spacing.xl, marginBottom: spacing.sm }]}>
          SÉCURITÉ
        </Text>
        <Card padded={false}>
          <Row
            icon="key-outline"
            label="Modifier mon mot de passe"
            onPress={() =>
              navigation.getParent()?.getParent<NativeStackNavigationProp<RootStackParamList>>()?.navigate("ChangePassword")
            }
          />
        </Card>

        <Text style={[type.overline, { color: colors.inkTertiary, marginTop: spacing.xl, marginBottom: spacing.sm }]}>
          APPARENCE
        </Text>
        <Card padded={false}>
          <View
            style={[
              styles.rowTouchable,
              { paddingVertical: spacing.md, paddingHorizontal: spacing.lg, justifyContent: "space-between" },
            ]}
          >
            <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
              <Ionicons name="moon-outline" size={20} color={colors.inkSecondary} />
              <Text style={[type.body, { color: colors.ink, marginLeft: spacing.sm }]}>Thème sombre</Text>
            </View>
            <Switch value={isDark} onValueChange={setDarkMode} accessibilityLabel="Activer le thème sombre" />
          </View>
        </Card>
        <Text style={[type.footnote, { color: colors.inkTertiary, marginTop: spacing.xs, paddingHorizontal: spacing.xxs }]}>
          Deep Clean s'affiche en clair par défaut. Activez cette option pour passer l'application en thème sombre à tout moment.
        </Text>

        <Text style={[type.overline, { color: colors.inkTertiary, marginTop: spacing.xl, marginBottom: spacing.sm }]}>
          AIDE
        </Text>
        <Card padded={false}>
          <Row icon="school-outline" label="Revoir le tutoriel" onPress={replayOnboarding} />
        </Card>

        <Text style={[type.overline, { color: colors.inkTertiary, marginTop: spacing.xl, marginBottom: spacing.sm }]}>
          À PROPOS
        </Text>
        <Card padded={false}>
          <Row icon="shield-checkmark-outline" label="Mentions légales" onPress={() => navigation.navigate("Legal")} />
        </Card>

        <View style={{ marginTop: spacing.xxl }}>
          <Button label="Se déconnecter" variant="destructive" onPress={handleLogout} loading={loggingOut} />
        </View>

        <Text
          style={[
            type.footnote,
            { color: colors.inkTertiary, textAlign: "center", marginTop: spacing.lg, marginBottom: spacing.xl },
          ]}
        >
          Pour tout problème de connexion ou de compte, contactez la RH.
        </Text>
      </ScrollView>
    </ScreenContainer>
  );
}

function Row({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  const { colors, spacing, type } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[styles.rowTouchable, { paddingVertical: spacing.md, paddingHorizontal: spacing.lg }]}
    >
      <Ionicons name={icon} size={20} color={colors.inkSecondary} />
      <Text style={[type.body, { color: colors.ink, marginLeft: spacing.sm, flex: 1 }]}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={colors.inkTertiary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  identityRow: { flexDirection: "row", alignItems: "center" },
  avatar: { width: 52, height: 52, alignItems: "center", justifyContent: "center" },
  avatarBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 20,
    height: 20,
    borderRadius: 999,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  rowTouchable: { flexDirection: "row", alignItems: "center" },
});
