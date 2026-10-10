import { View } from "react-native";
import { useRouter } from "expo-router";
import { CalendarDays, ChevronRight, FileText, Receipt, UserRound } from "lucide-react-native";
import { formatEuro, type AssistantCard } from "@aussitot/shared";
import { useTheme } from "@/theme/ThemeProvider";
import { AvatarStack, Card, PressableScale, Text } from "@/ui";
import { InvoiceStatusBadge, MissionStatusBadge, QuoteStatusBadge } from "@/features/status";
import { formatDayShort } from "@/lib/format";

/** Carte de résultat affichée dans la conversation : un aperçu, et un toucher pour ouvrir l'élément. */
export function ResultCard({ card }: { card: AssistantCard }) {
  const { colors } = useTheme();
  const router = useRouter();

  switch (card.kind) {
    case "quote": {
      const q = card.quote;
      return (
        <Card onPress={() => router.push(`/devis/${q.id}`)} padding={14} accessibilityLabel={`Devis ${q.number}, ${q.clientName}, ${formatEuro(q.totalCents)}`}>
          <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
            <IconTile icon={<FileText size={18} color={colors.accentText} />} bg={colors.accentSoft} />
            <View style={{ flex: 1, gap: 3 }}>
              <Text variant="headline" numberOfLines={1}>
                {q.clientName}
              </Text>
              <Text variant="footnote" tone="secondary" numberOfLines={1}>
                Devis {q.number}
                {q.title ? ` · ${q.title}` : ""}
              </Text>
            </View>
            <View style={{ alignItems: "flex-end", gap: 6 }}>
              <Text variant="headline" tabular>
                {formatEuro(q.totalCents)}
              </Text>
              <QuoteStatusBadge status={q.status} />
            </View>
          </View>
        </Card>
      );
    }
    case "invoice": {
      const i = card.invoice;
      return (
        <Card onPress={() => router.push(`/factures/${i.id}`)} padding={14} accessibilityLabel={`Facture ${i.number ?? "brouillon"}, ${i.clientName}, ${formatEuro(i.totalCents)}`}>
          <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
            <IconTile icon={<Receipt size={18} color={colors.sparkText} />} bg={colors.sparkSoft} />
            <View style={{ flex: 1, gap: 3 }}>
              <Text variant="headline" numberOfLines={1}>
                {i.clientName}
              </Text>
              <Text variant="footnote" tone="secondary" numberOfLines={1}>
                {i.kind === "CREDIT_NOTE" ? "Avoir" : "Facture"} {i.number ?? "brouillon"}
                {i.dueDate ? ` · échéance ${formatDayShort(i.dueDate, { year: false })}` : ""}
              </Text>
            </View>
            <View style={{ alignItems: "flex-end", gap: 6 }}>
              <Text variant="headline" tabular>
                {formatEuro(i.totalCents)}
              </Text>
              <InvoiceStatusBadge status={i.status} overdue={i.isOverdue} kind={i.kind} />
            </View>
          </View>
        </Card>
      );
    }
    case "client":
      return (
        <Card onPress={() => router.push(`/clients/${card.client.id}`)} padding={14}>
          <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
            <IconTile icon={<UserRound size={18} color={colors.accentText} />} bg={colors.accentSoft} />
            <View style={{ flex: 1, gap: 3 }}>
              <Text variant="headline">{card.client.name}</Text>
              <Text variant="footnote" tone="secondary" numberOfLines={1}>
                {[card.client.city, card.client.email, card.client.phone].filter(Boolean).join(" · ") || "Fiche client"}
              </Text>
            </View>
            <ChevronRight size={18} color={colors.textTertiary} />
          </View>
        </Card>
      );
    case "mission": {
      const m = card.mission;
      return (
        <Card onPress={() => router.push(`/planning/${m.id}`)} padding={14}>
          <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
            <IconTile icon={<CalendarDays size={18} color={colors.accentText} />} bg={colors.accentSoft} />
            <View style={{ flex: 1, gap: 3 }}>
              <Text variant="headline" numberOfLines={1}>
                {m.title}
              </Text>
              <Text variant="footnote" tone="secondary">
                {formatDayShort(m.date, { year: false })} · {m.startTime}–{m.endTime}
                {m.site ? ` · ${m.site.name}` : ""}
              </Text>
            </View>
            <View style={{ alignItems: "flex-end", gap: 6 }}>
              <AvatarStack people={m.assignees} size={24} />
              <MissionStatusBadge status={m.status} />
            </View>
          </View>
        </Card>
      );
    }
    case "list":
      return (
        <Card padding={0}>
          <View style={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: 6 }}>
            <Text variant="overline" tone="tertiary" uppercase>
              {card.title}
              {card.total !== undefined ? ` · ${card.total}` : ""}
            </Text>
          </View>
          {card.items.slice(0, 8).map((item, index) => (
            <PressableScale
              key={item.id}
              onPress={item.link ? () => router.push(item.link as never) : undefined}
              disabled={!item.link}
              scaleTo={1}
              pressedStyle={{ backgroundColor: colors.surfacePressed }}
              style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 11, borderTopWidth: index === 0 ? 0 : 1, borderTopColor: colors.border }}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="callout" weight="medium" numberOfLines={1}>
                  {item.title}
                </Text>
                {item.subtitle ? (
                  <Text variant="footnote" tone="secondary" numberOfLines={1}>
                    {item.subtitle}
                  </Text>
                ) : null}
              </View>
              {item.trailing ? (
                <Text variant="subhead" weight="semibold" tabular>
                  {item.trailing}
                </Text>
              ) : null}
            </PressableScale>
          ))}
          {card.items.length > 8 ? (
            <Text variant="footnote" tone="tertiary" style={{ padding: 14 }}>
              … et {card.items.length - 8} autre(s)
            </Text>
          ) : null}
        </Card>
      );
    case "metrics":
      return (
        <Card padding={14}>
          <Text variant="overline" tone="tertiary" uppercase style={{ marginBottom: 10 }}>
            {card.title}
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {card.metrics.map((m) => (
              <View key={m.label} style={{ minWidth: 130, flexGrow: 1, flexBasis: "45%", backgroundColor: colors.surfaceMuted, borderRadius: 12, padding: 12, gap: 4 }}>
                <Text variant="footnote" tone="secondary">
                  {m.label}
                </Text>
                <Text variant="title3" tabular tone={m.tone === "danger" ? "danger" : m.tone === "success" ? "success" : "primary"}>
                  {m.value}
                </Text>
              </View>
            ))}
          </View>
        </Card>
      );
  }
}

function IconTile({ icon, bg }: { icon: React.ReactNode; bg: string }) {
  return <View style={{ width: 38, height: 38, borderRadius: 11, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}>{icon}</View>;
}
