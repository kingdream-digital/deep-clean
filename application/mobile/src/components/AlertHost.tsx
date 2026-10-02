import React, { useEffect, useState } from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import { registerAlertHandler, type AlertButton, type AlertRequest } from "../utils/alert";

// Équivalent web d'un UIAlertController : monté une seule fois à la racine
// (voir App.tsx), piloté impérativement par utils/alert.ts. Ne rend rien sur
// natif, où Alert.alert() du SDK fait déjà le travail nativement.
export function AlertHost() {
  const { colors, spacing, radius, type } = useTheme();
  const [request, setRequest] = useState<AlertRequest | null>(null);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    registerAlertHandler(setRequest);
    return () => registerAlertHandler(null);
  }, []);

  if (Platform.OS !== "web" || !request) return null;

  function handlePress(button: AlertButton) {
    setRequest(null);
    button.onPress?.();
  }

  // Au-delà de 2 boutons (choix multiple — export de pointages, sélection de
  // format...), une rangée horizontale écrase chaque libellé dans une
  // fraction des 340px de la carte : "PDF (récapitulatif)" se retrouve
  // tassé sur plusieurs lignes, illisible. Un vrai menu d'actions ampile
  // les options verticalement à partir de 3 boutons — 2 restent côte à côte
  // (confirmer/annuler), seul cas où ça tient sans se resserrer.
  const stacked = request.buttons.length > 2;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => setRequest(null)}>
      <View style={[styles.overlay, { backgroundColor: colors.overlay }]}>
        <View style={[styles.card, { backgroundColor: colors.backgroundElevated, borderRadius: radius.lg }]}>
          <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.md }}>
            <Text style={[type.headline, { color: colors.ink, textAlign: "center" }]}>{request.title}</Text>
            {!!request.message && (
              <Text style={[type.subhead, { color: colors.inkSecondary, textAlign: "center", marginTop: spacing.xs }]}>
                {request.message}
              </Text>
            )}
          </View>
          <View style={[stacked ? styles.buttonColumn : styles.buttonRow, { borderTopColor: colors.border }]}>
            {request.buttons.map((button, index) => (
              <Pressable
                key={button.text + index}
                onPress={() => handlePress(button)}
                style={[
                  stacked ? styles.buttonStacked : styles.button,
                  index > 0 &&
                    (stacked
                      ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }
                      : { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.border }),
                ]}
              >
                <Text
                  style={[
                    type.headline,
                    {
                      color: button.style === "destructive" ? colors.danger : button.style === "cancel" ? colors.inkSecondary : colors.accent,
                      fontWeight: button.style === "cancel" ? "400" : "600",
                    },
                  ]}
                >
                  {button.text}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  card: { width: "100%", maxWidth: 340, overflow: "hidden" },
  buttonRow: { flexDirection: "row", borderTopWidth: StyleSheet.hairlineWidth },
  button: { flex: 1, paddingVertical: 14, alignItems: "center", justifyContent: "center" },
  buttonColumn: { flexDirection: "column", borderTopWidth: StyleSheet.hairlineWidth },
  buttonStacked: { paddingVertical: 14, alignItems: "center", justifyContent: "center" },
});
