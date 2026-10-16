import React, { useCallback, useState } from "react";
import { FlatList, RefreshControl, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInUp } from "react-native-reanimated";
import { useTheme } from "../../theme/ThemeProvider";
import { Card } from "../../components/Card";
import { PressableScale } from "../../components/PressableScale";
import { StateView } from "../../components/StateView";
import { listPublicNews, type PublicNews } from "../../api/public.api";
import { NewsCover, TabTitle, newsDate, usePublicNavigation } from "./publicUi";

// Onglet « Actualités » de l'accueil public : les actualités que la RH ou la
// direction a choisi d'afficher pour tout le monde, depuis leur espace
// (Actualités → « Afficher aussi sur l'accueil public »).
export function PublicNewsScreen() {
  const { colors, spacing, type } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = usePublicNavigation();
  const [items, setItems] = useState<PublicNews[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await listPublicNews(1, 30);
      setItems(data.items);
      setState("ready");
    } catch {
      setState((prev) => (prev === "ready" ? "ready" : "error"));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const header = <TabTitle title="Actualités" subtitle="Les nouvelles de Deep Clean." top={insets.top} />;

  if (state !== "ready") {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.lg }}>
        {header}
        {state === "loading" ? (
          <StateView kind="loading" />
        ) : (
          <StateView kind="offline" message="Les actualités n'ont pas pu être chargées." onRetry={() => void load()} />
        )}
      </View>
    );
  }

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl }}
      data={items}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={header}
      ListEmptyComponent={<StateView kind="empty" message="Les actualités de Deep Clean apparaîtront ici." />}
      ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={colors.accent} />}
      renderItem={({ item, index }) => (
        <Animated.View entering={FadeInUp.delay(Math.min(index, 6) * 40).duration(280)}>
          <PressableScale onPress={() => navigation.navigate("PublicNewsDetail", { newsId: item.id })} accessibilityRole="button">
            <Card padded={false} style={{ overflow: "hidden" }}>
              <NewsCover news={item} height={170} />
              <View style={{ padding: spacing.md }}>
                <Text style={[type.caption, { color: colors.inkTertiary }]}>{newsDate.format(new Date(item.publishedAt))}</Text>
                <Text style={[type.headline, { color: colors.ink, marginTop: 2 }]}>{item.title}</Text>
                <Text style={[type.subhead, { color: colors.inkSecondary, marginTop: spacing.xxs }]} numberOfLines={3}>
                  {item.body}
                </Text>
              </View>
            </Card>
          </PressableScale>
        </Animated.View>
      )}
    />
  );
}
