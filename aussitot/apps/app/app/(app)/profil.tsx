import { useState } from "react";
import { View } from "react-native";
import Constants from "expo-constants";
import { LifeBuoy, LockKeyhole, LogOut } from "lucide-react-native";
import { BRAND, ROLE_LABELS } from "@aussitot/shared";
import { ApiError } from "@/api/client";
import { useAuth } from "@/auth/AuthProvider";
import { useVoiceReplies } from "@/assistant/preferences";
import { PasswordChecklist, passwordChecks } from "@/features/PasswordChecklist";
import { useTheme, type ThemePreference } from "@/theme/ThemeProvider";
import { Avatar, Button, Card, ListGroup, ListRow, Screen, Segmented, Sheet, SwitchRow, Text, TextField, useToast } from "@/ui";

/** Profil : sécurité (mot de passe), préférences (thème, voix), aide et déconnexion. */
export default function ProfileScreen() {
  const { preference, setPreference } = useTheme();
  const { user, logout } = useAuth();
  const [voiceReplies, setVoiceReplies] = useVoiceReplies();
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  if (!user) return null;
  const version = Constants.expoConfig?.version ?? "";

  return (
    <Screen title="Profil" maxWidth={720} testID="profile">
      <Card padding={18}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
          <Avatar firstName={user.firstName} lastName={user.lastName} size={60} />
          <View style={{ flex: 1, gap: 3 }}>
            <Text variant="title3">
              {user.firstName} {user.lastName}
            </Text>
            <Text variant="subhead" tone="secondary">
              {ROLE_LABELS[user.role]} · {user.organization.name}
            </Text>
            <Text variant="footnote" tone="tertiary">
              Identifiant : {user.username}
              {user.email ? ` · ${user.email}` : ""}
            </Text>
          </View>
        </View>
      </Card>

      <ListGroup title="Sécurité">
        <ListRow title="Modifier mon mot de passe" icon={LockKeyhole} onPress={() => setPasswordOpen(true)} testID="profile-password" />
      </ListGroup>

      <ListGroup title="Préférences">
        <View style={{ padding: 16, gap: 10 }}>
          <Text variant="callout" weight="medium">
            Apparence
          </Text>
          <Segmented<ThemePreference>
            options={[
              { value: "system", label: "Automatique" },
              { value: "light", label: "Clair" },
              { value: "dark", label: "Sombre" },
            ]}
            value={preference}
            onChange={setPreference}
          />
        </View>
        <SwitchRow
          title="Réponses de l'assistant à voix haute"
          subtitle="Quand vous parlez à l'assistant, il vous répond oralement."
          value={voiceReplies}
          onValueChange={setVoiceReplies}
          testID="profile-voice"
        />
      </ListGroup>

      <ListGroup title="Aide">
        <ListRow title="Pour tout problème de connexion ou de compte, contactez la RH." icon={LifeBuoy} iconTone="neutral" />
      </ListGroup>

      <Button
        label="Se déconnecter"
        icon={LogOut}
        variant="danger"
        size="lg"
        fullWidth
        loading={loggingOut}
        onPress={async () => {
          setLoggingOut(true);
          await logout();
        }}
        testID="profile-logout"
      />
      <Text variant="footnote" tone="tertiary" align="center">
        {BRAND.name} {version}
      </Text>

      <ChangePasswordSheet visible={passwordOpen} onClose={() => setPasswordOpen(false)} />
    </Screen>
  );
}

function ChangePasswordSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { user, changePassword } = useAuth();
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { checks, valid } = passwordChecks(next, confirm, user ? [user.firstName, user.lastName, user.username] : []);
  const reset = () => {
    setCurrent("");
    setNext("");
    setConfirm("");
    setError(null);
  };
  const submit = async () => {
    if (!valid || !current) return;
    setSaving(true);
    setError(null);
    try {
      await changePassword(current, next);
      reset();
      onClose();
      toast("Mot de passe modifié. Vos autres appareils ont été déconnectés.");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? (err.field("currentPassword") ?? err.field("newPassword") ?? err.message)
          : "Le changement a échoué. Réessayez.",
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <Sheet
      visible={visible}
      onClose={() => (reset(), onClose())}
      title="Modifier mon mot de passe"
      footer={
        <Button
          label="Enregistrer"
          size="lg"
          fullWidth
          disabled={!valid || !current}
          loading={saving}
          onPress={submit}
          testID="password-save"
        />
      }
    >
      <TextField
        label="Mot de passe actuel"
        value={current}
        onChangeText={setCurrent}
        secureToggle
        autoCapitalize="none"
        autoComplete="current-password"
        testID="password-current"
      />
      <TextField
        label="Nouveau mot de passe"
        value={next}
        onChangeText={setNext}
        secureToggle
        autoCapitalize="none"
        autoComplete="new-password"
        testID="password-new"
      />
      <TextField
        label="Confirmez le nouveau mot de passe"
        value={confirm}
        onChangeText={setConfirm}
        secureToggle
        autoCapitalize="none"
        autoComplete="new-password"
        testID="password-confirm"
      />
      <PasswordChecklist checks={checks} />
      {error ? (
        <Text variant="subhead" tone="danger" accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <Text variant="footnote" tone="tertiary">
        Mot de passe oublié ? Pour tout problème de connexion ou de compte, contactez la RH.
      </Text>
    </Sheet>
  );
}
