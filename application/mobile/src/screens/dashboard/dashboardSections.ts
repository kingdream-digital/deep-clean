import { Ionicons } from "@expo/vector-icons";
import type { Role } from "../../api/auth.api";
import type { AppTabsParamList } from "../../navigation/AppTabs";
import type { HomeStackParamList } from "../../navigation/HomeStack";
import { sitesListTitle, usersListTitle } from "../../navigation/screenTitles";

export type DashboardSectionTone = "accent" | "info" | "warning" | "danger" | "success" | "neutral" | "purple";

export interface DashboardSection {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  /** Ouvre un écran de la pile Accueil. */
  screen?: Exclude<keyof HomeStackParamList, "Home">;
  /** Ouvre directement un autre onglet (Planning, Missions...). */
  tab?: keyof AppTabsParamList;
  /** Teinte du chip d'icône — cohérente par module plutôt qu'un accent unique répété partout. */
  tone?: DashboardSectionTone;
}

// Chaque entrée mène désormais à un écran réel ou à un onglet existant —
// jamais de carte "Bientôt disponible" : mieux vaut une liste plus courte
// et entièrement fonctionnelle qu'une fausse fonctionnalité (cahier des
// charges, section 27). Planning et Missions n'y figurent plus : ce sont
// déjà des onglets, toujours visibles en bas de l'écran — les répéter ici
// allongeait la page pour deux raccourcis vers ce qui est déjà à un doigt.
export const DASHBOARD_SECTIONS: Record<Role, DashboardSection[]> = {
  EMPLOYEE: [
    { icon: "time-outline", label: "Mes heures", screen: "Timesheet", tone: "purple" },
    { icon: "megaphone-outline", label: "Actualités", screen: "AnnouncementsList", tone: "purple" },
    { icon: "warning-outline", label: "Mes signalements", screen: "ProblemsList", tone: "danger" },
  ],
  SITE_MANAGER: [
    { icon: "time-outline", label: "Mes heures", screen: "Timesheet", tone: "purple" },
    { icon: "business-outline", label: sitesListTitle("SITE_MANAGER"), screen: "SitesList", tone: "warning" },
    { icon: "people-outline", label: usersListTitle("SITE_MANAGER"), screen: "UsersList", tone: "info" },
    { icon: "megaphone-outline", label: "Actualités", screen: "AnnouncementsList", tone: "purple" },
    { icon: "warning-outline", label: "Problèmes", screen: "ProblemsList", tone: "danger" },
  ],
  SUPERVISOR: [
    { icon: "time-outline", label: "Mes heures", screen: "Timesheet", tone: "purple" },
    { icon: "checkmark-done-outline", label: "Validation des heures", screen: "TimesheetValidation", tone: "success" },
    { icon: "business-outline", label: "Chantiers", screen: "SitesList", tone: "warning" },
    { icon: "megaphone-outline", label: "Actualités", screen: "AnnouncementsList", tone: "purple" },
    { icon: "warning-outline", label: "Problèmes", screen: "ProblemsList", tone: "danger" },
  ],
  HR: [
    { icon: "time-outline", label: "Mes heures", screen: "Timesheet", tone: "purple" },
    { icon: "person-add-outline", label: "Comptes utilisateurs", screen: "UsersList", tone: "success" },
    { icon: "business-outline", label: "Chantiers", screen: "SitesList", tone: "warning" },
    { icon: "megaphone-outline", label: "Actualités", screen: "AnnouncementsList", tone: "purple" },
    { icon: "warning-outline", label: "Problèmes", screen: "ProblemsList", tone: "danger" },
  ],
  DIRECTOR: [
    { icon: "time-outline", label: "Mes heures", screen: "Timesheet", tone: "purple" },
    { icon: "business-outline", label: "Chantiers", screen: "SitesList", tone: "warning" },
    { icon: "people-outline", label: "Comptes utilisateurs", screen: "UsersList", tone: "info" },
    { icon: "megaphone-outline", label: "Actualités", screen: "AnnouncementsList", tone: "purple" },
    { icon: "warning-outline", label: "Problèmes", screen: "ProblemsList", tone: "danger" },
    { icon: "stats-chart-outline", label: "Statistiques", screen: "StatsOverview", tone: "info" },
  ],
  ADMIN: [
    { icon: "time-outline", label: "Mes heures", screen: "Timesheet", tone: "purple" },
    { icon: "people-outline", label: "Comptes", screen: "UsersList", tone: "info" },
    { icon: "business-outline", label: "Chantiers", screen: "SitesList", tone: "warning" },
    { icon: "megaphone-outline", label: "Actualités", screen: "AnnouncementsList", tone: "purple" },
  ],
};
