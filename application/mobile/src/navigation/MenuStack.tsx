import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useTheme } from "../theme/ThemeProvider";
import { useResponsive } from "../hooks/useResponsive";
import { MenuScreen } from "../screens/dashboard/MenuScreen";
import { ProfileScreen } from "../screens/profile/ProfileScreen";
import { LegalScreen } from "../screens/profile/LegalScreen";
import { UsersListScreen } from "../screens/users/UsersListScreen";
import { UserDetailScreen } from "../screens/users/UserDetailScreen";
import { UserFormScreen } from "../screens/users/UserFormScreen";
import { SitesListScreen } from "../screens/sites/SitesListScreen";
import { SiteDetailScreen } from "../screens/sites/SiteDetailScreen";
import { SiteFormScreen } from "../screens/sites/SiteFormScreen";
import { StandardsListScreen } from "../screens/sites/StandardsListScreen";
import { StandardFormScreen } from "../screens/sites/StandardFormScreen";
import { StandardDetailScreen } from "../screens/sites/StandardDetailScreen";
import { TimesheetScreen } from "../screens/timesheets/TimesheetScreen";
import { TimesheetValidationScreen } from "../screens/timesheets/TimesheetValidationScreen";
import { TimesheetRejectScreen } from "../screens/timesheets/TimesheetRejectScreen";
import { RetroactiveClockScreen } from "../screens/timesheets/RetroactiveClockScreen";
import { TimeEntryDetailScreen } from "../screens/timesheets/TimeEntryDetailScreen";
import { StaffHoursListScreen } from "../screens/timesheets/StaffHoursListScreen";
import { EmployeeHoursScreen } from "../screens/timesheets/EmployeeHoursScreen";
import { ReconciliationScreen } from "../screens/timesheets/ReconciliationScreen";
import { ReconciliationDetailScreen } from "../screens/timesheets/ReconciliationDetailScreen";
import { MyAbsencesScreen } from "../screens/absences/MyAbsencesScreen";
import { AbsenceFormScreen } from "../screens/absences/AbsenceFormScreen";
import { AbsencesManagementScreen } from "../screens/absences/AbsencesManagementScreen";
import { ActivityLogScreen } from "../screens/activity/ActivityLogScreen";
import { ProblemsListScreen } from "../screens/problems/ProblemsListScreen";
import { ProblemDetailScreen } from "../screens/missions/ProblemDetailScreen";
import { MissionDetailScreen } from "../screens/missions/MissionDetailScreen";
import { MissionFormScreen } from "../screens/missions/MissionFormScreen";
import { JobSheetFormScreen } from "../screens/missions/JobSheetFormScreen";
import { ReportProblemScreen } from "../screens/missions/ReportProblemScreen";
import { ContactProfileScreen } from "../screens/inbox/ContactProfileScreen";
import { StatsOverviewScreen } from "../screens/stats/StatsOverviewScreen";
import { AnnouncementsListScreen } from "../screens/announcements/AnnouncementsListScreen";
import { AnnouncementDetailScreen } from "../screens/announcements/AnnouncementDetailScreen";
import { AnnouncementFormScreen } from "../screens/announcements/AnnouncementFormScreen";

// Remplace l'ancien tandem d'onglets "Gestion" (variable selon le rôle) +
// "Profil" (retour explicite du client : tout ce qui n'est pas Accueil /
// Planning / Missions / Messages doit se retrouver dans un seul Menu,
// cohérent avec la maquette validée). Les écrans ci-dessous sont pour la
// plupart déjà enregistrés ailleurs (HomeStack, ex-ManagementStack) — même
// convention de duplication volontaire que InboxStack : rester dans le même
// onglet (donc le même bouton retour natif) plutôt que de sauter sur
// l'onglet Accueil quand on ouvre un élément du Menu.
export type MenuStackParamList = {
  MenuHome: undefined;
  Profile: undefined;
  UsersList: undefined;
  UserDetail: { userId: string; temporaryPassword?: string };
  UserForm: { userId?: string } | undefined;
  SitesList: undefined;
  SiteDetail: { siteId: string };
  SiteForm: { siteId?: string } | undefined;
  StandardsList: { siteId: string; siteName?: string };
  StandardForm: { siteId: string; standardId?: string };
  StandardDetail: { standardId: string };
  Timesheet: undefined;
  TimesheetValidation: undefined;
  TimesheetReject: { entryId: string };
  TimesheetRetroactive: undefined;
  TimeEntryDetail: { entryId: string };
  StaffHoursList: undefined;
  EmployeeHours: { userId: string; fullName: string };
  Reconciliation: undefined;
  ReconciliationDetail: { userId: string; fullName: string; from: string; to: string };
  MyAbsences: undefined;
  AbsenceForm: undefined;
  AbsencesManagement: undefined;
  ActivityLog: undefined;
  ProblemsList: undefined;
  ProblemDetail: { problemId: string };
  MissionDetail: { missionId: string };
  MissionForm: { missionId?: string } | undefined;
  JobSheetForm: { missionId: string };
  ReportProblem: { missionId: string };
  ContactProfile: { userId: string };
  StatsOverview: undefined;
  AnnouncementsList: undefined;
  AnnouncementDetail: { announcementId: string };
  AnnouncementForm: undefined;
  Legal: undefined;
};

const Stack = createNativeStackNavigator<MenuStackParamList>();

export function MenuStack() {
  const { colors } = useTheme();
  const { isDesktopWeb } = useResponsive();

  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.backgroundElevated },
        headerTintColor: colors.ink,
        headerShadowVisible: false,
        headerTitleStyle: { color: colors.ink },
        headerBackButtonDisplayMode: "minimal",
      }}
    >
      <Stack.Screen name="MenuHome" component={MenuScreen} options={{ title: isDesktopWeb ? "" : "Menu" }} />
      <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: isDesktopWeb ? "" : "Profil" }} />

      <Stack.Screen name="UsersList" component={UsersListScreen} options={{ title: isDesktopWeb ? "" : "Comptes" }} />
      <Stack.Screen name="UserDetail" component={UserDetailScreen} options={{ title: "Compte" }} />
      <Stack.Screen
        name="UserForm"
        component={UserFormScreen}
        options={({ route }) => ({
          title: route.params?.userId ? "Modifier le compte" : "Nouveau compte",
          presentation: "modal",
        })}
      />

      <Stack.Screen name="SitesList" component={SitesListScreen} options={{ title: isDesktopWeb ? "" : "Chantiers" }} />
      <Stack.Screen name="SiteDetail" component={SiteDetailScreen} options={{ title: "Chantier" }} />
      <Stack.Screen name="MissionDetail" component={MissionDetailScreen} options={{ title: "Mission" }} />
      <Stack.Screen
        name="MissionForm"
        component={MissionFormScreen}
        options={({ route }) => ({
          title: route.params?.missionId ? "Modifier la mission" : "Nouvelle mission",
          presentation: "modal",
        })}
      />
      <Stack.Screen
        name="JobSheetForm"
        component={JobSheetFormScreen}
        options={{ title: "Fiche de poste", presentation: "modal" }}
      />
      <Stack.Screen
        name="ReportProblem"
        component={ReportProblemScreen}
        options={{ title: "Signaler un problème", presentation: "modal" }}
      />
      <Stack.Screen name="ContactProfile" component={ContactProfileScreen} options={{ title: "Profil" }} />
      <Stack.Screen
        name="SiteForm"
        component={SiteFormScreen}
        options={({ route }) => ({
          title: route.params?.siteId ? "Modifier le chantier" : "Nouveau chantier",
          presentation: "modal",
        })}
      />
      <Stack.Screen
        name="StandardsList"
        component={StandardsListScreen}
        options={({ route }) => ({ title: route.params.siteName ?? "Standards de nettoyage" })}
      />
      <Stack.Screen
        name="StandardForm"
        component={StandardFormScreen}
        options={({ route }) => ({
          title: route.params.standardId ? "Modifier le standard" : "Nouveau standard",
          presentation: "modal",
        })}
      />
      <Stack.Screen name="StandardDetail" component={StandardDetailScreen} options={{ title: "Standard" }} />

      <Stack.Screen name="Timesheet" component={TimesheetScreen} options={{ title: "Pointage" }} />
      <Stack.Screen name="TimesheetValidation" component={TimesheetValidationScreen} options={{ title: "Validation des heures" }} />
      <Stack.Screen
        name="TimesheetReject"
        component={TimesheetRejectScreen}
        options={{ title: "Refuser le pointage", presentation: "modal" }}
      />
      <Stack.Screen
        name="TimesheetRetroactive"
        component={RetroactiveClockScreen}
        options={{ title: "Pointage différé", presentation: "modal" }}
      />
      <Stack.Screen name="TimeEntryDetail" component={TimeEntryDetailScreen} options={{ title: "Pointage" }} />
      <Stack.Screen name="StaffHoursList" component={StaffHoursListScreen} options={{ title: "Dossiers d'heures" }} />
      <Stack.Screen
        name="EmployeeHours"
        component={EmployeeHoursScreen}
        options={({ route }) => ({ title: route.params.fullName })}
      />
      <Stack.Screen name="Reconciliation" component={ReconciliationScreen} options={{ title: "Pointage vs mission" }} />
      <Stack.Screen
        name="ReconciliationDetail"
        component={ReconciliationDetailScreen}
        options={({ route }) => ({ title: route.params.fullName })}
      />

      <Stack.Screen name="MyAbsences" component={MyAbsencesScreen} options={{ title: "Mes absences" }} />
      <Stack.Screen
        name="AbsenceForm"
        component={AbsenceFormScreen}
        options={{ title: "Demander une absence", presentation: "modal" }}
      />
      <Stack.Screen name="AbsencesManagement" component={AbsencesManagementScreen} options={{ title: "Absences" }} />
      <Stack.Screen name="ActivityLog" component={ActivityLogScreen} options={{ title: "Journal d'activité" }} />

      <Stack.Screen name="ProblemsList" component={ProblemsListScreen} options={{ title: "Problèmes" }} />
      <Stack.Screen name="ProblemDetail" component={ProblemDetailScreen} options={{ title: "Signalement" }} />
      <Stack.Screen name="StatsOverview" component={StatsOverviewScreen} options={{ title: "Statistiques" }} />
      <Stack.Screen name="AnnouncementsList" component={AnnouncementsListScreen} options={{ title: "Actualités" }} />
      <Stack.Screen name="AnnouncementDetail" component={AnnouncementDetailScreen} options={{ title: "Actualité" }} />
      <Stack.Screen
        name="AnnouncementForm"
        component={AnnouncementFormScreen}
        options={{ title: "Nouvelle actualité", presentation: "modal" }}
      />
      <Stack.Screen name="Legal" component={LegalScreen} options={{ title: "Mentions légales" }} />
    </Stack.Navigator>
  );
}
