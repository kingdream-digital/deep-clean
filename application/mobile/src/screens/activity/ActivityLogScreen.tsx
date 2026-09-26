import React, { useCallback, useState } from "react";
import { FlatList, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { ScreenContainer } from "../../components/ScreenContainer";
import { StateView } from "../../components/StateView";
import { Card } from "../../components/Card";
import { SegmentedControl } from "../../components/SegmentedControl";
import { DataTable, DataTableColumn } from "../../components/DataTable";
import { useTheme } from "../../theme/ThemeProvider";
import { useResponsive } from "../../hooks/useResponsive";
import { listActivityLogs } from "../../api/activityLog.api";
import type { ActivityLogEntry } from "../../api/activityLog.api";
import { formatAction } from "../../utils/activityLogLabels";
import { toLocalDateKey } from "../../utils/missionFormat";

const dateTimeFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

type Period = "today" | "7d" | "30d" | "all";

const PERIODS: { label: string; value: Period }[] = [
  { label: "Aujourd'hui", value: "today" },
  { label: "7 jours", value: "7d" },
  { label: "30 jours", value: "30d" },
  { label: "Tout", value: "all" },
];

function periodToFrom(period: Period): string | undefined {
  if (period === "all") return undefined;
  const days = period === "today" ? 0 : period === "7d" ? 7 : 30;
  const d = new Date();
  d.setDate(d.getDate() - days);
  return toLocalDateKey(d);
}

const ENTITY_LABELS: Record<string, string> = {
  User: "Compte",
  Site: "Chantier",
  Mission: "Mission",
  Problem: "Signalement",
  TimeEntry: "Pointage",
  Absence: "Absence",
  CleaningStandard: "Standard",
};

// Journal d'activité (cahier des charges §21) — jusqu'ici les actions
// sensibles étaient bien enregistrées côté serveur mais aucun écran ne
// permettait de les consulter : en cas d'incident ("qui a désactivé ce
// compte ?"), la RH/direction n'avait aucun moyen de le savoir depuis
// l'application. Réservé RH/Direction/Admin (voir activity.routes.ts).
const TABLE_COLUMNS: DataTableColumn<ActivityLogEntry>[] = [
  {
    key: "action",
    label: "Action",
    flex: 2,
    render: (item) => <ActivityActionCell item={item} />,
  },
  {
    key: "user",
    label: "Utilisateur",
    render: (item) => <ActivityFootnoteCell text={item.user ? `${item.user.firstName} ${item.user.lastName}` : "Système"} />,
  },
  {
    key: "entity",
    label: "Élément",
    render: (item) => <ActivityFootnoteCell text={item.entityType ? ENTITY_LABELS[item.entityType] ?? item.entityType : "—"} />,
  },
  {
    key: "date",
    label: "Date",
    render: (item) => <ActivityFootnoteCell text={dateTimeFmt.format(new Date(item.createdAt))} />,
  },
];

export function ActivityLogScreen() {
  const { colors, spacing, type } = useTheme();
  const { isDesktopWeb } = useResponsive();
  const [period, setPeriod] = useState<Period>("7d");
  const [items, setItems] = useState<ActivityLogEntry[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  const load = useCallback(async () => {
    try {
      setState("loading");
      const res = await listActivityLogs({ from: periodToFrom(period), pageSize: 100 });
      setItems(res.items);
      setState("ready");
    } catch {
      setState("error");
    }
  }, [period]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  return (
    <ScreenContainer style={{ paddingTop: spacing.md }}>
      <View style={{ marginBottom: spacing.md }}>
        <SegmentedControl value={period} onChange={setPeriod} options={PERIODS} />
      </View>

      {state === "loading" && <StateView kind="loading" />}
      {state === "error" && <StateView kind="error" onRetry={load} />}
      {state === "ready" && items.length === 0 && (
        <StateView kind="empty" icon="time-outline" message="Aucune activité sur cette période." />
      )}

      {state === "ready" && items.length > 0 && isDesktopWeb && (
        <DataTable columns={TABLE_COLUMNS} data={items} keyExtractor={(item) => item.id} />
      )}

      {state === "ready" && items.length > 0 && !isDesktopWeb && (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: spacing.xxl }}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          renderItem={({ item }) => (
            <Card>
              <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
                <View style={{ flex: 1, marginRight: spacing.sm }}>
                  <Text style={[type.headline, { color: colors.ink }]}>{formatAction(item.action)}</Text>
                  <Text style={[type.footnote, { color: colors.inkSecondary, marginTop: 2 }]}>
                    {item.user ? `${item.user.firstName} ${item.user.lastName}` : "Système"}
                    {item.entityType ? ` · ${ENTITY_LABELS[item.entityType] ?? item.entityType}` : ""}
                  </Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Ionicons name="time-outline" size={13} color={colors.inkTertiary} />
                  <Text style={[type.caption, { color: colors.inkTertiary, marginLeft: 4 }]}>
                    {dateTimeFmt.format(new Date(item.createdAt))}
                  </Text>
                </View>
              </View>
            </Card>
          )}
        />
      )}
    </ScreenContainer>
  );
}

function ActivityActionCell({ item }: { item: ActivityLogEntry }) {
  const { colors, type } = useTheme();
  return (
    <Text style={[type.callout, { color: colors.ink, fontWeight: "600" }]} numberOfLines={1}>
      {formatAction(item.action)}
    </Text>
  );
}

function ActivityFootnoteCell({ text }: { text: string }) {
  const { colors, type } = useTheme();
  return (
    <Text style={[type.footnote, { color: colors.inkSecondary }]} numberOfLines={1}>
      {text}
    </Text>
  );
}
