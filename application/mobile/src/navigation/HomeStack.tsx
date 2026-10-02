import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useStackScreenOptions } from "./stackScreenOptions";
import { useResponsive } from "../hooks/useResponsive";
import { useAuth } from "../auth/AuthContext";
import { ABSENCES_MANAGEMENT_TITLE, MY_ABSENCES_TITLE, sitesListTitle, usersListTitle } from "./screenTitles";
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
import { UserDocumentsScreen } from "../screens/users/UserDocumentsScreen";
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
import { InvoicesListScreen } from "../screens/commercial/InvoicesListScreen";
import { InvoiceDetailScreen } from "../screens/commercial/InvoiceDetailScreen";
import { InvoiceFormScreen } from "../screens/commercial/InvoiceFormScreen";
import { EmployeeHoursScreen } from "../screens/timesheets/EmployeeHoursScreen";

export type HomeStackParamList = {
  Home: undefined;
  ProblemsList: undefined;
  ProblemDetail: { problemId: string };
  MissionDetail: { missionId: string };
  MissionForm: { missionId?: string; initialSiteId?: string } | undefined;
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
  UserDocuments: { userId: string; fullName: string };
  Timesheet: undefined;
  // `title` : titre de l'écran (« Octobre 2026 » quand on ouvre ses propres
  // heures) ; par défaut le nom de la personne.
  EmployeeHours: { userId: string; fullName: string; initialMonth?: string; title?: string };
  TimesheetValidation: undefined;
  TimesheetReject: { entryId: string };
  TimesheetRetroactive: undefined;
  TimeEntryDetail: { entryId: string };
  MyAbsences: undefined;
  AbsenceForm: undefined;
  AbsencesManagement: undefined;
  // Facturation (module commercial §29-33) — uniquement le bouton "Créer une
  // facture" depuis la fiche chantier (dupliqué ici comme SiteForm/MissionForm
  // ci-dessus, pour que ce bouton fonctionne quel que soit l'onglet d'où la
  // fiche chantier a été ouverte). Le reste du module commercial (prospects,
  // clients, devis) ne vit que dans MenuStack.
  InvoicesList: undefined;
  InvoiceDetail: { invoiceId: string };
  InvoiceForm: { invoiceId?: string; clientId?: string; quoteId?: string; siteId?: string } | undefined;
};

const Stack = createNativeStackNavigator<HomeStackParamList>();

export function HomeStack() {
  const screenOptions = useStackScreenOptions();
  // Sur desktop web, ces écrans affichent déjà leur propre en-tête (titre +
  // compteur + bouton) — un titre natif-stack en plus ferait doublon,
  // d'où ce titre vidé (la flèche retour, elle, reste toujours affichée).
  const { isDesktopWeb } = useResponsive();
  const { user } = useAuth();

  return (
    <Stack.Navigator
      screenOptions={screenOptions}
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

      <Stack.Screen name="SitesList" component={SitesListScreen} options={{ title: sitesListTitle(user?.role), headerTitle: isDesktopWeb ? "" : undefined }} />
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

      <Stack.Screen name="UsersList" component={UsersListScreen} options={{ title: usersListTitle(user?.role), headerTitle: isDesktopWeb ? "" : undefined }} />
      <Stack.Screen name="UserDetail" component={UserDetailScreen} options={{ title: "Compte" }} />
      <Stack.Screen
        name="UserDocuments"
        component={UserDocumentsScreen}
        options={({ route }) => ({ title: `Documents · ${route.params.fullName}` })}
      />
      <Stack.Screen
        name="UserForm"
        component={UserFormScreen}
        options={({ route }) => ({
          title: route.params?.userId ? "Modifier le compte" : "Nouveau compte",
          presentation: "modal",
        })}
      />

      <Stack.Screen name="Timesheet" component={TimesheetScreen} options={{ title: "Mes heures" }} />
      <Stack.Screen
        name="EmployeeHours"
        component={EmployeeHoursScreen}
        options={({ route }) => ({ title: route.params.title ?? route.params.fullName })}
      />
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

      <Stack.Screen name="MyAbsences" component={MyAbsencesScreen} options={{ title: MY_ABSENCES_TITLE }} />
      <Stack.Screen
        name="AbsenceForm"
        component={AbsenceFormScreen}
        options={{ title: "Demander une absence", presentation: "modal" }}
      />
      <Stack.Screen name="AbsencesManagement" component={AbsencesManagementScreen} options={{ title: ABSENCES_MANAGEMENT_TITLE }} />

      <Stack.Screen name="InvoicesList" component={InvoicesListScreen} options={{ title: "Factures" }} />
      <Stack.Screen name="InvoiceDetail" component={InvoiceDetailScreen} options={{ title: "Facture" }} />
      <Stack.Screen
        name="InvoiceForm"
        component={InvoiceFormScreen}
        options={({ route }) => ({
          title: route.params?.invoiceId ? "Modifier la facture" : "Nouvelle facture",
          presentation: "modal",
        })}
      />
    </Stack.Navigator>
  );
}
