import React, { useCallback, useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { Picker } from "@react-native-picker/picker";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { StateView } from "../../components/StateView";
import { TextField } from "../../components/TextField";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Checkbox } from "../../components/Checkbox";
import { DateTimeField } from "../../components/DateTimeField";
import { useTheme } from "../../theme/ThemeProvider";
import { useAuth } from "../../auth/AuthContext";
import { extractErrorMessage } from "../../api/client";
import { createProspect, getProspect, updateProspect, PROSPECT_STATUS_LABELS, PROSPECT_STATUS_ORDER } from "../../api/prospects.api";
import type { ProspectStatus } from "../../api/prospects.api";
import { listUsers } from "../../api/users.api";
import type { DirectoryUser } from "../../api/users.api";
import type { MenuStackParamList } from "../../navigation/MenuStack";

type Route = RouteProp<MenuStackParamList, "ProspectForm">;
const NONE = "__none__";
const dateFmt = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", year: "numeric" });

// Seuls RH/Direction/Admin peuvent réassigner un prospect à un autre
// commercial (retour explicite du cahier des charges §3) — un superviseur
// est toujours assigné à lui-même côté serveur, ce champ ne lui est donc
// jamais montré.
const CAN_REASSIGN_ROLES = ["HR", "DIRECTOR", "ADMIN"];

function tomorrow(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d;
}

export function ProspectFormScreen() {
  const { colors, spacing, type } = useTheme();
  const { user } = useAuth();
  const route = useRoute<Route>();
  const navigation = useNavigation<NativeStackNavigationProp<MenuStackParamList>>();
  const prospectId = route.params?.prospectId;
  const isEdit = !!prospectId;
  const canReassign = !!user && CAN_REASSIGN_ROLES.includes(user.role);

  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [companyName, setCompanyName] = useState("");
  const [contactFirstName, setContactFirstName] = useState("");
  const [contactLastName, setContactLastName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [city, setCity] = useState("");
  const [siret, setSiret] = useState("");
  const [source, setSource] = useState("");
  const [serviceType, setServiceType] = useState("");
  const [need, setNeed] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<ProspectStatus>("NEW");
  const [followUpEnabled, setFollowUpEnabled] = useState(false);
  const [followUpDate, setFollowUpDate] = useState<Date>(tomorrow());
  const [assignedUserId, setAssignedUserId] = useState<string>(NONE);
  const [commercials, setCommercials] = useState<DirectoryUser[]>([]);

  const load = useCallback(async () => {
    try {
      setLoadState("loading");
      if (canReassign) {
        const [supervisors, hrs, directors] = await Promise.all([
          listUsers({ role: "SUPERVISOR", isActive: true }),
          listUsers({ role: "HR", isActive: true }),
          listUsers({ role: "DIRECTOR", isActive: true }),
        ]);
        setCommercials([...supervisors.items, ...hrs.items, ...directors.items]);
      }

      if (isEdit && prospectId) {
        const prospect = await getProspect(prospectId);
        setCompanyName(prospect.companyName);
        setContactFirstName(prospect.contactFirstName ?? "");
        setContactLastName(prospect.contactLastName ?? "");
        setJobTitle(prospect.jobTitle ?? "");
        setPhone(prospect.phone ?? "");
        setEmail(prospect.email ?? "");
        setAddress(prospect.address ?? "");
        setPostalCode(prospect.postalCode ?? "");
        setCity(prospect.city ?? "");
        setSiret(prospect.siret ?? "");
        setSource(prospect.source ?? "");
        setServiceType(prospect.serviceType ?? "");
        setNeed(prospect.need ?? "");
        setNotes(prospect.notes ?? "");
        setStatus(prospect.status);
        setAssignedUserId(prospect.assignedUserId ?? NONE);
        if (prospect.nextFollowUpAt) {
          setFollowUpEnabled(true);
          setFollowUpDate(new Date(prospect.nextFollowUpAt));
        }
      }
      setLoadState("ready");
    } catch {
      setLoadState("error");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prospectId, isEdit, canReassign]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prospectId]);

  async function handleSave() {
    setError(null);
    if (!companyName.trim()) {
      setError("Le nom de l'entreprise est requis.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        companyName: companyName.trim(),
        contactFirstName: contactFirstName.trim() || undefined,
        contactLastName: contactLastName.trim() || undefined,
        jobTitle: jobTitle.trim() || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        address: address.trim() || undefined,
        postalCode: postalCode.trim() || undefined,
        city: city.trim() || undefined,
        siret: siret.trim() || undefined,
        source: source.trim() || undefined,
        serviceType: serviceType.trim() || undefined,
        need: need.trim() || undefined,
        notes: notes.trim() || undefined,
        status,
        nextFollowUpAt: followUpEnabled ? followUpDate.toISOString() : undefined,
        ...(canReassign ? { assignedUserId: assignedUserId === NONE ? null : assignedUserId } : {}),
      };

      if (isEdit && prospectId) {
        await updateProspect(prospectId, payload);
        navigation.goBack();
      } else {
        const created = await createProspect(payload);
        navigation.replace("ProspectDetail", { prospectId: created.id });
      }
    } catch (err) {
      setError(extractErrorMessage(err, "Impossible d'enregistrer le prospect."));
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
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: spacing.xxxl }}>
        <TextField label="Entreprise" placeholder="Entreprise ABC" value={companyName} onChangeText={setCompanyName} />
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <TextField label="Prénom du contact" placeholder="Julie" value={contactFirstName} onChangeText={setContactFirstName} />
          </View>
          <View style={{ flex: 1 }}>
            <TextField label="Nom du contact" placeholder="Dupont" value={contactLastName} onChangeText={setContactLastName} />
          </View>
        </View>
        <TextField label="Fonction" placeholder="Responsable des locaux" value={jobTitle} onChangeText={setJobTitle} />
        <TextField label="Téléphone" placeholder="06 00 00 00 00" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
        <TextField label="Email" placeholder="contact@entreprise.fr" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
        <TextField label="Adresse" placeholder="12 rue Exemple" value={address} onChangeText={setAddress} />
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <TextField label="Code postal" placeholder="75000" value={postalCode} onChangeText={setPostalCode} keyboardType="number-pad" />
          </View>
          <View style={{ flex: 2 }}>
            <TextField label="Ville" placeholder="Paris" value={city} onChangeText={setCity} />
          </View>
        </View>
        <TextField label="SIRET" placeholder="123 456 789 00012" value={siret} onChangeText={setSiret} keyboardType="number-pad" />
        <TextField label="Source du prospect" placeholder="Recommandation, salon, site web..." value={source} onChangeText={setSource} />
        <TextField label="Type de prestation" placeholder="Nettoyage bureaux" value={serviceType} onChangeText={setServiceType} />
        <TextField label="Besoin" placeholder="Décrivez le besoin exprimé" value={need} onChangeText={setNeed} multiline numberOfLines={3} />
        <TextField label="Commentaire" placeholder="Notes internes" value={notes} onChangeText={setNotes} multiline numberOfLines={3} />

        <View style={{ marginBottom: spacing.md }}>
          <Text style={[type.subhead, { color: colors.inkSecondary, marginBottom: spacing.xxs }]}>Statut</Text>
          <Card padded={false}>
            <Picker selectedValue={status} onValueChange={(v) => setStatus(v as ProspectStatus)} style={{ color: colors.ink }}>
              {PROSPECT_STATUS_ORDER.map((s) => (
                <Picker.Item key={s} label={PROSPECT_STATUS_LABELS[s]} value={s} />
              ))}
            </Picker>
          </Card>
        </View>

        {canReassign && (
          <View style={{ marginBottom: spacing.md }}>
            <Text style={[type.subhead, { color: colors.inkSecondary, marginBottom: spacing.xxs }]}>Commercial responsable</Text>
            <Card padded={false}>
              <Picker selectedValue={assignedUserId} onValueChange={setAssignedUserId} style={{ color: colors.ink }}>
                <Picker.Item label="Moi-même" value={NONE} />
                {commercials.map((c) => (
                  <Picker.Item key={c.id} label={`${c.firstName} ${c.lastName}`} value={c.id} />
                ))}
              </Picker>
            </Card>
          </View>
        )}

        <View style={{ marginBottom: spacing.md }}>
          <Checkbox label="Programmer une relance" checked={followUpEnabled} onChange={setFollowUpEnabled} />
          {followUpEnabled && (
            <View style={{ marginTop: spacing.sm }}>
              <DateTimeField
                label="Date de la relance"
                mode="date"
                value={followUpDate}
                onChange={setFollowUpDate}
                minimumDate={new Date()}
                formatValue={(d) => dateFmt.format(d)}
              />
            </View>
          )}
        </View>

        {error && <Text style={[type.footnote, { color: colors.danger, marginBottom: spacing.md }]}>{error}</Text>}

        <Button label={isEdit ? "Enregistrer les modifications" : "Créer le prospect"} onPress={handleSave} loading={saving} />
      </ScrollView>
    </ScreenContainer>
  );
}
