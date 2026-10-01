import React, { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { PressableScale } from "../../components/PressableScale";
import { useTheme } from "../../theme/ThemeProvider";
import { useAuth } from "../../auth/AuthContext";
import { OnboardingTarget } from "../../onboarding/OnboardingTarget";
import { useOnboardingScrollProps } from "../../onboarding/useOnboardingScrollProps";
import type { Role } from "../../api/auth.api";
import type { DashboardSectionTone } from "./dashboardSections";
import type { MenuStackParamList } from "../../navigation/MenuStack";
import { ABSENCES_MANAGEMENT_TITLE, MY_ABSENCES_TITLE, sitesListTitle, usersListTitle } from "../../navigation/screenTitles";

export interface MenuEntry {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  message: string;
  tone: DashboardSectionTone;
  screen: Exclude<keyof MenuStackParamList, "MenuHome" | "Profile">;
}

// Regroupe ce qui était jusqu'ici éclaté entre l'onglet "Profil" et l'onglet
// "Gestion" (variable selon le rôle) dans un seul Menu — retour explicite du
// client, maquette validée. Chaque rôle retrouve EXACTEMENT les mêmes
// destinations qu'avant (voir dashboardSections.ts pour les raccourcis
// personnels, l'ex-ManagementScreen pour les outils d'encadrement) : aucune
// permission ajoutée ni retirée, seulement réorganisée.
//
// Exporté : réutilisé tel quel par WebSidebar (voir navigation/web/WebSidebar.tsx)
// pour afficher ces mêmes destinations directement dans la barre latérale sur
// web plutôt que derrière un onglet "Menu" intermédiaire — mêmes permissions,
// seule la présentation change.
export const TOOL_ENTRIES: Record<Role, MenuEntry[]> = {
  EMPLOYEE: [
    { icon: "time-outline", label: "Mes heures", message: "Historique de vos pointages", tone: "purple", screen: "Timesheet" },
    { icon: "megaphone-outline", label: "Actualités", message: "Annonces de l'entreprise", tone: "purple", screen: "AnnouncementsList" },
    { icon: "warning-outline", label: "Mes signalements", message: "Suivi de vos signalements", tone: "danger", screen: "ProblemsList" },
  ],
  SITE_MANAGER: [
    { icon: "time-outline", label: "Mes heures", message: "Historique de vos pointages", tone: "purple", screen: "Timesheet" },
    { icon: "megaphone-outline", label: "Actualités", message: "Annonces de l'entreprise", tone: "purple", screen: "AnnouncementsList" },
    { icon: "business-outline", label: sitesListTitle("SITE_MANAGER"), message: "Chantiers dont vous êtes responsable", tone: "warning", screen: "SitesList" },
    { icon: "people-outline", label: usersListTitle("SITE_MANAGER"), message: "Annuaire de l'entreprise", tone: "info", screen: "UsersList" },
    { icon: "warning-outline", label: "Problèmes", message: "Signalements sur vos chantiers", tone: "danger", screen: "ProblemsList" },
    { icon: "checkmark-done-outline", label: "Validation des heures", message: "Pointages de votre équipe", tone: "success", screen: "TimesheetValidation" },
    { icon: "swap-horizontal-outline", label: "Pointage vs mission", message: "Repérer les écarts sur votre équipe", tone: "neutral", screen: "Reconciliation" },
  ],
  SUPERVISOR: [
    { icon: "time-outline", label: "Mes heures", message: "Historique de vos pointages", tone: "purple", screen: "Timesheet" },
    { icon: "megaphone-outline", label: "Actualités", message: "Annonces de l'entreprise", tone: "purple", screen: "AnnouncementsList" },
    { icon: "briefcase-outline", label: "Commercial", message: "Mes prospects, mes clients", tone: "accent", screen: "CommercialHome" },
    { icon: "checkmark-done-outline", label: "Validation des heures", message: "Pointages à valider avant la RH", tone: "success", screen: "TimesheetValidation" },
    { icon: "business-outline", label: "Chantiers", message: "Tous les chantiers de l'entreprise", tone: "warning", screen: "SitesList" },
    { icon: "people-outline", label: usersListTitle("SUPERVISOR"), message: "Annuaire de l'entreprise", tone: "info", screen: "UsersList" },
    { icon: "warning-outline", label: "Problèmes", message: "Tous les signalements en cours", tone: "danger", screen: "ProblemsList" },
    { icon: "swap-horizontal-outline", label: "Pointage vs mission", message: "Repérer qui a un écart à examiner", tone: "neutral", screen: "Reconciliation" },
    { icon: "folder-outline", label: "Dossiers d'heures", message: "Heures par personne, export paie", tone: "accent", screen: "StaffHoursList" },
    { icon: "calendar-outline", label: ABSENCES_MANAGEMENT_TITLE, message: "Demandes à approuver ou refuser", tone: "info", screen: "AbsencesManagement" },
  ],
  HR: [
    { icon: "time-outline", label: "Mes heures", message: "Historique de vos pointages", tone: "purple", screen: "Timesheet" },
    { icon: "megaphone-outline", label: "Actualités", message: "Annonces de l'entreprise", tone: "purple", screen: "AnnouncementsList" },
    { icon: "briefcase-outline", label: "Commercial", message: "Prospects, clients, devis", tone: "accent", screen: "CommercialHome" },
    { icon: "person-add-outline", label: "Comptes utilisateurs", message: "Créer et gérer les accès", tone: "success", screen: "UsersList" },
    { icon: "business-outline", label: "Chantiers", message: "Créer et gérer les fiches chantier", tone: "warning", screen: "SitesList" },
    { icon: "warning-outline", label: "Problèmes", message: "Tous les signalements en cours", tone: "danger", screen: "ProblemsList" },
    { icon: "checkmark-done-outline", label: "Validation des heures", message: "Pointages de toute l'entreprise", tone: "success", screen: "TimesheetValidation" },
    { icon: "swap-horizontal-outline", label: "Pointage vs mission", message: "Vert si tout concorde, rouge à vérifier", tone: "neutral", screen: "Reconciliation" },
    { icon: "folder-outline", label: "Dossiers d'heures", message: "Heures par personne, export paie", tone: "accent", screen: "StaffHoursList" },
    { icon: "calendar-outline", label: ABSENCES_MANAGEMENT_TITLE, message: "Demandes à approuver ou refuser", tone: "info", screen: "AbsencesManagement" },
  ],
  DIRECTOR: [
    { icon: "time-outline", label: "Mes heures", message: "Historique de vos pointages", tone: "purple", screen: "Timesheet" },
    { icon: "megaphone-outline", label: "Actualités", message: "Annonces de l'entreprise", tone: "purple", screen: "AnnouncementsList" },
    { icon: "briefcase-outline", label: "Commercial", message: "Prospects, clients, devis", tone: "accent", screen: "CommercialHome" },
    { icon: "business-outline", label: "Chantiers", message: "Vue globale de tous les chantiers", tone: "warning", screen: "SitesList" },
    {
      icon: "people-outline",
      label: "Comptes utilisateurs",
      message: "Gérer les accès existants",
      tone: "info",
      screen: "UsersList",
    },
    { icon: "warning-outline", label: "Problèmes", message: "Tous les signalements en cours", tone: "danger", screen: "ProblemsList" },
    { icon: "stats-chart-outline", label: "Statistiques", message: "Activité globale de l'entreprise", tone: "info", screen: "StatsOverview" },
    { icon: "checkmark-done-outline", label: "Validation des heures", message: "Pointages de toute l'entreprise", tone: "success", screen: "TimesheetValidation" },
    { icon: "swap-horizontal-outline", label: "Pointage vs mission", message: "Repérer qui a un écart à examiner", tone: "neutral", screen: "Reconciliation" },
    { icon: "folder-outline", label: "Dossiers d'heures", message: "Heures par personne, export paie", tone: "accent", screen: "StaffHoursList" },
    { icon: "calendar-outline", label: ABSENCES_MANAGEMENT_TITLE, message: "Vue d'ensemble des absences", tone: "info", screen: "AbsencesManagement" },
  ],
  ADMIN: [
    { icon: "time-outline", label: "Mes heures", message: "Historique de vos pointages", tone: "purple", screen: "Timesheet" },
    { icon: "megaphone-outline", label: "Actualités", message: "Annonces de l'entreprise", tone: "purple", screen: "AnnouncementsList" },
    { icon: "briefcase-outline", label: "Commercial", message: "Accès technique au module commercial", tone: "accent", screen: "CommercialHome" },
    { icon: "people-outline", label: "Comptes", message: "Gestion technique des comptes", tone: "info", screen: "UsersList" },
    { icon: "business-outline", label: "Chantiers", message: "Gestion technique des chantiers", tone: "warning", screen: "SitesList" },
    { icon: "checkmark-done-outline", label: "Validation des heures", message: "Pointages de toute l'entreprise", tone: "success", screen: "TimesheetValidation" },
    { icon: "swap-horizontal-outline", label: "Pointage vs mission", message: "Repérer qui a un écart à examiner", tone: "neutral", screen: "Reconciliation" },
    { icon: "folder-outline", label: "Dossiers d'heures", message: "Heures par personne, export paie", tone: "accent", screen: "StaffHoursList" },
    { icon: "calendar-outline", label: ABSENCES_MANAGEMENT_TITLE, message: "Vue d'ensemble des absences", tone: "info", screen: "AbsencesManagement" },
    { icon: "time-outline", label: "Journal d'activité", message: "Qui a fait quoi, et quand", tone: "neutral", screen: "ActivityLog" },
  ],
};

export function MenuScreen() {
  const { colors, spacing, radius, type } = useTheme();
  const { user, logout } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<MenuStackParamList>>();
  const [loggingOut, setLoggingOut] = useState(false);
  const onboardingScrollProps = useOnboardingScrollProps("MenuHome");

  if (!user) return null;

  const tools = TOOL_ENTRIES[user.role];

  const tones: Record<DashboardSectionTone, { fg: string; bg: string }> = {
    accent: { fg: colors.accent, bg: colors.accentSoft },
    info: { fg: colors.info, bg: colors.infoSoft },
    purple: { fg: colors.purple, bg: colors.purpleSoft },
    warning: { fg: colors.warning, bg: colors.warningSoft },
    danger: { fg: colors.danger, bg: colors.dangerSoft },
    success: { fg: colors.success, bg: colors.successSoft },
    neutral: { fg: colors.neutral, bg: colors.neutralSoft },
  };

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      setLoggingOut(false);
    }
  }

  function Row({ entry }: { entry: MenuEntry }) {
    const tone = tones[entry.tone];
    return (
      <PressableScale onPress={() => navigation.navigate(entry.screen as never)}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingVertical: spacing.md,
            paddingHorizontal: spacing.lg,
          }}
        >
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: radius.md,
              backgroundColor: tone.bg,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name={entry.icon} size={20} color={tone.fg} />
          </View>
          <View style={{ marginLeft: spacing.md, flex: 1 }}>
            <Text style={[type.headline, { color: colors.ink }]}>{entry.label}</Text>
            <Text style={[type.footnote, { color: colors.inkTertiary, marginTop: 2 }]} numberOfLines={1}>
              {entry.message}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.inkTertiary} />
        </View>
      </PressableScale>
    );
  }

  return (
    <ScreenContainer noHeader>
      <ScrollView
        {...onboardingScrollProps}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: spacing.lg, paddingBottom: spacing.xxl }}
      >
        <Text style={[type.largeTitle, { color: colors.ink, marginBottom: spacing.lg }]}>Menu</Text>

        <Text style={[type.overline, { color: colors.inkTertiary, marginBottom: spacing.sm }]}>MOI</Text>
        <Card padded={false}>
          <PressableScale onPress={() => navigation.navigate("Profile")}>
            <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: spacing.md, paddingHorizontal: spacing.lg }}>
              <View style={{ width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="person-outline" size={20} color={colors.accent} />
              </View>
              <Text style={[type.headline, { color: colors.ink, marginLeft: spacing.md, flex: 1 }]}>Mon profil</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.inkTertiary} />
            </View>
          </PressableScale>
          <View style={{ borderTopWidth: 1, borderTopColor: colors.border }}>
            <PressableScale onPress={() => navigation.navigate("MyAbsences")}>
              <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: spacing.md, paddingHorizontal: spacing.lg }}>
                <View style={{ width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="calendar-outline" size={20} color={colors.accent} />
                </View>
                <Text style={[type.headline, { color: colors.ink, marginLeft: spacing.md, flex: 1 }]}>{MY_ABSENCES_TITLE}</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.inkTertiary} />
              </View>
            </PressableScale>
          </View>
        </Card>

        {tools.length > 0 && (
          <>
            <Text style={[type.overline, { color: colors.inkTertiary, marginTop: spacing.xl, marginBottom: spacing.sm }]}>
              MES OUTILS
            </Text>
            <Card padded={false}>
              {tools.map((entry, index) => (
                <OnboardingTarget
                  id={`menu.${entry.screen}`}
                  key={entry.label}
                  style={index === 0 ? undefined : { borderTopWidth: 1, borderTopColor: colors.border }}
                >
                  <Row entry={entry} />
                </OnboardingTarget>
              ))}
            </Card>
          </>
        )}

        <View style={{ marginTop: spacing.xxl }}>
          <Button label="Se déconnecter" variant="destructive" onPress={handleLogout} loading={loggingOut} />
        </View>

        <Text
          style={[
            type.footnote,
            { color: colors.inkTertiary, textAlign: "center", marginTop: spacing.lg },
          ]}
        >
          Pour tout problème de connexion ou de compte, contactez la RH.
        </Text>
      </ScrollView>
    </ScreenContainer>
  );
}
