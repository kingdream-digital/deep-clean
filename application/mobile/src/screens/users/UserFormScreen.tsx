import React, { useCallback, useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { Picker } from "@react-native-picker/picker";
import { pickerStyle } from "../../components/pickerStyle";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { StateView } from "../../components/StateView";
import { TextField } from "../../components/TextField";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { useTheme } from "../../theme/ThemeProvider";
import { useAuth } from "../../auth/AuthContext";
import { useResponsive } from "../../hooks/useResponsive";
import { extractErrorMessage } from "../../api/client";
import { createUser, getUser, updateUser } from "../../api/users.api";
import type { Role } from "../../api/auth.api";
import type { HomeStackParamList } from "../../navigation/HomeStack";

type Route = RouteProp<{ UserForm: { userId?: string } | undefined }, "UserForm">;

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: "EMPLOYEE", label: "Employé" },
  { value: "SITE_MANAGER", label: "Chef d'équipe" },
  { value: "SUPERVISOR", label: "Superviseur" },
  { value: "HR", label: "RH" },
  { value: "DIRECTOR", label: "Directeur" },
  { value: "ADMIN", label: "Admin technique" },
];

// Même politique que backend/src/modules/users/users.service.ts::restrictedRolesFor :
// jamais un rôle que l'acteur n'a pas le droit d'attribuer dans la liste, plutôt
// que de laisser le choix puis échouer à l'enregistrement (cahier des charges,
// section 27 : pas de faux bouton qui ne fonctionne pas).
function assignableRoleOptionsFor(actorRole: Role | undefined): { value: Role; label: string }[] {
  const restricted: Role[] =
    actorRole === "HR" ? ["DIRECTOR", "ADMIN"] : actorRole === "DIRECTOR" ? ["ADMIN"] : [];
  return ROLE_OPTIONS.filter((opt) => !restricted.includes(opt.value));
}

export function UserFormScreen() {
  const { colors, spacing, type } = useTheme();
  const { user: actor } = useAuth();
  const { isDesktopWeb } = useResponsive();
  const route = useRoute<Route>();
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const userId = route.params?.userId;
  const isEdit = !!userId;

  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(isEdit ? "loading" : "ready");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<Role>("EMPLOYEE");

  const load = useCallback(async () => {
    if (!isEdit || !userId) return;
    try {
      setLoadState("loading");
      const account = await getUser(userId);
      setEmail(account.email ?? "");
      setFirstName(account.firstName);
      setLastName(account.lastName);
      setPhone(account.phone ?? "");
      setRole(account.role);
      setLoadState("ready");
    } catch {
      setLoadState("error");
    }
  }, [isEdit, userId]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, userId]);

  async function handleSave() {
    setError(null);
    if (!firstName.trim() || !lastName.trim()) {
      setError("Le prénom et le nom sont requis.");
      return;
    }

    setSaving(true);
    try {
      if (isEdit && userId) {
        await updateUser(userId, {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: phone.trim() || null,
          role,
        });
        navigation.goBack();
      } else {
        const { user, temporaryPassword } = await createUser({
          email: email.trim() || undefined,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: phone.trim() || undefined,
          role,
        });
        navigation.replace("UserDetail", { userId: user.id, temporaryPassword });
      }
    } catch (err) {
      setError(extractErrorMessage(err, "Impossible d'enregistrer ce compte."));
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
        {!isEdit && (
          <TextField
            label="Email (optionnel)"
            placeholder="prenom.nom@deepclean.fr"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
        )}
        <TextField label="Prénom" placeholder="Prénom" value={firstName} onChangeText={setFirstName} />
        <TextField label="Nom" placeholder="Nom" value={lastName} onChangeText={setLastName} />
        <TextField label="Téléphone (optionnel)" placeholder="06 00 00 00 00" keyboardType="phone-pad" value={phone} onChangeText={setPhone} />

        <View style={{ marginBottom: spacing.md }}>
          <Text style={[type.subhead, { color: colors.inkSecondary, marginBottom: spacing.xxs }]}>Rôle</Text>
          <Card padded={false}>
            <Picker selectedValue={role} onValueChange={(v) => setRole(v as Role)} style={pickerStyle(colors)} itemStyle={{ color: colors.ink }}>
              {assignableRoleOptionsFor(actor?.role).map((opt) => (
                <Picker.Item key={opt.value} label={opt.label} value={opt.value} />
              ))}
            </Picker>
          </Card>
        </View>

        {!isEdit && (
          <Text style={[type.footnote, { color: colors.inkTertiary, marginBottom: spacing.md }]}>
            Un identifiant de connexion et un mot de passe temporaire seront générés à la création — ils vous seront
            affichés une seule fois, à transmettre à l'utilisateur.
          </Text>
        )}

        {error && <Text style={[type.footnote, { color: colors.danger, marginBottom: spacing.md }]}>{error}</Text>}

        <Button label={isEdit ? "Enregistrer les modifications" : "Créer le compte"} onPress={handleSave} loading={saving} />
      </ScrollView>
    </ScreenContainer>
  );
}
