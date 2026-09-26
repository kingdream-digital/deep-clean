import React, { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeProvider";
import { fontFamily } from "../theme/typography";

interface DateTimeFieldProps {
  label: string;
  value: Date;
  mode: "date" | "time";
  onChange: (date: Date) => void;
  minimumDate?: Date;
  maximumDate?: Date;
  formatValue: (date: Date) => string;
}

// AAAA-MM-JJ à partir des composants LOCAUX (jamais toISOString(), qui
// convertit en UTC et peut faire glisser le jour) — même règle que
// utils/missionFormat.ts#toLocalDateKey.
function toDateInputValue(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toTimeInputValue(d: Date): string {
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

// Champ de saisie date/heure basé sur le sélecteur natif. Sur Android, le
// sélecteur s'ouvre en boîte de dialogue et se ferme seul ; sur iOS, il
// s'affiche en ligne (mode "spinner") avec un bouton "Terminé" explicite.
export function DateTimeField({ label, value, mode, onChange, minimumDate, maximumDate, formatValue }: DateTimeFieldProps) {
  const { colors, radius, spacing, type } = useTheme();
  const [open, setOpen] = useState(false);

  function handleChange(event: DateTimePickerEvent, selected?: Date) {
    if (Platform.OS === "android") {
      setOpen(false);
      if (event.type === "set" && selected) onChange(selected);
      return;
    }
    if (selected) onChange(selected);
  }

  // Web : `@react-native-community/datetimepicker` n'a AUCUNE implémentation
  // web (vérifié : pas de fichier .web.* dans le package) — sans cette
  // branche, le champ affichait la valeur mais rien ne s'ouvrait au clic,
  // rendant impossible tout changement de date sur cette plateforme (bug
  // trouvé en testant réellement le formulaire de pointage différé dans un
  // navigateur, pas en lisant le code). On utilise ici le vrai sélecteur du
  // navigateur (`<input type="date">`/`"time"`) via `React.createElement` —
  // c'est un élément DOM natif que react-native-web laisse passer tel quel :
  // clavier et lecteur d'écran déjà gérés par le navigateur, sans dépendance
  // supplémentaire.
  if (Platform.OS === "web") {
    return (
      <View style={{ marginBottom: spacing.md }}>
        <Text style={[type.subhead, { color: colors.inkSecondary, marginBottom: spacing.xxs }]}>{label}</Text>
        <View
          style={[
            styles.field,
            { borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
          ]}
        >
          {React.createElement("input", {
            type: mode,
            value: mode === "date" ? toDateInputValue(value) : toTimeInputValue(value),
            min: minimumDate && mode === "date" ? toDateInputValue(minimumDate) : undefined,
            max: maximumDate && mode === "date" ? toDateInputValue(maximumDate) : undefined,
            onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
              const raw = e.target.value;
              if (!raw) return;
              const next = new Date(value);
              if (mode === "date") {
                const [y, m, d] = raw.split("-").map(Number);
                next.setFullYear(y, m - 1, d);
              } else {
                const [h, m] = raw.split(":").map(Number);
                next.setHours(h, m, 0, 0);
              }
              onChange(next);
            },
            style: {
              border: "none",
              background: "transparent",
              font: "inherit",
              color: colors.ink,
              outline: "none",
              width: "100%",
              cursor: "pointer",
            },
          })}
          <Ionicons name={mode === "date" ? "calendar-outline" : "time-outline"} size={18} color={colors.inkTertiary} />
        </View>
      </View>
    );
  }

  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={[type.subhead, { color: colors.inkSecondary, marginBottom: spacing.xxs }]}>{label}</Text>
      <Pressable
        onPress={() => setOpen(true)}
        style={[
          styles.field,
          { borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
        ]}
      >
        <Text style={[type.body, { color: colors.ink }]}>{formatValue(value)}</Text>
        <Ionicons name={mode === "date" ? "calendar-outline" : "time-outline"} size={18} color={colors.inkTertiary} />
      </Pressable>

      {open && Platform.OS === "ios" && (
        <View style={{ marginTop: spacing.xs }}>
          <DateTimePicker
            value={value}
            mode={mode}
            display="spinner"
            onChange={handleChange}
            minimumDate={minimumDate}
            maximumDate={maximumDate}
          />
          <Pressable onPress={() => setOpen(false)} style={{ alignSelf: "flex-end", padding: spacing.xs }}>
            <Text style={[type.callout, { color: colors.accent, fontFamily: fontFamily.semibold, fontWeight: "600" }]}>
              Terminé
            </Text>
          </Pressable>
        </View>
      )}

      {open && Platform.OS === "android" && (
        <DateTimePicker
          value={value}
          mode={mode}
          display="default"
          onChange={handleChange}
          minimumDate={minimumDate}
          maximumDate={maximumDate}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
});
