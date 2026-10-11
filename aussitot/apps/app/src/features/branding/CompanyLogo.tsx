import { Image, View } from "react-native";
import { readableTextOn, type SessionUserDto } from "@aussitot/shared";
import { useOrgLogo } from "@/lib/logo";
import { useTheme } from "@/theme/ThemeProvider";
import { Text } from "@/ui";

type Organization = SessionUserDto["organization"];

const DEFAULT_BRAND = "#2347F5";

function initialsOf(name: string): string {
  const words = name.split(/[\s'’-]+/).filter((w) => /^[A-Za-z0-9À-ÖØ-öø-ÿ]/.test(w));
  return (
    words
      .slice(0, 2)
      .map((w) => w.charAt(0))
      .join("")
      .toUpperCase() || "?"
  );
}

/** Pastille aux initiales de l'entreprise, à sa couleur (si elle n'a pas encore de logo). */
export function CompanyInitials({ name, brandColor, size = 40 }: { name: string; brandColor: string | null; size?: number }) {
  const background = brandColor ?? DEFAULT_BRAND;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.28),
        backgroundColor: background,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text weight="bold" style={{ color: readableTextOn(background), fontSize: Math.round(size * 0.38) }}>
        {initialsOf(name)}
      </Text>
    </View>
  );
}

/**
 * Logo de l'entreprise à sa vraie proportion, aligné à gauche. En mode
 * sombre il est posé sur un fond blanc : les logos sont dessinés pour le
 * papier (devis, factures) et resteraient sinon illisibles.
 */
export function CompanyLogo({
  organization,
  height = 28,
  maxWidth = 180,
  fallback = "name",
}: {
  organization: Organization;
  height?: number;
  maxWidth?: number;
  /** Sans logo : le nom de l'entreprise, ses initiales, ou rien. */
  fallback?: "name" | "initials" | "none";
}) {
  const { colors, radius } = useTheme();
  const logo = useOrgLogo(organization.id, organization.hasLogo ? organization.logoVersion : null);

  if (!logo) {
    if (fallback === "initials") return <CompanyInitials name={organization.name} brandColor={organization.brandColor} size={height} />;
    if (fallback === "name") {
      return (
        <Text variant="footnote" tone="tertiary" numberOfLines={1}>
          {organization.name}
        </Text>
      );
    }
    return null;
  }

  const width = Math.min(maxWidth, Math.round(height * logo.aspectRatio));
  const plate = colors.mode === "dark";
  return (
    <View
      style={{
        alignSelf: "flex-start",
        ...(plate ? { backgroundColor: "#FFFFFF", borderRadius: radius.xs, padding: 6 } : null),
      }}
    >
      <Image source={logo.source} style={{ width, height }} resizeMode="contain" accessibilityLabel={`Logo ${organization.name}`} />
    </View>
  );
}
