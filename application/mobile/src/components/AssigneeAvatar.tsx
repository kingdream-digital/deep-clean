import React from "react";
import { Text, View } from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import { AuthenticatedImage } from "./AuthenticatedImage";
import type { MissionAssignee } from "../api/missions.api";
import { avatarUrl } from "../api/users.api";

interface AssigneeAvatarProps {
  assignee: MissionAssignee;
  size: number;
}

export function AssigneeAvatar({ assignee, size }: AssigneeAvatarProps) {
  const { colors, radius } = useTheme();
  const initials = `${assignee.user.firstName[0] ?? ""}${assignee.user.lastName[0] ?? ""}`.toUpperCase();
  if (assignee.user.hasAvatar) {
    return (
      <AuthenticatedImage
        uri={avatarUrl(assignee.user.id)}
        style={{ width: size, height: size, borderRadius: radius.pill }}
      />
    );
  }
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius.pill,
        backgroundColor: colors.accentSoft,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ fontSize: size * 0.4, fontWeight: "600", color: colors.accent }}>{initials}</Text>
    </View>
  );
}
