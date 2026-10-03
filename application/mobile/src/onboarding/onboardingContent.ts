import { Ionicons } from "@expo/vector-icons";
import type { Role } from "../api/auth.api";
import type { AppTabsParamList } from "../navigation/appTabsShared";

export interface OnboardingStep {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  // Si renseigné, le tutoriel navigue réellement vers cet onglet (et cet
  // écran initial) avant d'afficher l'étape — c'est ce qui rend la visite
  // immersive : l'utilisateur voit le VRAI écran, pas une image dessus.
  tab?: keyof AppTabsParamList;
  screen?: string;
  // Identifiant d'un <OnboardingTarget> réel à mettre en surbrillance (voir
  // OnboardingTarget.tsx). Absent = carte centrée, sans élément ciblé
  // (utilisé pour l'accueil et la conclusion du tutoriel).
  targetId?: string;
}

const WELCOME: OnboardingStep = {
  icon: "sparkles-outline",
  title: "Bienvenue sur Deep Clean",
  body: "On vous fait faire un vrai tour de l'application, écran par écran. Vous pourrez le revoir à tout moment depuis Menu → Mon profil.",
  tab: "Accueil",
  screen: "Home",
};

const CLOCK: OnboardingStep = {
  icon: "time-outline",
  title: "Pointez vos heures",
  body: "Ce bouton est toujours accessible depuis l'Accueil : pointez votre arrivée et votre départ en un geste, où que vous soyez dans l'app.",
  tab: "Accueil",
  screen: "Home",
  targetId: "home.clock",
};

const QUICK_ACCESS: OnboardingStep = {
  icon: "flash-outline",
  title: "Accès rapide",
  body: "Cette liste s'adapte à votre rôle : elle regroupe les outils que vous utiliserez le plus souvent.",
  tab: "Accueil",
  screen: "Home",
  targetId: "home.quickAccess",
};

const PLANNING: OnboardingStep = {
  icon: "calendar-outline",
  title: "Votre planning",
  body: "Naviguez de semaine en semaine avec les flèches, puis touchez un jour pour voir le détail des missions prévues.",
  tab: "Planning",
  screen: "PlanningHome",
  targetId: "planning.week",
};

const MISSIONS: OnboardingStep = {
  icon: "briefcase-outline",
  title: "Vos missions",
  body: "À venir, à valider, validées ou annulées : choisissez un onglet, puis touchez une mission pour son détail complet.",
  tab: "Missions",
  screen: "MissionsList",
  targetId: "missions.filters",
};

const MESSAGERIE: OnboardingStep = {
  icon: "chatbubbles-outline",
  title: "Notifications et messages",
  body: "Notifications d'un côté, conversations de l'autre : messages à un collègue ou groupes d'équipe, avec photos et documents. Le badge rouge compte ce qu'il reste à lire.",
  tab: "Messagerie",
  targetId: "inbox.segment",
};

const ABSENCES: OnboardingStep = {
  icon: "calendar-outline",
  tab: "Menu",
  screen: "MenuHome",
  title: "Congés et absences",
  body: "Depuis Menu → Mes absences, demandez un congé en quelques secondes. Vous voyez votre solde restant et la réponse arrive en notification.",
  targetId: "menu.MyAbsences",
};

// Création des missions : réservée à ceux qui gèrent le planning
// (superviseur, RH, direction, admin). Cible le bouton « + » du Planning.
const CREATE_MISSION: OnboardingStep = {
  icon: "add-circle-outline",
  tab: "Planning",
  screen: "PlanningHome",
  title: "Créer une mission",
  body: "Ce bouton crée une mission sur le jour affiché : chantier, horaires, équipe et consignes. Chaque personne affectée est prévenue aussitôt, et à chaque modification.",
  targetId: "planning.create",
};

function menuStep(step: Omit<OnboardingStep, "tab" | "screen">): OnboardingStep {
  return { ...step, tab: "Menu", screen: "MenuHome" };
}

const CLOSING_BASE = {
  icon: "checkmark-circle-outline" as const,
  tab: "Accueil" as const,
  screen: "Home",
};

const ROLE_STEPS: Record<Role, OnboardingStep[]> = {
  EMPLOYEE: [
    WELCOME,
    CLOCK,
    QUICK_ACCESS,
    PLANNING,
    MISSIONS,
    MESSAGERIE,
    menuStep({
      icon: "warning-outline",
      title: "Signaler un problème",
      body: "Sur place, ouvrez la mission et touchez « Signaler un problème » : décrivez, ajoutez des photos, envoyez. Ici, dans Signalements, vous suivez ensuite son traitement.",
      targetId: "menu.ProblemsList",
    }),
    ABSENCES,
    {
      ...CLOSING_BASE,
      title: "Tout est prêt",
      body: "Pour tout problème de connexion ou de compte, contactez la RH. Retrouvez ce tutoriel à tout moment depuis Menu → Mon profil.",
    },
  ],
  SITE_MANAGER: [
    WELCOME,
    CLOCK,
    QUICK_ACCESS,
    PLANNING,
    MISSIONS,
    MESSAGERIE,
    menuStep({
      icon: "checkmark-done-outline",
      title: "Validation des heures",
      body: "Depuis Menu → Validation des heures, vérifiez les pointages de votre équipe. Sur le terrain, vous démarrez et terminez les missions, puis validez celles de vos chantiers.",
      targetId: "menu.TimesheetValidation",
    }),
    menuStep({
      icon: "warning-outline",
      title: "Problèmes sur vos chantiers",
      body: "Tous les signalements de vos chantiers arrivent ici, photos comprises. Faites-les avancer : nouveau, en cours, traité.",
      targetId: "menu.ProblemsList",
    }),
    ABSENCES,
    {
      ...CLOSING_BASE,
      title: "Tout est prêt",
      body: "Pour tout problème de connexion ou de compte, contactez la RH. Retrouvez ce tutoriel à tout moment depuis Menu → Mon profil.",
    },
  ],
  SUPERVISOR: [
    WELCOME,
    CLOCK,
    QUICK_ACCESS,
    PLANNING,
    MISSIONS,
    MESSAGERIE,
    CREATE_MISSION,
    menuStep({
      icon: "checkmark-done-outline",
      title: "Validation des heures",
      body: "Chaque pointage passe par vous avant la RH. Validez d'un geste ce qui concorde, refusez avec un motif ce qui ne va pas.",
      targetId: "menu.TimesheetValidation",
    }),
    menuStep({
      icon: "calendar-number-outline",
      title: "Validation des congés",
      body: "Depuis Menu → Validation des congés, approuvez ou refusez les demandes de toute l'équipe. Le salarié reçoit votre réponse immédiatement.",
      targetId: "menu.AbsencesManagement",
    }),
    {
      ...CLOSING_BASE,
      title: "Tout est prêt",
      body: "Pour tout problème de connexion ou de compte, contactez la RH. Retrouvez ce tutoriel à tout moment depuis Menu → Mon profil.",
    },
  ],
  HR: [
    WELCOME,
    CLOCK,
    QUICK_ACCESS,
    PLANNING,
    MISSIONS,
    MESSAGERIE,
    CREATE_MISSION,
    menuStep({
      icon: "person-add-outline",
      title: "Comptes utilisateurs",
      body: "Depuis Menu → Comptes utilisateurs : vous êtes la seule personne à créer les comptes et à attribuer les rôles, et vous pouvez activer, désactiver ou réinitialiser l'accès de chacun.",
      targetId: "menu.UsersList",
    }),
    {
      ...CLOSING_BASE,
      title: "Tout est prêt",
      body: "Vous êtes le point de contact pour tout problème de connexion ou de compte d'un collaborateur. Retrouvez ce tutoriel à tout moment depuis Menu → Mon profil.",
    },
  ],
  DIRECTOR: [
    WELCOME,
    CLOCK,
    QUICK_ACCESS,
    PLANNING,
    MISSIONS,
    MESSAGERIE,
    CREATE_MISSION,
    menuStep({
      icon: "stats-chart-outline",
      title: "Statistiques",
      body: "Depuis Menu → Statistiques, suivez l'activité de toute l'entreprise. Vous avez la main sur tout : planning, heures, congés, chantiers et comptes existants. Seule la création de comptes reste à la RH.",
      targetId: "menu.StatsOverview",
    }),
    {
      ...CLOSING_BASE,
      title: "Tout est prêt",
      body: "Pour tout problème de connexion ou de compte, contactez la RH. Retrouvez ce tutoriel à tout moment depuis Menu → Mon profil.",
    },
  ],
  ADMIN: [
    WELCOME,
    CLOCK,
    QUICK_ACCESS,
    PLANNING,
    MISSIONS,
    MESSAGERIE,
    menuStep({
      icon: "people-outline",
      title: "Comptes",
      body: "Depuis Menu → Comptes, gestion technique des comptes en appui de la RH.",
      targetId: "menu.UsersList",
    }),
    {
      ...CLOSING_BASE,
      title: "Tout est prêt",
      body: "Pour un problème de compte, la RH reste le premier contact. Retrouvez ce tutoriel à tout moment depuis Menu → Mon profil.",
    },
  ],
};

export function getOnboardingSteps(role: Role): OnboardingStep[] {
  return ROLE_STEPS[role];
}
