import React, { useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { useIsFocused, useRoute, type RouteProp } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PressableScale } from "../../components/PressableScale";
import { DIVE } from "../../components/public/DiveMenu";
import type { PublicStackParamList } from "../../navigation/RootNavigator";
import { AUDIENCE_LABEL, METHOD, ROOMS, SERVICE_SHEETS } from "./publicContent";
import { usePublicNavigation } from "./publicUi";
import { PUB } from "./publicTheme";

// Page d'un service de l'accueil public : ce que c'est, pour qui, ce que
// ça comprend, et un bouton pour demander le devis — le service y est déjà
// choisi. Textes du site officiel, rien d'inventé.
export function PublicServiceScreen() {
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const navigation = usePublicNavigation();
  const { params } = useRoute<RouteProp<PublicStackParamList, "PublicService">>();
  const sheet = SERVICE_SHEETS.find((s) => s.service === params.service) ?? SERVICE_SHEETS[0]!;
  const [room, setRoom] = useState(ROOMS[0]!.name);
  const currentRoom = ROOMS.find((r) => r.name === room) ?? ROOMS[0]!;
  const others = SERVICE_SHEETS.filter((s) => s.service !== sheet.service);

  return (
    <View style={{ flex: 1, backgroundColor: PUB.page }}>
      {isFocused && <StatusBar style="light" />}
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 110 }}>
        <View style={{ height: 330 + insets.top, backgroundColor: DIVE.navy }}>
          <Image source={sheet.image} style={st.fill} resizeMode="cover" accessibilityIgnoresInvertColors />
          <LinearGradient colors={["rgba(12,18,51,0.45)", "rgba(12,18,51,0.1)", "rgba(12,18,51,0.92)"]} style={StyleSheet.absoluteFill} />
          <View style={{ flex: 1, justifyContent: "flex-end", padding: 22 }}>
            <Text style={st.eyebrow}>{sheet.specific ? "SOIN SPÉCIFIQUE" : "SERVICE"}</Text>
            <Text style={st.title} accessibilityRole="header">
              {sheet.title}
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
              {sheet.for.map((a) => (
                <View key={a} style={st.forChip}>
                  <Text style={st.forText}>{AUDIENCE_LABEL[a]}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        <View style={{ paddingHorizontal: 22 }}>
          <View style={[st.card, { marginTop: -18 }]}>
            <Text style={st.lead}>{sheet.text}</Text>
            {!!sheet.more && <Text style={[st.body, { marginTop: 10 }]}>{sheet.more}</Text>}
            {sheet.specific && (
              <View style={st.note}>
                <Ionicons name="information-circle-outline" size={18} color={PUB.aquaInk} />
                <Text style={[st.body, { flex: 1, marginLeft: 8, color: PUB.ink }]}>Soin spécifique, sur devis : décrivez la pièce ou l'élément à traiter.</Text>
              </View>
            )}
          </View>

          {!!sheet.points?.length && (
            <>
              <Text style={st.section}>Ce que ça comprend</Text>
              <View style={st.card}>
                {sheet.points.map((point, index) => (
                  <View key={point} style={{ flexDirection: "row", alignItems: "center", marginTop: index === 0 ? 0 : 12 }}>
                    <Ionicons name="checkmark-circle" size={20} color={PUB.aquaBtn} />
                    <Text style={[st.body, { color: PUB.ink, marginLeft: 10, flex: 1 }]}>{point}</Text>
                  </View>
                ))}
              </View>
            </>
          )}

          {sheet.rooms && (
            <>
              <Text style={st.section}>Pièce par pièce</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -22 }} contentContainerStyle={{ paddingHorizontal: 22, gap: 8 }}>
                {ROOMS.map((r) => {
                  const selected = r.name === room;
                  return (
                    <Pressable key={r.name} onPress={() => setRoom(r.name)} accessibilityRole="tab" accessibilityState={{ selected }} style={[st.chip, selected && { backgroundColor: PUB.ink, borderColor: PUB.ink }]}>
                      <Ionicons name={r.icon} size={14} color={selected ? "#FFFFFF" : PUB.ink} />
                      <Text style={[st.chipText, { color: selected ? "#FFFFFF" : PUB.ink }]}>{r.name}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
              <View style={[st.card, { marginTop: 12, padding: 0, overflow: "hidden" }]}>
                <Image source={currentRoom.image} style={{ width: "100%", height: 170 }} resizeMode="cover" accessibilityIgnoresInvertColors />
                <View style={{ padding: 16 }}>
                  {currentRoom.points.map((point, index) => (
                    <View key={point.label} style={{ flexDirection: "row", alignItems: "center", marginTop: index === 0 ? 0 : 10 }}>
                      <Ionicons name="checkmark-circle" size={19} color={PUB.aquaBtn} />
                      <Text style={[st.body, { color: PUB.ink, marginLeft: 8, flex: 1 }]}>{point.label}</Text>
                      {point.onQuote && <Text style={st.small}>Sur devis</Text>}
                    </View>
                  ))}
                </View>
              </View>
              <Text style={[st.small, { marginTop: 8 }]}>Le contenu exact de chaque intervention est défini avec vous lors du devis.</Text>
            </>
          )}

          <Text style={st.section}>Notre méthode</Text>
          <View style={st.card}>
            {METHOD.map((m, index) => (
              <View key={m.title} style={{ flexDirection: "row", marginTop: index === 0 ? 0 : 14 }}>
                <Text style={st.methodIndex}>{String(index + 1).padStart(2, "0")}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={st.cardTitle}>{m.title}</Text>
                  <Text style={[st.body, { marginTop: 2 }]}>{m.text}</Text>
                </View>
              </View>
            ))}
          </View>

          <Text style={st.section}>Nos autres services</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 22, gap: 10 }}>
          {others.map((other) => (
            <PressableScale key={other.service} onPress={() => navigation.push("PublicService", { service: other.service })} accessibilityRole="button">
              <View style={st.other}>
                <Image source={other.image} style={st.fill} resizeMode="cover" accessibilityIgnoresInvertColors />
                <LinearGradient colors={["rgba(12,18,51,0)", "rgba(12,18,51,0.88)"]} style={StyleSheet.absoluteFill} />
                <Text style={st.otherTitle}>{other.title}</Text>
              </View>
            </PressableScale>
          ))}
        </ScrollView>
      </ScrollView>

      {/* Retour, posé sur la photo. */}
      <Pressable onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Retour" hitSlop={8} style={[st.back, { top: insets.top + 10 }]}>
        <Ionicons name="chevron-back" size={22} color={PUB.ink} />
      </Pressable>

      {/* Le devis pour ce service, toujours à portée de pouce. */}
      <View style={[st.bar, { bottom: insets.bottom + 12 }]}>
        <PressableScale onPress={() => navigation.navigate("QuoteRequest", { service: sheet.service })} accessibilityRole="button">
          <View style={st.barButton}>
            <Ionicons name="document-text-outline" size={19} color="#FFFFFF" />
            <Text style={st.barText}>Demander un devis pour ce service</Text>
          </View>
        </PressableScale>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  fill: { position: "absolute", top: 0, left: 0, width: "100%", height: "100%" },
  eyebrow: { fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 1.3, color: DIVE.aquaGlow },
  title: { fontFamily: "Inter_700Bold", fontSize: 32, lineHeight: 37, letterSpacing: -0.9, color: "#FFFFFF", marginTop: 6 },
  forChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.16)", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.4)" },
  forText: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: "#FFFFFF" },
  card: { padding: 18, borderRadius: 22, backgroundColor: "#FFFFFF", shadowColor: DIVE.abyss, shadowOpacity: 0.07, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 2 },
  lead: { fontFamily: "Inter_500Medium", fontSize: 17, lineHeight: 25, color: PUB.ink },
  body: { fontFamily: "Inter_400Regular", fontSize: 14, lineHeight: 20, color: PUB.inkSoft },
  small: { fontFamily: "Inter_500Medium", fontSize: 12, lineHeight: 16, color: PUB.inkSoft },
  cardTitle: { fontFamily: "Inter_600SemiBold", fontSize: 16, lineHeight: 21, color: PUB.ink },
  section: { fontFamily: "Inter_700Bold", fontSize: 20, lineHeight: 25, letterSpacing: -0.3, color: PUB.ink, marginTop: 28, marginBottom: 12 },
  note: { flexDirection: "row", alignItems: "flex-start", marginTop: 14, padding: 12, borderRadius: 14, backgroundColor: "#E6F4FA" },
  chip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: PUB.line },
  chipText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  methodIndex: { width: 36, fontFamily: "Inter_700Bold", fontSize: 16, color: PUB.aquaInk },
  other: { width: 150, height: 110, borderRadius: 18, overflow: "hidden", justifyContent: "flex-end", padding: 10, backgroundColor: DIVE.navy },
  otherTitle: { fontFamily: "Inter_700Bold", fontSize: 14, lineHeight: 18, color: "#FFFFFF" },
  back: { position: "absolute", left: 14, width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.95)" },
  bar: { position: "absolute", left: 16, right: 16 },
  barButton: {
    height: 56,
    borderRadius: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    backgroundColor: PUB.aquaBtn,
    shadowColor: DIVE.abyss,
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  barText: { marginLeft: 8, fontFamily: "Inter_700Bold", fontSize: 16, color: "#FFFFFF" },
});
