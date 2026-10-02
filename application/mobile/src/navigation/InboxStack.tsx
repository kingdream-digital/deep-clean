import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useStackScreenOptions } from "./stackScreenOptions";
import { InboxHomeScreen } from "../screens/inbox/InboxHomeScreen";
import { MY_ABSENCES_TITLE } from "./screenTitles";
import { ConversationThreadScreen } from "../screens/inbox/ConversationThreadScreen";
import { ContactProfileScreen } from "../screens/inbox/ContactProfileScreen";
import { NewMessageScreen } from "../screens/inbox/NewMessageScreen";
import { NewGroupScreen } from "../screens/inbox/NewGroupScreen";
import { ConversationInfoScreen } from "../screens/inbox/ConversationInfoScreen";
import { AddParticipantsScreen } from "../screens/inbox/AddParticipantsScreen";
import { RenameGroupScreen } from "../screens/inbox/RenameGroupScreen";
import { MissionDetailScreen } from "../screens/missions/MissionDetailScreen";
import { MissionFormScreen } from "../screens/missions/MissionFormScreen";
import { JobSheetFormScreen } from "../screens/missions/JobSheetFormScreen";
import { ReportProblemScreen } from "../screens/missions/ReportProblemScreen";
import { ProblemDetailScreen } from "../screens/missions/ProblemDetailScreen";
import { TimeEntryDetailScreen } from "../screens/timesheets/TimeEntryDetailScreen";
import { StandardDetailScreen } from "../screens/sites/StandardDetailScreen";
import { StandardFormScreen } from "../screens/sites/StandardFormScreen";
import { MyAbsencesScreen } from "../screens/absences/MyAbsencesScreen";
import { AbsenceFormScreen } from "../screens/absences/AbsenceFormScreen";
import { UserDetailScreen } from "../screens/users/UserDetailScreen";
import { UserFormScreen } from "../screens/users/UserFormScreen";
import { AnnouncementDetailScreen } from "../screens/announcements/AnnouncementDetailScreen";

// Un seul onglet "Messagerie" pour Notifications + Messages directs (voir
// InboxHomeScreen) — les écrans de détail de mission/pointage/standard sont
// dupliqués ici depuis MissionsStack/PlanningStack (même convention déjà en
// place) pour qu'une notification ou un message pousse son détail SUR cette
// pile plutôt que de changer d'onglet, avec une vraie flèche retour native.
export type InboxStackParamList = {
  InboxHome: undefined;
  // Un fil s'ouvre soit par son identifiant (liste, notification), soit par
  // la personne avec qui discuter (fiche contact, équipe d'une mission) — le
  // fil à deux est alors récupéré ou créé à l'ouverture.
  ConversationThread: { conversationId: string } | { userId: string };
  ConversationInfo: { conversationId: string };
  AddParticipants: { conversationId: string };
  RenameGroup: { conversationId: string; currentTitle: string };
  ContactProfile: { userId: string };
  NewMessage: undefined;
  NewGroup: undefined;
  MissionDetail: { missionId: string };
  MissionForm: { missionId?: string } | undefined;
  JobSheetForm: { missionId: string };
  ReportProblem: { missionId: string };
  ProblemDetail: { problemId: string };
  TimeEntryDetail: { entryId: string };
  StandardDetail: { standardId: string };
  StandardForm: { siteId: string; standardId?: string };
  // Ajoutés (audit notifications) : ABSENCE_DECIDED pointe vers relatedEntityType
  // "Absence", qui n'avait aucun écran cible sur cette pile jusqu'ici — la
  // notification ne menait nulle part. AbsenceForm est dupliqué en plus de
  // MyAbsences car ce dernier navigue lui-même vers "AbsenceForm" en interne
  // (bouton "Demander une absence"), même convention que les autres écrans
  // dupliqués ci-dessus.
  MyAbsences: undefined;
  // Absence enregistrée par un responsable POUR quelqu'un (ex. arrêt maladie
  // annoncé par téléphone, saisi depuis le planning) : `userId`/`fullName`
  // de la personne, `initialDate` (AAAA-MM-JJ) pour démarrer sur le jour choisi.
  AbsenceForm: { userId?: string; fullName?: string; initialDate?: string } | undefined;
  // ABSENCE_REQUESTED (RH/direction/admin, retour explicite du client) doit
  // amener sur la fiche de l'employé pour décider — jamais "Mes absences",
  // qui n'a de sens que pour l'intéressé lui-même. UserForm est dupliqué en
  // plus car UserDetail y navigue elle-même ("Modifier le compte").
  UserDetail: { userId: string; temporaryPassword?: string };
  UserForm: { userId?: string } | undefined;
  // ANNOUNCEMENT_POSTED (retour explicite du client) doit amener directement
  // sur l'actualité concernée.
  AnnouncementDetail: { announcementId: string };
};

const Stack = createNativeStackNavigator<InboxStackParamList>();

export function InboxStack() {
  const screenOptions = useStackScreenOptions();

  return (
    <Stack.Navigator
      screenOptions={screenOptions}
    >
      <Stack.Screen name="InboxHome" component={InboxHomeScreen} options={{ headerShown: false }} />
      <Stack.Screen name="ConversationThread" component={ConversationThreadScreen} options={{ title: "" }} />
      <Stack.Screen name="ConversationInfo" component={ConversationInfoScreen} options={{ title: "Infos" }} />
      <Stack.Screen
        name="AddParticipants"
        component={AddParticipantsScreen}
        options={{ title: "Ajouter des participants", presentation: "modal" }}
      />
      <Stack.Screen
        name="RenameGroup"
        component={RenameGroupScreen}
        options={{ title: "Renommer le groupe", presentation: "modal" }}
      />
      <Stack.Screen name="ContactProfile" component={ContactProfileScreen} options={{ title: "Profil" }} />
      <Stack.Screen
        name="NewMessage"
        component={NewMessageScreen}
        options={{ title: "Nouveau message", presentation: "modal" }}
      />
      <Stack.Screen
        name="NewGroup"
        component={NewGroupScreen}
        options={{ title: "Nouveau groupe", presentation: "modal" }}
      />
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
      <Stack.Screen name="ProblemDetail" component={ProblemDetailScreen} options={{ title: "Signalement" }} />
      <Stack.Screen name="TimeEntryDetail" component={TimeEntryDetailScreen} options={{ title: "Pointage" }} />
      <Stack.Screen name="StandardDetail" component={StandardDetailScreen} options={{ title: "Standard" }} />
      <Stack.Screen
        name="StandardForm"
        component={StandardFormScreen}
        options={({ route }) => ({
          title: route.params.standardId ? "Modifier le standard" : "Nouveau standard",
          presentation: "modal",
        })}
      />
      <Stack.Screen name="MyAbsences" component={MyAbsencesScreen} options={{ title: MY_ABSENCES_TITLE }} />
      <Stack.Screen
        name="AbsenceForm"
        component={AbsenceFormScreen}
        options={({ route }) => ({ title: route.params?.fullName ? "Enregistrer une absence" : "Demander une absence", presentation: "modal" })}
      />
      <Stack.Screen name="UserDetail" component={UserDetailScreen} options={{ title: "Compte" }} />
      <Stack.Screen
        name="UserForm"
        component={UserFormScreen}
        options={({ route }) => ({
          title: route.params?.userId ? "Modifier le compte" : "Nouveau compte",
          presentation: "modal",
        })}
      />
      <Stack.Screen name="AnnouncementDetail" component={AnnouncementDetailScreen} options={{ title: "Actualité" }} />
    </Stack.Navigator>
  );
}
