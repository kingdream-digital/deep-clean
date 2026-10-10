import { View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { AlarmClock, Bell, CalendarClock, CircleDollarSign, FileClock, FilePen, Info, Receipt, Users, UserX } from "lucide-react-native";
import { formatDayLong, formatEuro, type DashboardDto, type MissionDto } from "@aussitot/shared";
import { endpoints } from "@/api/endpoints";
import { useAuth } from "@/auth/AuthProvider";
import { AssistantHero } from "@/assistant/AssistantHero";
import { DirectionsButton, MissionCard } from "@/features/missions/MissionCard";
import { MetricTile } from "@/features/MetricTile";
import { MissionStatusBadge } from "@/features/status";
import { greeting } from "@/lib/format";
import { useBreakpoint, useTheme } from "@/theme/ThemeProvider";
import { Avatar, Button, Card, EmptyState, ErrorState, IconButton, PressableScale, Screen, SectionTitle, Skeleton, SkeletonList, Text } from "@/ui";

/**
 * Accueil : en un coup d'œil, où aller, quand, quoi faire, et ce qui demande
 * une action (factures en retard, devis à relancer, missions sans équipe).
 */
export default function HomeScreen() {
  const { colors } = useTheme();
  const { isWide, isCompact } = useBreakpoint();
  const router = useRouter();
  const { user } = useAuth();
  const dashboard = useQuery({ queryKey: ["dashboard"], queryFn: endpoints.dashboard, refetchInterval: 60_000 });
  const data = dashboard.data;

  const headerActions = isCompact ? (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      <View>
        <IconButton icon={Bell} label={data?.unreadNotifications ? `Notifications, ${data.unreadNotifications} non lues` : "Notifications"} onPress={() => router.push("/notifications")} variant="tinted" testID="home-notifications" />
        {data?.unreadNotifications ? (
          <View pointerEvents="none" style={{ position: "absolute", top: 6, right: 6, width: 10, height: 10, borderRadius: 5, backgroundColor: colors.spark, borderWidth: 2, borderColor: colors.surfaceMuted }} />
        ) : null}
      </View>
      {user ? (
        <PressableScale onPress={() => router.push("/profil")} accessibilityLabel="Mon profil" scaleTo={0.94} testID="home-profile">
          <Avatar firstName={user.firstName} lastName={user.lastName} size={40} />
        </PressableScale>
      ) : null}
    </View>
  ) : undefined;

  const subtitle = data ? capitalize(formatDayLong(data.today, { year: false })) : " ";

  return (
    <Screen
      title={`${greeting()} ${user?.firstName ?? ""}`.trim()}
      subtitle={subtitle}
      actions={headerActions}
      refreshing={dashboard.isRefetching}
      onRefresh={() => void dashboard.refetch()}
      testID="home"
    >
      {dashboard.isPending ? (
        <View style={{ gap: 16 }}>
          <Skeleton height={150} radius={24} />
          <SkeletonList rows={3} />
        </View>
      ) : dashboard.isError && !data ? (
        <ErrorState error={dashboard.error} onRetry={() => void dashboard.refetch()} />
      ) : data ? (
        <View style={{ flexDirection: isWide ? "row" : "column", gap: 24, alignItems: "flex-start" }}>
          <View style={{ flex: isWide ? 1.4 : undefined, width: isWide ? undefined : "100%", gap: 24 }}>
            <AssistantHero />
            <FocusMission data={data} />
            <TodaySection data={data} />
          </View>
          {data.sales || data.team ? (
            <View style={{ flex: isWide ? 1 : undefined, width: isWide ? undefined : "100%", gap: 24 }}>
              {data.sales ? <SalesSection sales={data.sales} /> : null}
              {data.team ? <TeamSection team={data.team} /> : null}
            </View>
          ) : null}
        </View>
      ) : null}
    </Screen>
  );
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Mission en cours, sinon la prochaine : l'information la plus utile sur le terrain. */
function FocusMission({ data }: { data: DashboardDto }) {
  const { colors, radius } = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const mine = (m: MissionDto) => m.assignees.some((a) => a.id === user?.id) || m.teamLead?.id === user?.id;
  const current = data.todayMissions.find((m) => m.status === "IN_PROGRESS" && mine(m));
  const mission: MissionDto | null = current ?? data.nextMission;
  if (!mission) return null;
  const isToday = mission.date === data.today;
  const live = mission.status === "IN_PROGRESS";
  return (
    <View style={{ gap: 12 }}>
      <SectionTitle title={live ? "Mission en cours" : "Prochaine mission"} />
      <Card onPress={() => router.push(`/planning/${mission.id}`)} padding={18} elevated testID="home-next-mission">
        <View style={{ gap: 14 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: live ? colors.sparkSoft : colors.accentSoft }}>
              <AlarmClock size={15} color={live ? colors.sparkText : colors.accentText} />
              <Text variant="subhead" weight="semibold" style={{ color: live ? colors.sparkText : colors.accentText }} tabular>
                {isToday ? "Aujourd'hui" : capitalize(formatDayLong(mission.date, { year: false }))} · {mission.startTime} – {mission.endTime}
              </Text>
            </View>
            <View style={{ flex: 1 }} />
            <MissionStatusBadge status={mission.status} />
          </View>
          <View style={{ gap: 4 }}>
            <Text variant="title2">{mission.title}</Text>
            {mission.site ? (
              <Text variant="callout" tone="secondary">
                {mission.site.name}
                {mission.site.address ? `\n${mission.site.address}` : ""}
              </Text>
            ) : mission.client ? (
              <Text variant="callout" tone="secondary">
                {mission.client.name}
              </Text>
            ) : null}
          </View>
          {mission.instructions ? (
            <View style={{ flexDirection: "row", gap: 10, backgroundColor: colors.warningSoft, borderRadius: radius.md, padding: 12 }}>
              <Info size={17} color={colors.warning} />
              <Text variant="subhead" style={{ flex: 1, color: colors.text }} numberOfLines={3}>
                {mission.instructions}
              </Text>
            </View>
          ) : null}
          {mission.site?.address ? (
            <View style={{ flexDirection: "row" }}>
              <DirectionsButton address={mission.site.address} />
            </View>
          ) : null}
        </View>
      </Card>
    </View>
  );
}

function TodaySection({ data }: { data: DashboardDto }) {
  const router = useRouter();
  const { can } = useAuth();
  return (
    <View style={{ gap: 12 }}>
      <SectionTitle
        title={can("planning.readAll") ? "Aujourd'hui dans l'entreprise" : "Votre journée"}
        action={<Button label="Planning" variant="ghost" size="sm" onPress={() => router.push("/planning")} />}
      />
      {data.todayMissions.length === 0 ? (
        <Card>
          <EmptyState icon={CalendarClock} title="Rien de prévu aujourd'hui" message={can("planning.manage") ? "Ajoutez une mission depuis le planning, ou demandez-le à l'assistant." : "Votre planning s'affichera ici dès qu'une mission vous sera attribuée."} />
        </Card>
      ) : (
        <View style={{ gap: 10 }}>
          {data.todayMissions.map((m) => (
            <MissionCard key={m.id} mission={m} />
          ))}
        </View>
      )}
    </View>
  );
}

function SalesSection({ sales }: { sales: NonNullable<DashboardDto["sales"]> }) {
  const router = useRouter();
  const { can } = useAuth();
  const billing = can("invoices.read");
  return (
    <View style={{ gap: 12 }}>
      <SectionTitle title="Ventes" action={<Button label="Tout voir" variant="ghost" size="sm" onPress={() => router.push(billing ? "/factures" : "/devis")} />} />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {billing ? (
          <>
            <MetricTile icon={CircleDollarSign} tone="success" label="Encaissé ce mois" value={formatEuro(sales.collectedThisMonthCents)} onPress={() => router.push("/factures")} testID="kpi-collected" />
            <MetricTile icon={Receipt} label="Facturé ce mois" value={formatEuro(sales.invoicedThisMonthCents)} onPress={() => router.push("/factures")} />
            <MetricTile
              icon={FileClock}
              tone={sales.invoicesOverdueCount ? "danger" : "accent"}
              label="En retard"
              value={formatEuro(sales.invoicesOverdueCents)}
              caption={sales.invoicesOverdueCount ? `${sales.invoicesOverdueCount} facture${sales.invoicesOverdueCount > 1 ? "s" : ""} à relancer` : "Aucune facture en retard"}
              onPress={() => router.push("/factures?filtre=retard")}
              testID="kpi-overdue"
            />
          </>
        ) : null}
        <MetricTile
          icon={FilePen}
          tone="spark"
          label="Devis en attente"
          value={formatEuro(sales.quotesPendingCents)}
          caption={`${sales.quotesToFollowUp} devis envoyé${sales.quotesToFollowUp > 1 ? "s" : ""} sans réponse`}
          onPress={() => router.push("/devis?filtre=envoyes")}
        />
      </View>
      {sales.draftsCount ? (
        <Text variant="footnote" tone="tertiary">
          {sales.draftsCount} brouillon{sales.draftsCount > 1 ? "s" : ""} en cours (devis et factures).
        </Text>
      ) : null}
    </View>
  );
}

function TeamSection({ team }: { team: NonNullable<DashboardDto["team"]> }) {
  const router = useRouter();
  return (
    <View style={{ gap: 12 }}>
      <SectionTitle title="Équipe" />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        <MetricTile icon={Users} label="Membres actifs" value={String(team.activeMembers)} onPress={() => router.push("/equipe")} />
        <MetricTile icon={CalendarClock} label="Missions aujourd'hui" value={String(team.missionsToday)} onPress={() => router.push("/planning")} />
        <MetricTile
          icon={UserX}
          tone={team.missionsUnassigned ? "warning" : "accent"}
          label="Sans équipe"
          value={String(team.missionsUnassigned)}
          caption={team.missionsUnassigned ? "À affecter" : "Tout est affecté"}
          onPress={() => router.push("/planning")}
        />
      </View>
    </View>
  );
}
