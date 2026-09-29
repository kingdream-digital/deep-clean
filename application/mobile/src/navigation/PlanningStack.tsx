import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useTheme } from "../theme/ThemeProvider";
import { PlanningScreen } from "../screens/missions/PlanningScreen";
import { MissionDetailScreen } from "../screens/missions/MissionDetailScreen";
import { MissionFormScreen } from "../screens/missions/MissionFormScreen";
import { JobSheetFormScreen } from "../screens/missions/JobSheetFormScreen";
import { ReportProblemScreen } from "../screens/missions/ReportProblemScreen";
import { ProblemDetailScreen } from "../screens/missions/ProblemDetailScreen";
import { StandardDetailScreen } from "../screens/sites/StandardDetailScreen";
import { ContactProfileScreen } from "../screens/inbox/ContactProfileScreen";

export type PlanningStackParamList = {
  // `day` (AAAA-MM-JJ) : permet d'ouvrir Planning directement sur un jour
  // précis (ex. depuis le mini-calendrier du tableau de bord), au lieu de
  // rester sur le dernier jour déjà sélectionné dans cet onglet.
  PlanningHome: { day?: string } | undefined;
  MissionDetail: { missionId: string };
  // `initialDate` (AAAA-MM-JJ) : pré-remplit la date du formulaire avec le
  // jour actuellement sélectionné dans le Planning, quand on crée une
  // mission depuis cet écran plutôt que depuis la liste des missions.
  MissionForm: { missionId?: string; initialDate?: string } | undefined;
  JobSheetForm: { missionId: string };
  ReportProblem: { missionId: string };
  ProblemDetail: { problemId: string };
  StandardDetail: { standardId: string };
  ContactProfile: { userId: string };
};

const Stack = createNativeStackNavigator<PlanningStackParamList>();

export function PlanningStack() {
  const { colors } = useTheme();

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
      <Stack.Screen name="ContactProfile" component={ContactProfileScreen} options={{ title: "Profil" }} />
    </Stack.Navigator>
  );
}
