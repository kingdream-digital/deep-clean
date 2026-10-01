import React, { useCallback, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Animated, { FadeInUp } from "react-native-reanimated";
import { ScreenContainer } from "../../components/ScreenContainer";
import { StateView } from "../../components/StateView";
import { Card } from "../../components/Card";
import { PressableScale } from "../../components/PressableScale";
import { SegmentedControl } from "../../components/SegmentedControl";
import { InvoiceStatusBadge } from "../../components/InvoiceStatusBadge";
import { useTheme } from "../../theme/ThemeProvider";
import { listInvoices } from "../../api/invoices.api";
import type { Invoice, InvoiceStatus } from "../../api/invoices.api";
import type { MenuStackParamList } from "../../navigation/MenuStack";

type Tab = "toPrepare" | "sent" | "paid";

const TAB_STATUSES: Record<Tab, InvoiceStatus[]> = {
  toPrepare: ["DRAFT", "VALIDATED"],
  sent: ["SENT"],
  paid: ["PAID"],
};

const dateFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });
const currencyFmt = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });

export function InvoicesListScreen() {
  const { colors, spacing, radius, type } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<MenuStackParamList>>();

  const [tab, setTab] = useState<Tab>("toPrepare");
  const [items, setItems] = useState<Invoice[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  const load = useCallback(async (activeTab: Tab) => {
    try {
      setState("loading");
      const res = await listInvoices({ status: TAB_STATUSES[activeTab] });
      setItems(res.items);
      setState("ready");
    } catch {
      setState("error");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load(tab);
    }, [tab, load])
  );

  return (
    <ScreenContainer style={{ paddingTop: spacing.md }}>
      <SegmentedControl
        value={tab}
        onChange={setTab}
        options={[
          { label: "À préparer", value: "toPrepare" },
          { label: "Envoyées", value: "sent" },
          { label: "Payées", value: "paid" },
        ]}
      />

      <View style={{ height: spacing.md }} />

      {state === "loading" && <StateView kind="loading" />}
      {state === "error" && <StateView kind="error" onRetry={() => load(tab)} />}
      {state === "ready" && items.length === 0 && (
        <StateView kind="empty" icon="receipt-outline" message="Aucune facture dans cette catégorie." />
      )}

      {state === "ready" && items.length > 0 && (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: spacing.xxxl }}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          renderItem={({ item, index }) => (
            <Animated.View entering={FadeInUp.delay(Math.min(index, 6) * 40).duration(280)}>
              <PressableScale onPress={() => navigation.navigate("InvoiceDetail", { invoiceId: item.id })}>
                <Card>
                  <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
                    <View style={{ flex: 1, marginRight: spacing.sm }}>
                      <Text style={[type.footnote, { color: colors.inkTertiary }]}>{item.invoiceNumber}</Text>
                      <Text style={[type.headline, { color: colors.ink, marginTop: 1 }]} numberOfLines={1}>
                        {item.client.companyName}
                      </Text>
                    </View>
                    <InvoiceStatusBadge status={item.status} />
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.sm }}>
                    <Text style={[type.callout, { color: colors.ink, fontWeight: "700" }]}>{currencyFmt.format(item.totalTtc)}</Text>
                    {item.dueDate && (
                      <View style={{ flexDirection: "row", alignItems: "center" }}>
                        <Ionicons name="calendar-outline" size={13} color={colors.inkTertiary} />
                        <Text style={[type.footnote, { color: colors.inkTertiary, marginLeft: 4 }]}>
                          Échéance {dateFmt.format(new Date(item.dueDate))}
                        </Text>
                      </View>
                    )}
                  </View>
                </Card>
              </PressableScale>
            </Animated.View>
          )}
        />
      )}

      <Animated.View entering={FadeInUp.duration(280)} style={styles.fab}>
        <PressableScale
          pressedScale={0.9}
          onPress={() => navigation.navigate("InvoiceForm", undefined)}
          accessibilityRole="button"
          accessibilityLabel="Nouvelle facture"
          style={[styles.fabInner, { backgroundColor: colors.accentFill, borderRadius: radius.pill, shadowColor: colors.shadow }]}
        >
          <Ionicons name="add" size={26} color={colors.onAccent} />
        </PressableScale>
      </Animated.View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  fab: { position: "absolute", right: 20, bottom: 24 },
  fabInner: {
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
});
