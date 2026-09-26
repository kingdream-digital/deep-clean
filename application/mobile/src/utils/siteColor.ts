import type { Palette } from "../theme/colors";

// Couleur stable par chantier (hash simple sur l'id) pour repérer un site d'un
// coup d'œil dans le mini-planning du tableau de bord — jamais aléatoire d'un
// rendu à l'autre, toujours la même teinte pour le même chantier.
export function siteColor(siteId: string, colors: Palette): { fg: string; bg: string } {
  const palette: Array<{ fg: string; bg: string }> = [
    { fg: colors.accentDeep, bg: colors.accentSoft },
    { fg: colors.info, bg: colors.infoSoft },
    { fg: colors.purple, bg: colors.purpleSoft },
    { fg: colors.warning, bg: colors.warningSoft },
    { fg: colors.success, bg: colors.successSoft },
    { fg: colors.danger, bg: colors.dangerSoft },
  ];
  let hash = 0;
  for (let i = 0; i < siteId.length; i++) {
    hash = (hash * 31 + siteId.charCodeAt(i)) >>> 0;
  }
  return palette[hash % palette.length]!;
}
