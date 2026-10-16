import React, { useCallback, useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useRoute, type RouteProp } from "@react-navigation/native";
import { useTheme } from "../../theme/ThemeProvider";
import { Button } from "../../components/Button";
import { StateView } from "../../components/StateView";
import { getPublicNews, type PublicNews } from "../../api/public.api";
import type { PublicStackParamList } from "../../navigation/RootNavigator";
import { NewsCover, newsDate, usePublicNavigation } from "./publicUi";

// Détail d'une actualité de l'accueil public (sans compte).
export function PublicNewsDetailScreen() {
  const { colors, spacing, type } = useTheme();
  const navigation = usePublicNavigation();
  const { params } = useRoute<RouteProp<PublicStackParamList, "PublicNewsDetail">>();
  const [news, setNews] = useState<PublicNews | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  const load = useCallback(async () => {
    setState("loading");
    try {
      setNews(await getPublicNews(params.newsId));
      setState("ready");
    } catch {
      setState("error");
    }
  }, [params.newsId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (state === "loading") return <StateView kind="loading" />;
  if (state === "error" || !news) return <StateView kind="error" message="Cette actualité n'est plus disponible." onRetry={() => void load()} />;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ paddingBottom: spacing.xxl }}>
      <NewsCover news={news} height={240} />
      <View style={{ padding: spacing.lg }}>
        <Text style={[type.caption, { color: colors.inkTertiary }]}>DEEP CLEAN · {newsDate.format(new Date(news.publishedAt))}</Text>
        <Text style={[type.title1, { color: colors.ink, marginTop: spacing.xs }]}>{news.title}</Text>
        <Text style={[type.body, { color: colors.inkSecondary, marginTop: spacing.md, lineHeight: 25 }]}>{news.body}</Text>
        <View style={{ marginTop: spacing.xl }}>
          <Button label="Demander un devis gratuit" icon="document-text-outline" onPress={() => navigation.navigate("QuoteRequest")} />
        </View>
      </View>
    </ScrollView>
  );
}
