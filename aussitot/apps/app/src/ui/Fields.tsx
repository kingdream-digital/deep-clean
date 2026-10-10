import { useMemo, useState, type ReactNode } from "react";
import { View } from "react-native";
import { Check, ChevronDown, ChevronLeft, ChevronRight, CalendarDays } from "lucide-react-native";
import { addDays, formatDayLong, formatMonth, weekdayOf } from "@aussitot/shared";
import { useTheme } from "@/theme/ThemeProvider";
import { PressableScale } from "./PressableScale";
import { Text } from "./Text";
import { Sheet } from "./Sheet";
import { SearchField } from "./SearchField";
import { TextField } from "./TextField";
import { Button } from "./Button";
import { IconButton } from "./IconButton";

/** Champ « bouton » : libellé visible, valeur, chevron ; ouvre un sélecteur. */
function FieldButton({
  label,
  value,
  placeholder,
  error,
  onPress,
  icon,
  testID,
}: {
  label: string;
  value?: string | null;
  placeholder: string;
  error?: string | null;
  onPress: () => void;
  icon?: ReactNode;
  testID?: string;
}) {
  const { colors, radius } = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Text variant="subhead" weight="medium" tone="secondary">
        {label}
      </Text>
      <PressableScale
        testID={testID}
        onPress={onPress}
        scaleTo={0.99}
        accessibilityLabel={`${label} : ${value ?? placeholder}`}
        accessibilityHint={error ?? undefined}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          minHeight: 50,
          paddingHorizontal: 14,
          borderRadius: radius.md,
          borderWidth: 1.5,
          borderColor: error ? colors.danger : colors.borderStrong,
          backgroundColor: colors.surface,
        }}
        pressedStyle={{ backgroundColor: colors.surfacePressed }}
      >
        {icon}
        <Text variant="body" tone={value ? "primary" : "tertiary"} style={{ flex: 1 }} numberOfLines={1}>
          {value ?? placeholder}
        </Text>
        <ChevronDown size={18} color={colors.textTertiary} />
      </PressableScale>
      {error ? (
        <Text variant="footnote" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
}

/** Sélection d'un élément dans une liste (avec recherche au-delà de 8 éléments). */
export function SelectField({
  label,
  options,
  value,
  onChange,
  placeholder = "Choisir",
  error,
  allowClear,
  clearLabel = "Aucun",
  testID,
  footer,
}: {
  label: string;
  options: SelectOption[];
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  placeholder?: string;
  error?: string | null;
  allowClear?: boolean;
  clearLabel?: string;
  testID?: string;
  footer?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  return (
    <>
      <FieldButton
        label={label}
        value={selected?.label}
        placeholder={placeholder}
        error={error}
        onPress={() => setOpen(true)}
        testID={testID}
      />
      <OptionSheet
        visible={open}
        title={label}
        options={options}
        selected={value ? [value] : []}
        onToggle={(v) => {
          onChange(v);
          setOpen(false);
        }}
        onClose={() => setOpen(false)}
        clear={allowClear ? { label: clearLabel, onPress: () => (onChange(null), setOpen(false)) } : undefined}
        footer={footer}
      />
    </>
  );
}

/** Sélection de plusieurs éléments (équipe d'une mission). */
export function MultiSelectField({
  label,
  options,
  values,
  onChange,
  placeholder = "Choisir",
  error,
  testID,
}: {
  label: string;
  options: SelectOption[];
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  error?: string | null;
  testID?: string;
}) {
  const [open, setOpen] = useState(false);
  const labels = options.filter((o) => values.includes(o.value)).map((o) => o.label);
  const summary =
    labels.length === 0
      ? null
      : labels.length <= 2
        ? labels.join(", ")
        : `${labels.slice(0, 2).join(", ")} et ${labels.length - 2} autre${labels.length - 2 > 1 ? "s" : ""}`;
  return (
    <>
      <FieldButton label={label} value={summary} placeholder={placeholder} error={error} onPress={() => setOpen(true)} testID={testID} />
      <OptionSheet
        visible={open}
        title={label}
        subtitle={`${values.length} sélectionné${values.length > 1 ? "s" : ""}`}
        options={options}
        selected={values}
        multiple
        onToggle={(v) => onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v])}
        onClose={() => setOpen(false)}
        footer={<Button label="Terminé" fullWidth onPress={() => setOpen(false)} />}
      />
    </>
  );
}

function OptionSheet({
  visible,
  title,
  subtitle,
  options,
  selected,
  multiple,
  onToggle,
  onClose,
  clear,
  footer,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  options: SelectOption[];
  selected: string[];
  multiple?: boolean;
  onToggle: (value: string) => void;
  onClose: () => void;
  clear?: { label: string; onPress: () => void };
  footer?: ReactNode;
}) {
  const { colors, radius } = useTheme();
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    if (!q) return options;
    return options.filter((o) => `${o.label} ${o.description ?? ""}`.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").includes(q));
  }, [options, query]);
  return (
    <Sheet visible={visible} onClose={onClose} title={title} subtitle={subtitle} footer={footer}>
      {options.length > 8 ? <SearchField value={query} onChangeText={setQuery} /> : null}
      <View
        style={{ borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: "hidden" }}
        accessibilityRole={multiple ? "list" : "radiogroup"}
      >
        {clear ? <OptionRow label={clear.label} selected={selected.length === 0} onPress={clear.onPress} first /> : null}
        {filtered.map((option, index) => (
          <OptionRow
            key={option.value}
            label={option.label}
            description={option.description}
            selected={selected.includes(option.value)}
            onPress={() => onToggle(option.value)}
            first={index === 0 && !clear}
            multiple={multiple}
          />
        ))}
        {filtered.length === 0 ? (
          <Text variant="subhead" tone="tertiary" style={{ padding: 16 }}>
            Aucun résultat.
          </Text>
        ) : null}
      </View>
    </Sheet>
  );
}

function OptionRow({
  label,
  description,
  selected,
  onPress,
  first,
  multiple,
}: {
  label: string;
  description?: string;
  selected: boolean;
  onPress: () => void;
  first?: boolean;
  multiple?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      scaleTo={1}
      haptic="selection"
      accessibilityRole={multiple ? "checkbox" : "radio"}
      accessibilityState={multiple ? { checked: selected } : { selected }}
      accessibilityLabel={description ? `${label}, ${description}` : label}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        minHeight: 52,
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: colors.border,
        backgroundColor: selected ? colors.accentSoft : colors.surface,
      }}
      pressedStyle={{ backgroundColor: colors.surfacePressed }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="callout" weight={selected ? "semibold" : "regular"}>
          {label}
        </Text>
        {description ? (
          <Text variant="footnote" tone="secondary">
            {description}
          </Text>
        ) : null}
      </View>
      {multiple ? (
        <View
          style={{
            width: 22,
            height: 22,
            borderRadius: 6,
            borderWidth: 1.5,
            borderColor: selected ? colors.accentFill : colors.borderStrong,
            backgroundColor: selected ? colors.accentFill : "transparent",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {selected ? <Check size={14} color="#FFFFFF" strokeWidth={3} /> : null}
        </View>
      ) : selected ? (
        <Check size={18} color={colors.accentText} strokeWidth={2.6} />
      ) : null}
    </PressableScale>
  );
}

const WEEKDAY_LETTERS = ["L", "M", "M", "J", "V", "S", "D"];
const WEEKDAY_NAMES = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];

/** Choix d'une date : jour lisible (« jeudi 15 octobre »), calendrier du mois en feuille. */
export function DateField({
  label,
  value,
  onChange,
  today,
  error,
  allowClear,
  testID,
}: {
  label: string;
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  today: string;
  error?: string | null;
  allowClear?: boolean;
  testID?: string;
}) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState((value ?? today).slice(0, 7));
  const display = value ? capitalize(formatDayLong(value, { year: value.slice(0, 4) !== today.slice(0, 4) })) : null;
  return (
    <>
      <FieldButton
        label={label}
        value={display}
        placeholder="Choisir une date"
        error={error}
        onPress={() => {
          setMonth((value ?? today).slice(0, 7));
          setOpen(true);
        }}
        icon={<CalendarDays size={18} color={colors.textTertiary} />}
        testID={testID}
      />
      <Sheet
        visible={open}
        onClose={() => setOpen(false)}
        title={label}
        footer={
          allowClear && value ? (
            <Button
              label="Effacer la date"
              variant="ghost"
              fullWidth
              onPress={() => {
                onChange(null);
                setOpen(false);
              }}
            />
          ) : undefined
        }
      >
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          {[
            { label: "Aujourd'hui", date: today },
            { label: "Demain", date: addDays(today, 1) },
            { label: "Dans une semaine", date: addDays(today, 7) },
          ].map((quick) => (
            <Button
              key={quick.label}
              label={quick.label}
              size="sm"
              variant={value === quick.date ? "primary" : "secondary"}
              onPress={() => {
                onChange(quick.date);
                setOpen(false);
              }}
            />
          ))}
        </View>
        <MonthCalendar
          month={month}
          onMonthChange={setMonth}
          selected={value ?? null}
          today={today}
          onSelect={(date) => {
            onChange(date);
            setOpen(false);
          }}
        />
      </Sheet>
    </>
  );
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function shiftMonth(month: string, delta: number): string {
  const [y = 1970, m = 1] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

/** Grille d'un mois (semaines du lundi au dimanche), navigable au clavier et au lecteur d'écran. */
export function MonthCalendar({
  month,
  onMonthChange,
  selected,
  today,
  onSelect,
  marked,
}: {
  month: string;
  onMonthChange: (month: string) => void;
  selected: string | null;
  today: string;
  onSelect: (date: string) => void;
  marked?: Set<string>;
}) {
  const { colors } = useTheme();
  const first = `${month}-01`;
  const offset = (weekdayOf(first) + 6) % 7; // lundi = 0
  const days: (string | null)[] = Array.from({ length: offset }, () => null);
  for (let d = first; d.startsWith(month); d = addDays(d, 1)) days.push(d);
  while (days.length % 7) days.push(null);
  const weeks = Array.from({ length: days.length / 7 }, (_, i) => days.slice(i * 7, i * 7 + 7));
  const title = capitalize(formatMonth(month));
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <IconButton icon={ChevronLeft} label="Mois précédent" onPress={() => onMonthChange(shiftMonth(month, -1))} size={40} />
        <Text variant="headline" align="center" style={{ flex: 1 }} accessibilityLiveRegion="polite">
          {title}
        </Text>
        <IconButton icon={ChevronRight} label="Mois suivant" onPress={() => onMonthChange(shiftMonth(month, 1))} size={40} />
      </View>
      <View style={{ flexDirection: "row" }}>
        {WEEKDAY_LETTERS.map((l, i) => (
          <Text key={i} variant="caption" tone="tertiary" align="center" style={{ flex: 1 }} accessibilityLabel={WEEKDAY_NAMES[i]}>
            {l}
          </Text>
        ))}
      </View>
      {weeks.map((week, wi) => (
        <View key={wi} style={{ flexDirection: "row" }}>
          {week.map((date, di) => {
            if (!date) return <View key={di} style={{ flex: 1, height: 44 }} />;
            const isSelected = date === selected;
            const isToday = date === today;
            return (
              <PressableScale
                key={date}
                onPress={() => onSelect(date)}
                haptic="selection"
                scaleTo={0.9}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={`${formatDayLong(date)}${isToday ? ", aujourd'hui" : ""}`}
                style={{ flex: 1, height: 44, alignItems: "center", justifyContent: "center" }}
              >
                <View
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 19,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: isSelected ? colors.accentFill : "transparent",
                    borderWidth: isToday && !isSelected ? 1.5 : 0,
                    borderColor: colors.accent,
                  }}
                >
                  <Text
                    variant="callout"
                    weight={isSelected || isToday ? "semibold" : "regular"}
                    style={{ color: isSelected ? colors.onAccent : isToday ? colors.accentText : colors.text }}
                    tabular
                  >
                    {Number(date.slice(8))}
                  </Text>
                </View>
                {marked?.has(date) ? (
                  <View
                    style={{
                      position: "absolute",
                      bottom: 2,
                      width: 5,
                      height: 5,
                      borderRadius: 3,
                      backgroundColor: isSelected ? colors.accentFill : colors.spark,
                    }}
                  />
                ) : null}
              </PressableScale>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/** Heure « HH:MM » saisie au clavier numérique (les deux-points s'ajoutent seuls). */
export function TimeField({
  label,
  value,
  onChange,
  error,
  testID,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  testID?: string;
}) {
  return (
    <TextField
      label={label}
      value={value}
      onChangeText={(text) => {
        const digits = text.replace(/\D/g, "").slice(0, 4);
        onChange(digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits);
      }}
      placeholder="08:00"
      keyboardType="number-pad"
      maxLength={5}
      error={error}
      testID={testID}
    />
  );
}
