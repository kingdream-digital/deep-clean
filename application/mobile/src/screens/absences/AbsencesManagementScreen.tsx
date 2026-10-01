import React, { useCallback, useState } from "react";
import { FlatList, Text, View } from "react-native";
import { Alert } from "../../utils/alert";
import { useFocusEffect } from "@react-navigation/native";
import { ScreenContainer } from "../../components/ScreenContainer";
import { StateView } from "../../components/StateView";
import { Card } from "../../components/Card";
import { Avatar } from "../../components/Avatar";
import { Button } from "../../components/Button";
import { SegmentedControl } from "../../components/SegmentedControl";
import { AbsenceStatusBadge } from "../../components/AbsenceStatusBadge";
import { DataTable, DataTableColumn } from "../../components/DataTable";
import { useTheme } from "../../theme/ThemeProvider";
import { useResponsive } from "../../hooks/useResponsive";
import { extractErrorMessage } from "../../api/client";
import { cancelAbsence, listAbsences, decideAbsence } from "../../api/absences.api";
import type { Absence, AbsenceStatus } from "../../api/absences.api";
import { formatAbsencePeriod } from "../../utils/frenchDate";
import { formatDaysWithUnit } from "../../utils/leaveDays";

const TYPE_LABELS: Record<Absence["type"], string> = {
  PAID_LEAVE: "Congé payé",
  SICK_LEAVE: "Maladie",
  UNPAID_LEAVE: "Sans solde",
  OTHER: "Autre",
};

// « 19 – 23 oct. 2026 », jours calendaires tels qu'enregistrés : voir
// formatAbsencePeriod (la date de fin s'affichait le lendemain à Paris).
function formatRange(start: string, end: string): string {
  return formatAbsencePeriod(start, end);
}

const FILTERS: { label: string; value: AbsenceStatus | "ALL" }[] = [
  { label: "En attente", value: "PENDING" },
  { label: "Approuvées", value: "APPROVED" },
  { label: "Toutes", value: "ALL" },
];

// La RH (et direction/admin) décide des demandes d'absence des employés — au
// moment de l'approbation, le serveur détecte automatiquement les missions
// déjà planifiées sur la période et alerte les responsables concernés (voir
// absences.service.ts `notifyMissionConflicts`), pas besoin de le refaire ici.
export function AbsencesManagementScreen() {
  const { colors, spacing, type } = useTheme();
  const { isDesktopWeb } = useResponsive();
  const [filter, setFilter] = useState<AbsenceStatus | "ALL">("PENDING");
  const [items, setItems] = useState<Absence[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [decidingId, setDecidingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setState("loading");
      const res = await listAbsences(filter === "ALL" ? {} : { status: filter });
      setItems(res.items);
      setState("ready");
    } catch {
      setState("error");
    }
  }, [filter]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  async function handleDecide(id: string, status: "APPROVED" | "REJECTED") {
    setDecidingId(id);
    try {
      await decideAbsence(id, status);
      await load();
    } catch (err) {
      Alert.alert("Action impossible", extractErrorMessage(err));
    } finally {
      setDecidingId(null);
    }
  }

  function confirmReject(item: Absence) {
    Alert.alert(
      "Refuser cette demande ?",
      `${item.user.firstName} ${item.user.lastName} — ${formatRange(item.startDate, item.endDate)}`,
      [
        { text: "Annuler", style: "cancel" },
        { text: "Refuser", style: "destructive", onPress: () => void handleDecide(item.id, "REJECTED") },
      ]
    );
  }

  async function handleCancel(item: Absence) {
    setDecidingId(item.id);
    try {
      await cancelAbsence(item.id);
      await load();
    } catch (err) {
      Alert.alert("Annulation impossible", extractErrorMessage(err));
    } finally {
      setDecidingId(null);
    }
  }

  function confirmCancel(item: Absence) {
    Alert.alert(
      "Annuler ce congé déjà approuvé ?",
      `${item.user.firstName} ${item.user.lastName} — ${item.daysCount} jour${item.daysCount > 1 ? "s" : ""} recrédité${
        item.daysCount > 1 ? "s" : ""
      } si c'est un congé payé.`,
      [
        { text: "Retour", style: "cancel" },
        { text: "Annuler le congé", style: "destructive", onPress: () => void handleCancel(item) },
      ]
    );
  }

  const tableColumns: DataTableColumn<Absence>[] = [
    {
      key: "employee",
      label: "Employé",
      flex: 1.4,
      render: (item) => (
        <Text style={[type.callout, { color: colors.ink, fontWeight: "600" }]} numberOfLines={1}>
          {item.user.firstName} {item.user.lastName}
        </Text>
      ),
    },
    {
      key: "type",
      label: "Type",
      render: (item) => <Text style={[type.footnote, { color: colors.inkSecondary }]}>{TYPE_LABELS[item.type]}</Text>,
    },
    {
      key: "period",
      label: "Période",
      flex: 1.4,
      render: (item) => (
        <Text style={[type.footnote, { color: colors.inkSecondary }]}>{formatRange(item.startDate, item.endDate)}</Text>
      ),
    },
    {
      key: "reason",
      label: "Motif",
      flex: 1.6,
      render: (item) => (
        <Text style={[type.footnote, { color: colors.inkTertiary }]} numberOfLines={1}>
          {item.reason || "—"}
        </Text>
      ),
    },
    {
      key: "status",
      label: "Statut",
      render: (item) => <AbsenceStatusBadge status={item.status} />,
    },
    {
      key: "actions",
      label: "",
      flex: 1.6,
      render: (item) =>
        item.status === "PENDING" ? (
          <View style={{ flexDirection: "row", gap: spacing.xs }}>
            <View style={{ flex: 1 }}>
              <Button
                label="Refuser"
                variant="secondary"
                size="md"
                loading={decidingId === item.id}
                onPress={() => confirmReject(item)}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                label="Approuver"
                size="md"
                loading={decidingId === item.id}
                onPress={() => void handleDecide(item.id, "APPROVED")}
              />
            </View>
          </View>
        ) : item.status === "APPROVED" ? (
          <Button
            label="Annuler"
            variant="secondary"
            size="md"
            loading={decidingId === item.id}
            onPress={() => confirmCancel(item)}
          />
        ) : null,
    },
  ];

  return (
    <ScreenContainer style={{ paddingTop: spacing.md }}>
      <View style={{ marginBottom: spacing.md }}>
        <SegmentedControl value={filter} onChange={setFilter} options={FILTERS} />
      </View>

      {state === "loading" && <StateView kind="loading" />}
      {state === "error" && <StateView kind="error" onRetry={load} />}
      {state === "ready" && items.length === 0 && (
        <StateView kind="empty" icon="calendar-outline" message="Aucune demande dans cette catégorie." />
      )}

      {state === "ready" && items.length > 0 && isDesktopWeb && (
        <DataTable columns={tableColumns} data={items} keyExtractor={(item) => item.id} />
      )}

      {state === "ready" && items.length > 0 && !isDesktopWeb && (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: spacing.xxl }}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          renderItem={({ item }) => (
            <Card>
              {/* Qui demande (photo à l'appui), quoi, quand. Le statut n'est
                  affiché que dans « Approuvées » et « Toutes » : dans « En
                  attente », il répétait sur chaque carte le nom de l'onglet et
                  coupait le nom en deux (« Emma / Rousseau »). */}
              <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
                <View style={{ marginRight: spacing.sm }}>
                  <Avatar user={item.user} size={40} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[type.headline, { color: colors.ink }]} numberOfLines={1}>
                    {item.user.firstName} {item.user.lastName}
                  </Text>
                  <Text style={[type.footnote, { color: colors.inkSecondary, marginTop: 2 }]}>
                    {TYPE_LABELS[item.type]} · {formatDaysWithUnit(item.daysCount)}
                  </Text>
                  <Text style={[type.footnote, { color: colors.inkSecondary, marginTop: 1 }]}>
                    {formatRange(item.startDate, item.endDate)}
                  </Text>
                  {item.reason && (
                    <Text style={[type.footnote, { color: colors.inkTertiary, marginTop: 4 }]}>{item.reason}</Text>
                  )}
                  {filter !== "PENDING" && (
                    <View style={{ marginTop: spacing.xs }}>
                      <AbsenceStatusBadge status={item.status} />
                    </View>
                  )}
                </View>
              </View>

              {item.status === "PENDING" && (
                <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
                  <View style={{ flex: 1 }}>
                    <Button
                      label="Refuser"
                      variant="secondary"
                      size="md"
                      loading={decidingId === item.id}
                      onPress={() => confirmReject(item)}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button
                      label="Approuver"
                      size="md"
                      loading={decidingId === item.id}
                      onPress={() => void handleDecide(item.id, "APPROVED")}
                    />
                  </View>
                </View>
              )}
              {item.status === "APPROVED" && (
                <View style={{ marginTop: spacing.md }}>
                  <Button
                    label="Annuler ce congé"
                    variant="secondary"
                    size="md"
                    loading={decidingId === item.id}
                    onPress={() => confirmCancel(item)}
                  />
                </View>
              )}
            </Card>
          )}
        />
      )}
    </ScreenContainer>
  );
}
