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
import { QuoteStatusBadge } from "../../components/QuoteStatusBadge";
import { useTheme } from "../../theme/ThemeProvider";
import { listQuotes } from "../../api/quotes.api";
import type { Quote, QuoteStatus } from "../../api/quotes.api";
import type { MenuStackParamList } from "../../navigation/MenuStack";

type Tab = "current" | "accepted" | "closed";

const TAB_STATUSES: Record<Tab, QuoteStatus[]> = {
  current: ["DRAFT", "TO_VALIDATE", "VALIDATED", "SENT", "FOLLOW_UP"],
  accepted: ["ACCEPTED"],
  closed: ["REJECTED", "EXPIRED"],
};

const currencyFmt = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });

export function QuotesListScreen() {
  const { colors, spacing, radius, type } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<MenuStackParamList>>();

  const [tab, setTab] = useState<Tab>("current");
  const [items, setItems] = useState<Quote[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  const load = useCallback(async (activeTab: Tab) => {
    try {
      setState("loading");
      const res = await listQuotes({ status: TAB_STATUSES[activeTab] });
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
          { label: "En cours", value: "current" },
          { label: "Acceptés", value: "accepted" },
          { label: "Clos", value: "closed" },
        ]}
      />

      <View style={{ height: spacing.md }} />

      {state === "loading" && <StateView kind="loading" />}
      {state === "error" && <StateView kind="error" onRetry={() => load(tab)} />}
      {state === "ready" && items.length === 0 && (
        <StateView kind="empty" icon="document-text-outline" message="Aucun devis dans cette catégorie." />
      )}

      {state === "ready" && items.length > 0 && (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: spacing.xxxl }}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          renderItem={({ item, index }) => (
            <Animated.View entering={FadeInUp.delay(Math.min(index, 6) * 40).duration(280)}>
              <PressableScale onPress={() => navigation.navigate("QuoteDetail", { quoteId: item.id })}>
                <Card>
                  <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
                    <View style={{ flex: 1, marginRight: spacing.sm }}>
                      <Text style={[type.footnote, { color: colors.inkTertiary }]}>{item.quoteNumber}</Text>
                      <Text style={[type.headline, { color: colors.ink, marginTop: 1 }]} numberOfLines={1}>
                        {item.client.companyName}
                      </Text>
                      {item.subject && (
                        <Text style={[type.footnote, { color: colors.inkSecondary, marginTop: 2 }]} numberOfLines={1}>
                          {item.subject}
                        </Text>
                      )}
                    </View>
                    <QuoteStatusBadge status={item.status} />
                  </View>

                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.sm }}>
                    <Text style={[type.callout, { color: colors.ink, fontWeight: "700" }]}>{currencyFmt.format(item.totalTtc)}</Text>
                    {item.monthlyAmountHt > 0 && (
                      <Text style={[type.footnote, { color: colors.inkTertiary }]}>
                        {currencyFmt.format(item.monthlyAmountHt)} HT / mois
                      </Text>
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
          onPress={() => navigation.navigate("QuoteForm", undefined)}
          accessibilityRole="button"
          accessibilityLabel="Nouveau devis"
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
