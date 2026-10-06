import React, { useState } from "react";
import { Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { SegmentedControl } from "../../components/SegmentedControl";
import { PressableScale } from "../../components/PressableScale";
import { useTheme } from "../../theme/ThemeProvider";
import { NotificationsList } from "./NotificationsList";
import { ConversationsList } from "./ConversationsList";
import { OnboardingTarget } from "../../onboarding/OnboardingTarget";
import type { InboxStackParamList } from "../../navigation/InboxStack";

type Segment = "notifications" | "messages";

// Un seul onglet "Messagerie" regroupe Notifications et Messages directs
// sous un contrôle segmenté, plutôt que deux onglets séparés — pour ajouter
// une vraie messagerie interne sans surcharger la barre du bas (retour
// explicite du client : ne pas la rendre trop petite/chargée).
export function InboxHomeScreen() {
  const { colors, spacing, type } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<InboxStackParamList>>();
  const [segment, setSegment] = useState<Segment>("notifications");

  return (
    <ScreenContainer noHeader>
      <View style={{ paddingTop: spacing.lg, paddingBottom: spacing.sm }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={[type.largeTitle, { color: colors.ink }]}>
            {segment === "notifications" ? "Notifications" : "Messagerie"}
          </Text>
          {segment === "messages" && (
            <PressableScale onPress={() => navigation.navigate("NewMessage")} hitSlop={10} accessibilityRole="button" accessibilityLabel="Nouveau message">
              <Ionicons name="create-outline" size={26} color={colors.accent} />
            </PressableScale>
          )}
        </View>

        <OnboardingTarget id="inbox.segment" style={{ marginTop: spacing.md }}>
          <SegmentedControl
            value={segment}
            onChange={setSegment}
            options={[
              { label: "Notifications", value: "notifications" },
              { label: "Messages", value: "messages" },
            ]}
          />
        </OnboardingTarget>
      </View>

      {segment === "notifications" ? <NotificationsList /> : <ConversationsList />}
    </ScreenContainer>
  );
}
