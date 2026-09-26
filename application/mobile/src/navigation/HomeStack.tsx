import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useTheme } from "../theme/ThemeProvider";
import { useResponsive } from "../hooks/useResponsive";
import { HomeScreen } from "../screens/dashboard/HomeScreen";
import { ProblemsListScreen } from "../screens/problems/ProblemsListScreen";
import { ProblemDetailScreen } from "../screens/missions/ProblemDetailScreen";
import { MissionDetailScreen } from "../screens/missions/MissionDetailScreen";
import { MissionFormScreen } from "../screens/missions/MissionFormScreen";
import { JobSheetFormScreen } from "../screens/missions/JobSheetFormScreen";
import { ReportProblemScreen } from "../screens/missions/ReportProblemScreen";
import { ContactProfileScreen } from "../screens/inbox/ContactProfileScreen";
import { StatsOverviewScreen } from "../screens/stats/StatsOverviewScreen";
import { SitesListScreen } from "../screens/sites/SitesListScreen";
import { SiteDetailScreen } from "../screens/sites/SiteDetailScreen";
import { SiteFormScreen } from "../screens/sites/SiteFormScreen";
import { StandardsListScreen } from "../screens/sites/StandardsListScreen";
import { StandardFormScreen } from "../screens/sites/StandardFormScreen";
import { StandardDetailScreen } from "../screens/sites/StandardDetailScreen";
import { UsersListScreen } from "../screens/users/UsersListScreen";
import { UserDetailScreen } from "../screens/users/UserDetailScreen";
import { UserFormScreen } from "../screens/users/UserFormScreen";
import { TimesheetScreen } from "../screens/timesheets/TimesheetScreen";
import { TimesheetValidationScreen } from "../screens/timesheets/TimesheetValidationScreen";
import { TimesheetRejectScreen } from "../screens/timesheets/TimesheetRejectScreen";
import { RetroactiveClockScreen } from "../screens/timesheets/RetroactiveClockScreen";
import { TimeEntryDetailScreen } from "../screens/timesheets/TimeEntryDetailScreen";
import { MyAbsencesScreen } from "../screens/absences/MyAbsencesScreen";
import { AbsenceFormScreen } from "../screens/absences/AbsenceFormScreen";
import { AbsencesManagementScreen } from "../screens/absences/AbsencesManagementScreen";
import { AnnouncementsListScreen } from "../screens/announcements/AnnouncementsListScreen";
import { AnnouncementDetailScreen } from "../screens/announcements/AnnouncementDetailScreen";
import { AnnouncementFormScreen } from "../screens/announcements/AnnouncementFormScreen";

export type HomeStackParamList = {
  Home: undefined;
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
  SitesList: undefined;
  SiteDetail: { siteId: string };
  SiteForm: { siteId?: string } | undefined;
  StandardsList: { siteId: string; siteName?: string };
  StandardForm: { siteId: string; standardId?: string };
  StandardDetail: { standardId: string };
  UsersList: undefined;
  UserDetail: { userId: string; temporaryPassword?: string };
  UserForm: { userId?: string } | undefined;
  Timesheet: undefined;
  TimesheetValidation: undefined;
  TimesheetReject: { entryId: string };
  TimesheetRetroactive: undefined;
  TimeEntryDetail: { entryId: string };
  MyAbsences: undefined;
  AbsenceForm: undefined;
  AbsencesManagement: undefined;
};

const Stack = createNativeStackNavigator<HomeStackParamList>();

export function HomeStack() {
  const { colors } = useTheme();
  // Sur desktop web, ces écrans affichent déjà leur propre en-tête (titre +
  // compteur + bouton) — un titre natif-stack en plus ferait doublon,
  // d'où ce titre vidé (la flèche retour, elle, reste toujours affichée).
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
      <Stack.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
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

      <Stack.Screen name="MyAbsences" component={MyAbsencesScreen} options={{ title: "Mes absences" }} />
      <Stack.Screen
        name="AbsenceForm"
        component={AbsenceFormScreen}
        options={{ title: "Demander une absence", presentation: "modal" }}
      />
      <Stack.Screen name="AbsencesManagement" component={AbsencesManagementScreen} options={{ title: "Absences" }} />
    </Stack.Navigator>
  );
}
