import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeProvider";
import { frenchDateFormat } from "../utils/frenchDate";
import type { WelcomeOffer } from "../api/public.api";

const longDate = frenchDateFormat({ day: "numeric", month: "long", year: "numeric" });

// Offre de bienvenue de l'espace public, aux couleurs de la charte. Les
// conditions complètes sont toujours lisibles dans l'app (dépliables ici,
// affichées en entier sur la demande de devis : `conditionsOpen`).
export function WelcomeOfferCard({ offer, conditionsOpen = false, onRequestQuote }: { offer: WelcomeOffer; conditionsOpen?: boolean; onRequestQuote?: () => void }) {
  const { spacing, radius, type } = useTheme();
  const [open, setOpen] = useState(conditionsOpen);
  const period = `Du ${longDate.format(new Date(offer.startsAt))} au ${longDate.format(new Date(offer.endsAt))}`;

  return (
    <View style={{ borderRadius: radius.lg, overflow: "hidden" }}>
      <LinearGradient colors={["#1E9CC6", "#2A4F8E", "#1F2D69"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ padding: spacing.md }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <View style={{ paddingHorizontal: spacing.xs, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: "rgba(255,255,255,0.18)" }}>
            <Text style={[type.overline, { color: "#FFFFFF" }]}>{offer.title.toUpperCase()}</Text>
          </View>
        </View>
        <View style={{ flexDirection: "row", alignItems: "flex-end", marginTop: spacing.sm }}>
          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 44, lineHeight: 48, color: "#FFFFFF", letterSpacing: -1 }}>-{offer.rate} %</Text>
          <Text style={[type.subhead, { color: "#FFFFFF", marginLeft: spacing.sm, marginBottom: 6, flex: 1, fontFamily: "Inter_600SemiBold" }]}>
            sur votre première prestation
          </Text>
        </View>
        <Text style={[type.footnote, { color: "#DDF0FA", marginTop: spacing.xs }]}>{offer.summary}</Text>
        <Text style={[type.caption, { color: "#BFE3F4", marginTop: spacing.xs }]}>{period}</Text>

        {open ? (
          <View style={{ marginTop: spacing.sm, padding: spacing.sm, borderRadius: radius.md, backgroundColor: "rgba(255,255,255,0.12)" }}>
            <Text style={[type.caption, { color: "#FFFFFF", marginBottom: 4 }]}>CONDITIONS DE L'OFFRE</Text>
            <Text style={[type.footnote, { color: "#EAF6FC" }]}>{offer.conditions}</Text>
          </View>
        ) : null}

        <View style={{ flexDirection: "row", alignItems: "center", marginTop: spacing.sm, gap: spacing.md }}>
          {!conditionsOpen && (
            <Pressable onPress={() => setOpen((v) => !v)} accessibilityRole="button" hitSlop={8}>
              <Text style={[type.footnote, { color: "#FFFFFF", fontFamily: "Inter_600SemiBold", textDecorationLine: "underline" }]}>
                {open ? "Masquer les conditions" : "Voir les conditions"}
              </Text>
            </Pressable>
          )}
          {!!onRequestQuote && (
            <Pressable
              onPress={onRequestQuote}
              accessibilityRole="button"
              style={{ marginLeft: "auto", flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.sm, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: "#FFFFFF" }}
            >
              <Text style={[type.footnote, { color: "#1F2D69", fontFamily: "Inter_700Bold" }]}>En profiter</Text>
              <Ionicons name="arrow-forward" size={14} color="#1F2D69" style={{ marginLeft: 4 }} />
            </Pressable>
          )}
        </View>
      </LinearGradient>
    </View>
  );
}
