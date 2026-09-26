import React from "react";
import { ScrollView } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { ScreenContainer } from "../../components/ScreenContainer";
import { ChangePasswordForm } from "../../components/ChangePasswordForm";

export function ChangePasswordScreen() {
  const navigation = useNavigation();

  return (
    <ScreenContainer avoidKeyboard style={{ paddingTop: 16 }}>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <ChangePasswordForm onSuccess={() => navigation.goBack()} />
      </ScrollView>
    </ScreenContainer>
  );
}
