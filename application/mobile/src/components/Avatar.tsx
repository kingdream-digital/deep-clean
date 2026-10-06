import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeProvider";
import { AuthenticatedImage } from "./AuthenticatedImage";
import { avatarUrl } from "../api/users.api";
import type { Palette } from "../theme/colors";

interface AvatarUser {
  id: string;
  firstName: string;
  lastName: string;
  hasAvatar?: boolean;
}

// Teinte stable par personne (même principe que utils/siteColor.ts pour les
// chantiers) : deux collègues sans photo ne se ressemblent jamais dans une
// liste, et la même personne garde toujours la même couleur d'un écran à
// l'autre — jamais une pastille grise uniforme, ni une couleur aléatoire.
function initialsColor(userId: string, colors: Palette): { fg: string; bg: string } {
  const palette = [
    { fg: colors.accentText, bg: colors.accentSoft },
    { fg: colors.info, bg: colors.infoSoft },
    { fg: colors.purple, bg: colors.purpleSoft },
    { fg: colors.success, bg: colors.successSoft },
    { fg: colors.warning, bg: colors.warningSoft },
  ];
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  return palette[hash % palette.length]!;
}

export function initialsOf(user: { firstName: string; lastName: string }): string {
  return `${user.firstName[0] ?? ""}${user.lastName[0] ?? ""}`.toUpperCase();
}

interface AvatarProps {
  user: AvatarUser;
  size?: number;
  /** Liseré autour de la pastille, pour les avatars superposés d'un groupe. */
  ring?: boolean;
}

/**
 * Photo de profil si la personne en a une, initiales colorées sinon. Source
 * unique pour toute l'application : la photo n'est jamais servie par une URL
 * publique, chaque affichage repasse par une requête authentifiée.
 */
export function Avatar({ user, size = 44, ring = false }: AvatarProps) {
  const { colors, radius, type } = useTheme();
  const tint = initialsColor(user.id, colors);

  const frame = {
    width: size,
    height: size,
    borderRadius: radius.pill,
    ...(ring ? { borderWidth: 2, borderColor: colors.backgroundElevated } : {}),
  };

  if (user.hasAvatar) {
    return <AuthenticatedImage uri={avatarUrl(user.id)} style={[frame, { backgroundColor: colors.surfaceAlt }]} />;
  }

  return (
    <View style={[frame, { backgroundColor: tint.bg, alignItems: "center", justifyContent: "center" }]}>
      <Text style={[type.caption, { color: tint.fg, fontSize: size * 0.36, lineHeight: size * 0.44, fontWeight: "700" }]}>
        {initialsOf(user)}
      </Text>
    </View>
  );
}

interface GroupAvatarProps {
  participants: AvatarUser[];
  size?: number;
}

/**
 * Pastille d'un groupe : les deux premiers membres en avatars superposés,
 * qui donnent tout de suite à voir « plusieurs personnes » là où une icône
 * générique ne distinguerait aucun groupe d'un autre.
 */
export function GroupAvatar({ participants, size = 44 }: GroupAvatarProps) {
  const { colors, radius } = useTheme();
  const shown = participants.slice(0, 2);
  const inner = size * 0.68;

  if (shown.length === 0) {
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
        <Ionicons name="people" size={size * 0.5} color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={{ width: size, height: size }}>
      <View style={[styles.corner, { top: 0, right: 0 }]}>
        <Avatar user={shown[0]!} size={inner} ring />
      </View>
      <View style={[styles.corner, { bottom: 0, left: 0 }]}>
        <Avatar user={shown[shown.length - 1]!} size={inner} ring />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  corner: { position: "absolute" },
});
