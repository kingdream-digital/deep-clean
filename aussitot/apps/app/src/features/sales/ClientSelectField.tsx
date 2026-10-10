import { useState } from "react";
import { View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Check, Building2, UserRound } from "lucide-react-native";
import { endpoints } from "@/api/endpoints";
import { useDebounced } from "@/lib/useDebounced";
import { useTheme } from "@/theme/ThemeProvider";
import { LoadingState, PressableScale, SearchField, Sheet, Text } from "@/ui";

/** Choix d'un client avec recherche côté serveur (adapté à des milliers de clients). */
export function ClientSelectField({
  value,
  label,
  onChange,
  error,
  testID,
}: {
  value: { id: string; name: string } | null;
  label?: string;
  onChange: (client: { id: string; name: string; email: string | null }) => void;
  error?: string | null;
  testID?: string;
}) {
  const { colors, radius } = useTheme();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const q = useDebounced(search.trim());
  const list = useQuery({
    queryKey: ["clients", { q, picker: true }],
    queryFn: () => endpoints.clients.list(q || undefined),
    enabled: open,
  });
  return (
    <>
      <View style={{ gap: 6 }}>
        <Text variant="subhead" weight="medium" tone="secondary">
          {label ?? "Client"}
        </Text>
        <PressableScale
          testID={testID}
          onPress={() => setOpen(true)}
          scaleTo={0.99}
          accessibilityLabel={`${label ?? "Client"} : ${value?.name ?? "à choisir"}`}
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
          <Text variant="body" tone={value ? "primary" : "tertiary"} style={{ flex: 1 }} numberOfLines={1}>
            {value?.name ?? "Choisir un client"}
          </Text>
          <ChevronDown size={18} color={colors.textTertiary} />
        </PressableScale>
        {error ? (
          <Text variant="footnote" tone="danger">
            {error}
          </Text>
        ) : null}
      </View>
      <Sheet visible={open} onClose={() => setOpen(false)} title="Choisir un client">
        <SearchField value={search} onChangeText={setSearch} placeholder="Nom, ville, email…" testID="client-picker-search" />
        {list.isPending ? (
          <LoadingState />
        ) : (
          <View style={{ borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: "hidden" }}>
            {(list.data?.items ?? []).map((client, index) => {
              const selected = client.id === value?.id;
              const Icon = client.kind === "COMPANY" ? Building2 : UserRound;
              return (
                <PressableScale
                  key={client.id}
                  onPress={() => {
                    onChange({ id: client.id, name: client.name, email: client.email });
                    setOpen(false);
                  }}
                  scaleTo={1}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={client.name}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    minHeight: 54,
                    paddingHorizontal: 14,
                    borderTopWidth: index === 0 ? 0 : 1,
                    borderTopColor: colors.border,
                    backgroundColor: selected ? colors.accentSoft : colors.surface,
                  }}
                  pressedStyle={{ backgroundColor: colors.surfacePressed }}
                >
                  <Icon size={18} color={colors.textTertiary} />
                  <View style={{ flex: 1 }}>
                    <Text variant="callout" weight="medium">
                      {client.name}
                    </Text>
                    {client.city || client.email ? (
                      <Text variant="footnote" tone="secondary" numberOfLines={1}>
                        {[client.city, client.email].filter(Boolean).join(" · ")}
                      </Text>
                    ) : null}
                  </View>
                  {selected ? <Check size={18} color={colors.accentText} /> : null}
                </PressableScale>
              );
            })}
            {list.data && list.data.items.length === 0 ? (
              <Text variant="subhead" tone="tertiary" style={{ padding: 16 }}>
                Aucun client trouvé. Créez-le depuis Ventes → Clients.
              </Text>
            ) : null}
          </View>
        )}
      </Sheet>
    </>
  );
}
