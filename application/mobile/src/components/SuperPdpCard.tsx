import React from "react";
import { Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Card } from "./Card";
import { PressableScale } from "./PressableScale";
import { ProgressBar } from "./ProgressBar";
import { useTheme } from "../theme/ThemeProvider";
import type { Palette } from "../theme/colors";
import { daysUntil } from "../api/einvoicing.api";
import type { EinvoicingOverview } from "../api/einvoicing.api";
import { frenchDateFormat } from "../utils/frenchDate";

const deadlineFmt = frenchDateFormat({ day: "numeric", month: "long", year: "numeric" });

export type EinvoicingStateTone = "success" | "warning" | "neutral" | "danger";

/**
 * État global de la facture électronique, en un mot : ce que l'utilisateur
 * doit retenir avant tout détail (activée ? quelque chose à faire ?).
 */
export function einvoicingState(o: EinvoicingOverview): { label: string; tone: EinvoicingStateTone; icon: React.ComponentProps<typeof Ionicons>["name"] } {
  if (!o.connection.configured) return { label: "Non activée", tone: "neutral", icon: "power-outline" };
  if (o.company.missing.length > 0) return { label: "À compléter", tone: "warning", icon: "construct-outline" };
  if (o.counts.attention > 0) return { label: "À vérifier", tone: "danger", icon: "alert-circle-outline" };
  return { label: "Connectée", tone: "success", icon: "checkmark-circle" };
}

export function stateColors(tone: EinvoicingStateTone, colors: Palette): { fg: string; bg: string } {
  switch (tone) {
    case "success":
      return { fg: colors.success, bg: colors.successSoft };
    case "warning":
      return { fg: colors.warning, bg: colors.warningSoft };
    case "danger":
      return { fg: colors.danger, bg: colors.dangerSoft };
    default:
      return { fg: colors.neutral, bg: colors.neutralSoft };
  }
}

/** Avancement entre l'entrée en vigueur (réception) et l'obligation d'émettre. */
export function reformProgress(o: EinvoicingOverview): number {
  const total = daysUntil(o.deadlines.emission) - daysUntil(o.deadlines.reception);
  if (total <= 0) return 1;
  return Math.max(0, Math.min(1, -daysUntil(o.deadlines.reception) / total));
}

function Counter({ value, label, color }: { value: number; label: string; color: string }) {
  const { colors, type } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: "center" }}>
      <Text style={[type.statNumber, { color: value > 0 ? color : colors.inkTertiary }]}>{value}</Text>
      <Text style={[type.caption, { color: colors.inkSecondary, marginTop: 2, textAlign: "center" }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

interface Props {
  overview: EinvoicingOverview | null;
  // Erreur de chargement : la carte reste un point d'entrée, sans chiffres.
  failed?: boolean;
  onOpen: () => void;
}

// Point d'entrée de l'espace Super PDP sur l'écran Commercial : l'état en un
// coup d'œil (activée ? à vérifier ?), les factures en attente, et le temps
// restant avant l'obligation d'émettre. Toute la carte ouvre l'espace.
export function SuperPdpCard({ overview, failed, onOpen }: Props) {
  const { colors, spacing, radius, type } = useTheme();
  const state = overview ? einvoicingState(overview) : null;
  const tint = state ? stateColors(state.tone, colors) : null;
  const daysLeft = overview ? daysUntil(overview.deadlines.emission) : null;

  return (
    <PressableScale onPress={onOpen} accessibilityRole="button" accessibilityLabel="Ouvrir l'espace Super PDP">
      <Card padded={false} style={{ overflow: "hidden" }}>
        <View style={{ flexDirection: "row", alignItems: "center", padding: spacing.lg }}>
          <LinearGradient
            colors={colors.accentGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ width: 48, height: 48, borderRadius: radius.md, alignItems: "center", justifyContent: "center" }}
          >
            <Ionicons name="shield-checkmark" size={24} color={colors.onAccent} />
          </LinearGradient>
          <View style={{ flex: 1, marginLeft: spacing.md }}>
            <Text style={[type.headline, { color: colors.ink }]}>Facture électronique</Text>
            <Text style={[type.footnote, { color: colors.inkSecondary, marginTop: 1 }]}>Super PDP · Factur-X</Text>
          </View>
          {state && tint && (
            <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: tint.bg, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 }}>
              <Ionicons name={state.icon} size={13} color={tint.fg} />
              <Text style={[type.caption, { color: tint.fg, marginLeft: 4, fontWeight: "700" }]}>{state.label}</Text>
            </View>
          )}
        </View>

        {overview && (
          <>
            <View style={{ flexDirection: "row", paddingVertical: spacing.md, borderTopWidth: 1, borderTopColor: colors.border }}>
              <Counter value={overview.counts.toSend} label="À transmettre" color={colors.accentText} />
              <Counter value={overview.counts.inProgress} label="En cours" color={colors.info} />
              <Counter value={overview.counts.attention} label="À vérifier" color={colors.danger} />
            </View>
            {daysLeft !== null && (
              <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.md }}>
                <View style={{ flexDirection: "row", alignItems: "center", marginBottom: spacing.xs }}>
                  <Ionicons name="hourglass-outline" size={13} color={colors.inkTertiary} />
                  <Text style={[type.footnote, { color: colors.inkSecondary, marginLeft: 6, flex: 1 }]}>
                    {daysLeft > 0
                      ? `Émission obligatoire dans ${daysLeft} jour${daysLeft > 1 ? "s" : ""}`
                      : "Émission électronique obligatoire"}
                  </Text>
                  <Text style={[type.caption, { color: colors.inkTertiary }]}>{deadlineFmt.format(new Date(`${overview.deadlines.emission}T12:00:00`))}</Text>
                </View>
                <ProgressBar ratio={reformProgress(overview)} color={colors.accent} />
              </View>
            )}
          </>
        )}

        {failed && !overview && (
          <Text style={[type.footnote, { color: colors.inkTertiary, paddingHorizontal: spacing.lg, paddingBottom: spacing.md }]}>
            État momentanément indisponible — ouvrez l'espace pour réessayer.
          </Text>
        )}

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            paddingVertical: spacing.sm,
            backgroundColor: colors.accentSoft,
          }}
        >
          <Text style={[type.subhead, { color: colors.accentText, fontWeight: "700" }]}>Ouvrir l'espace Super PDP</Text>
          <Ionicons name="arrow-forward" size={16} color={colors.accentText} style={{ marginLeft: 6 }} />
        </View>
      </Card>
    </PressableScale>
  );
}
