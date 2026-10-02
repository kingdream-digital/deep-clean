import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useStackScreenOptions } from "./stackScreenOptions";
import { PlanningScreen } from "../screens/missions/PlanningScreen";
import { MissionDetailScreen } from "../screens/missions/MissionDetailScreen";
import { MissionFormScreen } from "../screens/missions/MissionFormScreen";
import { JobSheetFormScreen } from "../screens/missions/JobSheetFormScreen";
import { ReportProblemScreen } from "../screens/missions/ReportProblemScreen";
import { ProblemDetailScreen } from "../screens/missions/ProblemDetailScreen";
import { StandardDetailScreen } from "../screens/sites/StandardDetailScreen";
import { StandardFormScreen } from "../screens/sites/StandardFormScreen";
import { ContactProfileScreen } from "../screens/inbox/ContactProfileScreen";
import { AbsenceFormScreen } from "../screens/absences/AbsenceFormScreen";

export type PlanningStackParamList = {
  // `day` (AAAA-MM-JJ) : permet d'ouvrir Planning directement sur un jour
  // précis (ex. depuis le mini-calendrier du tableau de bord), au lieu de
  // rester sur le dernier jour déjà sélectionné dans cet onglet.
  PlanningHome: { day?: string } | undefined;
  MissionDetail: { missionId: string };
  // `initialDate` (AAAA-MM-JJ) : pré-remplit la date du formulaire avec le
  // jour actuellement sélectionné dans le Planning, quand on crée une
  // mission depuis cet écran plutôt que depuis la liste des missions.
  MissionForm: { missionId?: string; initialDate?: string; initialAssigneeId?: string } | undefined;
  JobSheetForm: { missionId: string };
  ReportProblem: { missionId: string };
  ProblemDetail: { problemId: string };
  StandardDetail: { standardId: string };
  StandardForm: { siteId: string; standardId?: string };
  ContactProfile: { userId: string };
  // Absence enregistrée par un responsable POUR quelqu'un (ex. arrêt maladie
  // annoncé par téléphone, saisi depuis le planning) : `userId`/`fullName`
  // de la personne, `initialDate` (AAAA-MM-JJ) pour démarrer sur le jour choisi.
  AbsenceForm: { userId?: string; fullName?: string; initialDate?: string } | undefined;
};

const Stack = createNativeStackNavigator<PlanningStackParamList>();

export function PlanningStack() {
  const screenOptions = useStackScreenOptions();

  return (
    <Stack.Navigator
      screenOptions={screenOptions}
    >
      <Stack.Screen name="PlanningHome" component={PlanningScreen} options={{ title: "Planning" }} />
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
      <Stack.Screen name="StandardDetail" component={StandardDetailScreen} options={{ title: "Standard" }} />
      <Stack.Screen
        name="StandardForm"
        component={StandardFormScreen}
        options={({ route }) => ({
          title: route.params.standardId ? "Modifier le standard" : "Nouveau standard",
          presentation: "modal",
        })}
      />
      <Stack.Screen name="ContactProfile" component={ContactProfileScreen} options={{ title: "Profil" }} />
      <Stack.Screen
        name="AbsenceForm"
        component={AbsenceFormScreen}
        options={({ route }) => ({ title: route.params?.fullName ? "Enregistrer une absence" : "Demander une absence", presentation: "modal" })}
      />
    </Stack.Navigator>
  );
}
