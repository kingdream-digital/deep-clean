import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useStackScreenOptions } from "./stackScreenOptions";
import { useResponsive } from "../hooks/useResponsive";
import { MissionsListScreen } from "../screens/missions/MissionsListScreen";
import { MissionDetailScreen } from "../screens/missions/MissionDetailScreen";
import { MissionFormScreen } from "../screens/missions/MissionFormScreen";
import { JobSheetFormScreen } from "../screens/missions/JobSheetFormScreen";
import { ReportProblemScreen } from "../screens/missions/ReportProblemScreen";
import { ProblemDetailScreen } from "../screens/missions/ProblemDetailScreen";
import { StandardDetailScreen } from "../screens/sites/StandardDetailScreen";
import { ContactProfileScreen } from "../screens/inbox/ContactProfileScreen";
import { TimeEntryDetailScreen } from "../screens/timesheets/TimeEntryDetailScreen";

export type MissionsStackParamList = {
  MissionsList: undefined;
  MissionDetail: { missionId: string };
  MissionForm: { missionId?: string } | undefined;
  JobSheetForm: { missionId: string };
  ReportProblem: { missionId: string };
  ProblemDetail: { problemId: string };
  StandardDetail: { standardId: string };
  ContactProfile: { userId: string };
  TimeEntryDetail: { entryId: string };
};

const Stack = createNativeStackNavigator<MissionsStackParamList>();

export function MissionsStack() {
  const screenOptions = useStackScreenOptions();
  const { isDesktopWeb } = useResponsive();

  return (
    <Stack.Navigator
      screenOptions={screenOptions}
    >
      <Stack.Screen name="MissionsList" component={MissionsListScreen} options={{ title: isDesktopWeb ? "" : "Missions" }} />
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
      <Stack.Screen name="TimeEntryDetail" component={TimeEntryDetailScreen} options={{ title: "Pointage" }} />
    </Stack.Navigator>
  );
}
