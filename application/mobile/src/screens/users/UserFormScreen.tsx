import React, { useCallback, useEffect, useState } from "react";
import { Platform, ScrollView, Text, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { Ionicons } from "@expo/vector-icons";
import { Picker } from "@react-native-picker/picker";
import { pickerStyle } from "../../components/pickerStyle";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { StateView } from "../../components/StateView";
import { TextField } from "../../components/TextField";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { SegmentedControl } from "../../components/SegmentedControl";
import { DateTimeField } from "../../components/DateTimeField";
import { calendarDay, frenchDateFormat } from "../../utils/frenchDate";
import { toLocalDateKey } from "../../utils/missionFormat";
import { useTheme } from "../../theme/ThemeProvider";
import { useAuth } from "../../auth/AuthContext";
import { useResponsive } from "../../hooks/useResponsive";
import { extractErrorMessage } from "../../api/client";
import { createUser, getUser, updateUser } from "../../api/users.api";
import { listLeaveTransactions, setOpeningLeaveBalance } from "../../api/leave.api";
import { uploadDocument } from "../../api/documents.api";
import type { LocalDocumentAsset } from "../../api/documents.api";
import { pickWebFile } from "../../utils/webImagePicker";
import { PressableScale } from "../../components/PressableScale";
import { Alert } from "../../utils/alert";
import type { Role } from "../../api/auth.api";
import type { HomeStackParamList } from "../../navigation/HomeStack";

type Route = RouteProp<{ UserForm: { userId?: string } | undefined }, "UserForm">;

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: "EMPLOYEE", label: "Employé" },
  { value: "SITE_MANAGER", label: "Chef d'équipe" },
  { value: "SUPERVISOR", label: "Superviseur" },
  { value: "HR", label: "RH" },
  { value: "DIRECTOR", label: "Directeur" },
  { value: "ACCOUNTANT", label: "Comptable (accès paie en consultation)" },
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

const hireDateFormat = frenchDateFormat({ day: "numeric", month: "long", year: "numeric" });

// Période de référence des congés (1er juin → 31 mai) : année de son 1er juin.
function currentLeavePeriod(): number {
  const now = new Date();
  return now.getMonth() >= 5 ? now.getFullYear() : now.getFullYear() - 1;
}

function parseDays(text: string): number | null {
  if (!text.trim()) return 0;
  const n = Number(text.replace(",", "."));
  return Number.isNaN(n) || n < 0 || n > 60 ? null : Math.round(n * 100) / 100;
}

function daysText(n: number): string {
  return n > 0 ? String(n).replace(".", ",") : "";
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
  // Date d'entrée : base du calcul des congés acquis (aujourd'hui par défaut,
  // à corriger pour un salarié déjà présent avant l'application).
  const [hireDate, setHireDate] = useState<Date>(new Date());
  // Heures par semaine au contrat : le planning en déduit ce qu'il reste à
  // planifier pour la personne chaque semaine.
  const [weeklyHoursText, setWeeklyHoursText] = useState("");
  const [nightWorkerStatus, setNightWorkerStatus] = useState<"AUTO" | "YES" | "NO">("AUTO");
  // Congés : vide = règle légale (2,5 jours ouvrables / mois, 30 / an).
  const [accrualRateText, setAccrualRateText] = useState("");
  const [accrualCapText, setAccrualCapText] = useState("");
  // Reprise du solde du dernier bulletin de paie (retour explicite du client :
  // « il ne perd rien, tout est basculé »).
  const [openingPrevText, setOpeningPrevText] = useState("");
  const [openingCurText, setOpeningCurText] = useState("");
  const [initialOpening, setInitialOpening] = useState({ previousYear: 0, currentYear: 0 });
  // Documents déposés dès la création (facultatifs, possibles plus tard depuis
  // la fiche → Documents) : contrat de travail et convention collective
  // (retour explicite du client : l'entreprise établit sa propre convention).
  const [contract, setContract] = useState<LocalDocumentAsset | null>(null);
  const [agreement, setAgreement] = useState<LocalDocumentAsset | null>(null);
  const canSetOpening = !!actor && ["HR", "DIRECTOR", "ADMIN", "SUPERVISOR"].includes(actor.role) && actor.id !== userId;

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
      if (account.hireDate) setHireDate(calendarDay(account.hireDate));
      setWeeklyHoursText(account.weeklyHours != null ? String(account.weeklyHours).replace(".", ",") : "");
      setNightWorkerStatus(account.nightWorkerStatus ?? "AUTO");
      setAccrualRateText(account.leaveAccrualRate != null ? String(account.leaveAccrualRate).replace(".", ",") : "");
      setAccrualCapText(account.leaveAccrualCap != null ? String(account.leaveAccrualCap).replace(".", ",") : "");
      if (canSetOpening) {
        const period = currentLeavePeriod();
        const opening = (await listLeaveTransactions(userId).catch(() => [])).filter((t) => t.type === "OPENING_BALANCE");
        const prev = opening.filter((t) => t.periodYear === period - 1).reduce((sum, t) => sum + t.days, 0);
        const cur = opening.filter((t) => t.periodYear === period).reduce((sum, t) => sum + t.days, 0);
        setInitialOpening({ previousYear: prev, currentYear: cur });
        setOpeningPrevText(daysText(prev));
        setOpeningCurText(daysText(cur));
      }
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

    const weeklyHoursValue = weeklyHoursText.trim() ? Number(weeklyHoursText.replace(",", ".")) : null;
    if (weeklyHoursValue != null && (Number.isNaN(weeklyHoursValue) || weeklyHoursValue <= 0 || weeklyHoursValue > 60)) {
      setError("Heures par semaine : indiquez un nombre entre 1 et 60, par exemple 35.");
      return;
    }
    const rateValue = accrualRateText.trim() ? Number(accrualRateText.replace(",", ".")) : null;
    const capValue = accrualCapText.trim() ? Number(accrualCapText.replace(",", ".")) : null;
    if (rateValue != null && (Number.isNaN(rateValue) || rateValue <= 0 || rateValue > 5)) {
      setError("Congés acquis par mois : indiquez un nombre entre 0 et 5, par exemple 2,5.");
      return;
    }
    if (capValue != null && (Number.isNaN(capValue) || capValue <= 0 || capValue > 60)) {
      setError("Plafond annuel : indiquez un nombre de jours, par exemple 30.");
      return;
    }
    const openingPrev = parseDays(openingPrevText);
    const openingCur = parseDays(openingCurText);
    if (openingPrev === null || openingCur === null) {
      setError("Solde de congés : indiquez un nombre de jours entre 0 et 60, par exemple 12,5.");
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
          hireDate: toLocalDateKey(hireDate),
          weeklyHours: weeklyHoursValue,
          nightWorkerStatus,
          leaveAccrualRate: rateValue,
          leaveAccrualCap: capValue,
        });
        if (canSetOpening && (openingPrev !== initialOpening.previousYear || openingCur !== initialOpening.currentYear)) {
          await setOpeningLeaveBalance(userId, { previousYear: openingPrev, currentYear: openingCur });
        }
        navigation.goBack();
      } else {
        const { user, temporaryPassword } = await createUser({
          email: email.trim() || undefined,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: phone.trim() || undefined,
          role,
          hireDate: toLocalDateKey(hireDate),
          ...(weeklyHoursValue != null ? { weeklyHours: weeklyHoursValue } : {}),
          ...(rateValue != null ? { leaveAccrualRate: rateValue } : {}),
          ...(capValue != null ? { leaveAccrualCap: capValue } : {}),
          ...(openingPrev > 0 || openingCur > 0 ? { openingLeave: { previousYear: openingPrev, currentYear: openingCur } } : {}),
        });
        const failed: string[] = [];
        for (const [title, asset] of [["Contrat de travail", contract], ["Convention collective", agreement]] as const) {
          if (!asset) continue;
          try {
            await uploadDocument(user.id, title, asset);
          } catch {
            failed.push(title.toLowerCase());
          }
        }
        if (failed.length) {
          Alert.alert(
            "Compte créé, document non envoyé",
            `Envoi impossible : ${failed.join(" et ")}.\n\nVous pourrez le déposer depuis la fiche de l'employé → Documents.`
          );
        }
        navigation.replace("UserDetail", { userId: user.id, temporaryPassword });
      }
    } catch (err) {
      setError(extractErrorMessage(err, "Impossible d'enregistrer ce compte."));
    } finally {
      setSaving(false);
    }
  }

  async function pickPdf(fallbackName: string): Promise<LocalDocumentAsset | null> {
    if (Platform.OS === "web") {
      const picked = await pickWebFile({ accept: "application/pdf" });
      return picked ? { uri: picked.uri, fileName: picked.fileName ?? fallbackName, file: picked.file } : null;
    }
    const result = await DocumentPicker.getDocumentAsync({ type: "application/pdf", copyToCacheDirectory: true });
    return !result.canceled && result.assets?.[0] ? { uri: result.assets[0].uri, fileName: result.assets[0].name } : null;
  }

  function documentSlot(label: string, asset: LocalDocumentAsset | null, set: (a: LocalDocumentAsset | null) => void, fallbackName: string) {
    return asset ? (
      <Card style={{ marginBottom: spacing.xs }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Ionicons name="document-text-outline" size={20} color={colors.accent} />
          <View style={{ flex: 1, marginLeft: spacing.sm }}>
            <Text style={[type.caption, { color: colors.inkTertiary }]}>{label}</Text>
            <Text style={[type.callout, { color: colors.ink }]} numberOfLines={1}>
              {asset.fileName}
            </Text>
          </View>
          <PressableScale onPress={() => set(null)} accessibilityLabel={`Retirer : ${label}`} style={{ paddingLeft: spacing.sm }}>
            <Text style={[type.footnote, { color: colors.danger, fontWeight: "600" }]}>Retirer</Text>
          </PressableScale>
        </View>
      </Card>
    ) : (
      <Button
        label={`Joindre : ${label.toLowerCase()} (PDF)`}
        icon="attach-outline"
        variant="secondary"
        style={{ marginBottom: spacing.xs }}
        onPress={async () => {
          const picked = await pickPdf(fallbackName);
          if (picked) set(picked);
        }}
      />
    );
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

        <DateTimeField
          label="Début du contrat"
          mode="date"
          value={hireDate}
          onChange={setHireDate}
          maximumDate={new Date()}
          formatValue={(d) => hireDateFormat.format(d)}
        />
        <Text style={[type.footnote, { color: colors.inkTertiary, marginTop: -spacing.xs, marginBottom: spacing.md }]}>
          Date d'arrivée dans l'entreprise. Les congés s'acquièrent ensuite automatiquement chaque mois.
        </Text>

        {canSetOpening && (
          <>
            <Text style={[type.overline, { color: colors.inkTertiary, marginTop: spacing.sm, marginBottom: spacing.sm }]}>SOLDE DE CONGÉS ACTUEL</Text>
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <View style={{ flex: 1 }}>
                <TextField label="Congés N-1 restants" placeholder="0" keyboardType="decimal-pad" value={openingPrevText} onChangeText={setOpeningPrevText} />
              </View>
              <View style={{ flex: 1 }}>
                <TextField label="Congés N acquis" placeholder="0" keyboardType="decimal-pad" value={openingCurText} onChangeText={setOpeningCurText} />
              </View>
            </View>
            <Text style={[type.footnote, { color: colors.inkTertiary, marginTop: -spacing.xs, marginBottom: spacing.md }]}>
              Pour un salarié déjà dans l'entreprise, recopiez les deux soldes de son dernier bulletin de paie (en jours ouvrables) : il ne perd rien. Les congés N-1 sont à prendre avant le 31 mai {currentLeavePeriod() + 1}. Laissez vide pour un nouveau salarié.
            </Text>
          </>
        )}

        {!isEdit && (
          <>
            <Text style={[type.overline, { color: colors.inkTertiary, marginTop: spacing.sm, marginBottom: spacing.sm }]}>DOCUMENTS (FACULTATIF)</Text>
            {documentSlot("Contrat de travail", contract, setContract, "contrat.pdf")}
            {documentSlot("Convention collective", agreement, setAgreement, "convention-collective.pdf")}
            <Text style={[type.footnote, { color: colors.inkTertiary, marginTop: spacing.xs, marginBottom: spacing.md }]}>
              Rangés dans les documents de l'employé, qui pourra les consulter. Vous pourrez aussi les déposer plus tard depuis sa fiche → Documents.
            </Text>
          </>
        )}

        <TextField
          label="Heures par semaine (contrat)"
          placeholder="Ex. 35"
          keyboardType="decimal-pad"
          value={weeklyHoursText}
          onChangeText={setWeeklyHoursText}
        />
        <Text style={[type.footnote, { color: colors.inkTertiary, marginTop: -spacing.xs, marginBottom: spacing.md }]}>
          Le planning affiche ensuite combien d'heures il reste à planifier pour la personne chaque semaine.
        </Text>

        {isEdit && (
          <>
            <Text style={[type.overline, { color: colors.inkTertiary, marginTop: spacing.sm, marginBottom: spacing.sm }]}>TRAVAILLEUR DE NUIT</Text>
            <SegmentedControl
              value={nightWorkerStatus}
              onChange={setNightWorkerStatus}
              options={[
                { label: "Automatique", value: "AUTO" },
                { label: "Oui", value: "YES" },
                { label: "Non", value: "NO" },
              ]}
            />
            <Text style={[type.footnote, { color: colors.inkTertiary, marginTop: spacing.xs, marginBottom: spacing.md }]}>
              Automatique : reconnu d'après ses pointages (3 h entre 21 h et 6 h au moins 2 fois par semaine, ou 270 h de nuit sur 12 mois). Il acquiert alors un repos compensateur payé de 2 % de ses heures de nuit. Les heures de nuit restent majorées dans tous les cas.
            </Text>
          </>
        )}

        <Text style={[type.overline, { color: colors.inkTertiary, marginTop: spacing.sm, marginBottom: spacing.sm }]}>CONGÉS PAYÉS DU CONTRAT</Text>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <TextField
              label="Acquis par mois"
              placeholder="2,5"
              keyboardType="decimal-pad"
              value={accrualRateText}
              onChangeText={setAccrualRateText}
            />
          </View>
          <View style={{ flex: 1 }}>
            <TextField label="Plafond par an" placeholder="30" keyboardType="decimal-pad" value={accrualCapText} onChangeText={setAccrualCapText} />
          </View>
        </View>
        <Text style={[type.footnote, { color: colors.inkTertiary, marginTop: -spacing.xs, marginBottom: spacing.md }]}>
          En jours ouvrables. Laissez vide pour la règle légale : 2,5 jours par mois de travail, 30 jours (5 semaines) par période de référence.
        </Text>

        {!isEdit && (
          <Text style={[type.footnote, { color: colors.inkTertiary, marginBottom: spacing.md }]}>
            Un identifiant de connexion et un mot de passe temporaire seront générés à la création — ils vous seront
            affichés une seule fois, à transmettre à l'utilisateur.
          </Text>
        )}

        {!!error && <Text style={[type.footnote, { color: colors.danger, marginBottom: spacing.md }]}>{error}</Text>}

        <Button label={isEdit ? "Enregistrer les modifications" : "Créer le compte"} onPress={handleSave} loading={saving} />
      </ScrollView>
    </ScreenContainer>
  );
}
