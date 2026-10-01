import React, { useCallback, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { Alert } from "../../utils/alert";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { StateView } from "../../components/StateView";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { PressableScale } from "../../components/PressableScale";
import { QuoteStatusBadge } from "../../components/QuoteStatusBadge";
import { useTheme } from "../../theme/ThemeProvider";
import { useAuth } from "../../auth/AuthContext";
import { extractErrorMessage } from "../../api/client";
import { shareFile } from "../../utils/shareFile";
import {
  createQuoteVersion,
  downloadQuotePdf,
  getQuote,
  listQuoteEvents,
  markQuoteExpired,
  submitQuoteForValidation,
  validateQuote,
  QUOTE_ITEM_FREQUENCY_LABELS,
  QUOTE_ITEM_UNIT_LABELS,
} from "../../api/quotes.api";
import type { Quote, QuoteEvent } from "../../api/quotes.api";
import type { MenuStackParamList } from "../../navigation/MenuStack";
import { frenchDateFormat } from "../../utils/frenchDate";

type Route = RouteProp<MenuStackParamList, "QuoteDetail">;
const dateFmt = frenchDateFormat({ day: "numeric", month: "long", year: "numeric" });
const dateTimeFmt = frenchDateFormat({ day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const currencyFmt = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const FULL_ACCESS_ROLES = ["HR", "DIRECTOR", "ADMIN"];

const EVENT_LABELS: Record<string, string> = {
  CREATED: "Devis créé",
  UPDATED: "Devis modifié",
  SUBMITTED_FOR_VALIDATION: "Soumis à validation",
  VALIDATED: "Validé",
  SENT: "Envoyé au client",
  FOLLOW_UP: "Relance",
  ACCEPTED: "Marqué accepté",
  REJECTED: "Marqué refusé",
  EXPIRED: "Marqué expiré",
  NEW_VERSION_CREATED: "Nouvelle version créée",
};

function InfoRow({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  const { colors, spacing, type } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", marginTop: spacing.sm }}>
      <Ionicons name={icon} size={16} color={colors.inkTertiary} style={{ marginTop: 2 }} />
      <View style={{ marginLeft: spacing.sm, flex: 1 }}>
        <Text style={[type.caption, { color: colors.inkTertiary }]}>{label}</Text>
        <Text style={[type.callout, { color: colors.ink, marginTop: 1 }]}>{value}</Text>
      </View>
    </View>
  );
}

export function QuoteDetailScreen() {
  const { colors, spacing, type } = useTheme();
  const { user } = useAuth();
  const route = useRoute<Route>();
  const navigation = useNavigation<NativeStackNavigationProp<MenuStackParamList>>();
  const { quoteId } = route.params;
  const canValidate = !!user && FULL_ACCESS_ROLES.includes(user.role);

  const [quote, setQuote] = useState<Quote | null>(null);
  const [events, setEvents] = useState<QuoteEvent[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [actionLoading, setActionLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      setState("loading");
      const [q, ev] = await Promise.all([getQuote(quoteId), listQuoteEvents(quoteId)]);
      setQuote(q);
      setEvents(ev);
      setState("ready");
    } catch {
      setState("error");
    }
  }, [quoteId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  async function runAction(action: () => Promise<unknown>, failureMessage: string) {
    setActionLoading(true);
    try {
      await action();
      await load();
    } catch (err) {
      Alert.alert("Action impossible", extractErrorMessage(err, failureMessage));
    } finally {
      setActionLoading(false);
    }
  }

  async function handleSharePdf() {
    if (!quote) return;
    setActionLoading(true);
    try {
      const bytes = await downloadQuotePdf(quote.id);
      await shareFile(`${quote.quoteNumber}.pdf`, bytes, { mimeType: "application/pdf", uti: "com.adobe.pdf" });
    } catch (err) {
      Alert.alert("Impossible d'ouvrir le PDF", extractErrorMessage(err));
    } finally {
      setActionLoading(false);
    }
  }

  function confirmExpire() {
    Alert.alert("Marquer ce devis comme expiré ?", undefined, [
      { text: "Annuler", style: "cancel" },
      { text: "Confirmer", style: "destructive", onPress: () => runAction(() => markQuoteExpired(quoteId), "Impossible de marquer ce devis comme expiré.") },
    ]);
  }

  function confirmNewVersion() {
    Alert.alert(
      "Créer une nouvelle version ?",
      "Une copie modifiable de ce devis sera créée, verrouillant l'original tel qu'il a été transmis.",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Créer",
          onPress: () =>
            runAction(async () => {
              const version = await createQuoteVersion(quoteId);
              navigation.replace("QuoteDetail", { quoteId: version.id });
            }, "Impossible de créer une nouvelle version."),
        },
      ]
    );
  }

  if (state === "loading") {
    return (
      <ScreenContainer>
        <StateView kind="loading" />
      </ScreenContainer>
    );
  }
  if (state === "error" || !quote) {
    return (
      <ScreenContainer>
        <StateView kind="error" onRetry={load} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer style={{ paddingTop: spacing.md }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: spacing.xxxl }}>
        <Card>
          <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
            <View style={{ flex: 1, marginRight: spacing.sm }}>
              <Text style={[type.footnote, { color: colors.inkTertiary }]}>{quote.quoteNumber}</Text>
              <Text style={[type.title2, { color: colors.ink, marginTop: 1 }]}>{quote.client.companyName}</Text>
              {quote.subject && <Text style={[type.callout, { color: colors.inkSecondary, marginTop: 2 }]}>{quote.subject}</Text>}
            </View>
            <QuoteStatusBadge status={quote.status} />
          </View>

          <InfoRow icon="calendar-outline" label="Émis le" value={dateFmt.format(new Date(quote.issueDate))} />
          {quote.validUntil && <InfoRow icon="hourglass-outline" label="Valable jusqu'au" value={dateFmt.format(new Date(quote.validUntil))} />}
          {quote.siteAddress && <InfoRow icon="location-outline" label="Chantier" value={quote.siteAddress} />}
          {quote.contactEmail && <InfoRow icon="mail-outline" label="Contact" value={quote.contactEmail} />}
          {quote.assignedUser && <InfoRow icon="person-outline" label="Commercial" value={`${quote.assignedUser.firstName} ${quote.assignedUser.lastName}`} />}
          {quote.nextVersion && <InfoRow icon="git-branch-outline" label="Nouvelle version" value={quote.nextVersion.quoteNumber} />}
          {quote.previousVersionId && <InfoRow icon="git-commit-outline" label="Version précédente" value="Voir l'historique" />}
        </Card>

        <Text style={[type.overline, { color: colors.inkTertiary, marginTop: spacing.lg, marginBottom: spacing.sm }]}>PRESTATIONS</Text>
        {quote.items.map((item) => (
          <Card key={item.id} style={{ marginBottom: spacing.sm }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={[type.callout, { color: colors.ink, flex: 1 }]} numberOfLines={2}>
                {item.description}
              </Text>
              <Text style={[type.callout, { color: colors.ink, fontWeight: "700" }]}>{currencyFmt.format(item.totalHt)}</Text>
            </View>
            <Text style={[type.footnote, { color: colors.inkTertiary, marginTop: 2 }]}>
              {item.quantity} {QUOTE_ITEM_UNIT_LABELS[item.unit]} · {currencyFmt.format(item.unitPriceHt)}
              {item.discount > 0 ? ` · -${item.discount}%` : ""}
            </Text>
            {item.frequency !== "ONE_TIME" && (
              <Text style={[type.footnote, { color: colors.accent, marginTop: 2 }]}>
                {QUOTE_ITEM_FREQUENCY_LABELS[item.frequency]}
                {item.occurrencesPerMonth ? ` · ${item.occurrencesPerMonth} / mois` : ""} — {currencyFmt.format(item.monthlyAmountHt)} HT / mois
              </Text>
            )}
          </Card>
        ))}

        <Card style={{ backgroundColor: colors.accentSoft, borderColor: "transparent", marginBottom: spacing.lg }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
            <Text style={[type.footnote, { color: colors.inkSecondary }]}>Sous-total HT</Text>
            <Text style={[type.footnote, { color: colors.ink }]}>{currencyFmt.format(quote.subtotalHt)}</Text>
          </View>
          {quote.discount > 0 && (
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
              <Text style={[type.footnote, { color: colors.inkSecondary }]}>Remise</Text>
              <Text style={[type.footnote, { color: colors.ink }]}>- {currencyFmt.format(quote.discount)}</Text>
            </View>
          )}
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
            <Text style={[type.footnote, { color: colors.inkSecondary }]}>TVA ({quote.vatRate}%)</Text>
            <Text style={[type.footnote, { color: colors.ink }]}>{currencyFmt.format(quote.vatAmount)}</Text>
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={[type.headline, { color: colors.ink }]}>Total TTC</Text>
            <Text style={[type.headline, { color: colors.accent }]}>{currencyFmt.format(quote.totalTtc)}</Text>
          </View>
          {quote.monthlyAmountHt > 0 && (
            <Text style={[type.footnote, { color: colors.accentDeep, marginTop: 6 }]}>
              Prévisionnel : {currencyFmt.format(quote.monthlyAmountHt)} HT / mois
            </Text>
          )}
        </Card>

        <View style={{ gap: spacing.sm }}>
          <Button label="Voir / partager le PDF" variant="secondary" onPress={handleSharePdf} loading={actionLoading} />

          {quote.status === "DRAFT" && (
            <>
              <Button label="Modifier le devis" variant="secondary" onPress={() => navigation.navigate("QuoteForm", { quoteId: quote.id })} />
              {canValidate ? (
                <Button label="Valider le devis" onPress={() => runAction(() => validateQuote(quoteId), "Impossible de valider ce devis.")} loading={actionLoading} />
              ) : (
                <Button label="Soumettre à validation" onPress={() => runAction(() => submitQuoteForValidation(quoteId), "Impossible de soumettre ce devis.")} loading={actionLoading} />
              )}
            </>
          )}

          {quote.status === "TO_VALIDATE" &&
            (canValidate ? (
              <Button label="Valider le devis" onPress={() => runAction(() => validateQuote(quoteId), "Impossible de valider ce devis.")} loading={actionLoading} />
            ) : (
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: spacing.sm }}>
                <Ionicons name="time-outline" size={16} color={colors.warning} />
                <Text style={[type.footnote, { color: colors.warning, marginLeft: 6, fontWeight: "600" }]}>En attente de validation RH/Direction</Text>
              </View>
            ))}

          {quote.status === "VALIDATED" && (
            <>
              <Button label="Envoyer par email" onPress={() => navigation.navigate("QuoteAction", { quoteId, action: "send" })} />
              <Button label="Créer une nouvelle version" variant="secondary" onPress={confirmNewVersion} loading={actionLoading} />
            </>
          )}

          {(quote.status === "SENT" || quote.status === "FOLLOW_UP") && (
            <>
              <Button label="Marquer comme accepté" onPress={() => navigation.navigate("QuoteAction", { quoteId, action: "accept" })} />
              <Button label="Enregistrer une relance" variant="secondary" onPress={() => navigation.navigate("QuoteAction", { quoteId, action: "followUp" })} />
              <Button label="Marquer comme refusé" variant="secondary" onPress={() => navigation.navigate("QuoteAction", { quoteId, action: "reject" })} />
              <PressableScale onPress={confirmExpire} style={{ alignItems: "center", paddingVertical: spacing.sm }}>
                <Text style={[type.footnote, { color: colors.inkTertiary, fontWeight: "600" }]}>Marquer comme expiré</Text>
              </PressableScale>
            </>
          )}

          {quote.status === "ACCEPTED" && (
            <>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: spacing.sm }}>
                <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                <Text style={[type.footnote, { color: colors.success, marginLeft: 6, fontWeight: "600" }]}>
                  Accepté{quote.acceptedAt ? ` le ${dateFmt.format(new Date(quote.acceptedAt))}` : ""}
                </Text>
              </View>
              {/* Action humaine explicite (module commercial §19) : l'acceptation
                  du devis ne crée jamais de chantier toute seule. */}
              {quote.site ? (
                <Button label={`Voir le chantier "${quote.site.name}"`} variant="secondary" onPress={() => navigation.navigate("SiteDetail", { siteId: quote.site!.id })} />
              ) : (
                <Button
                  label="Créer un chantier à partir du devis"
                  onPress={() =>
                    navigation.navigate("SiteForm", {
                      clientId: quote.clientId,
                      quoteId: quote.id,
                      prefillName: `${quote.client.companyName}${quote.subject ? ` — ${quote.subject}` : ""}`,
                      prefillAddress: quote.siteAddress ?? quote.billingAddress ?? undefined,
                    })
                  }
                />
              )}
              {/* Facturation réservée à RH/Direction/Admin (§1-3) — le
                  Superviseur ne voit pas ce bouton. */}
              {canValidate && (
                <Button
                  label="Créer une facture"
                  variant="secondary"
                  onPress={() => navigation.navigate("InvoiceForm", { clientId: quote.clientId, quoteId: quote.id, siteId: quote.site?.id })}
                />
              )}
            </>
          )}

          {(quote.status === "REJECTED" || quote.status === "EXPIRED") && (
            <Button label="Créer une nouvelle version" variant="secondary" onPress={confirmNewVersion} loading={actionLoading} />
          )}
        </View>

        {events.length > 0 && (
          <>
            <Text style={[type.overline, { color: colors.inkTertiary, marginTop: spacing.xl, marginBottom: spacing.sm }]}>HISTORIQUE</Text>
            <Card>
              {events.map((event, index) => (
                <View key={event.id} style={[{ paddingVertical: spacing.xs }, index > 0 && { borderTopWidth: 1, borderTopColor: colors.border, marginTop: spacing.xs }]}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={[type.callout, { color: colors.ink, fontWeight: "600" }]}>{EVENT_LABELS[event.action] ?? event.action}</Text>
                    <Text style={[type.caption, { color: colors.inkTertiary }]}>{dateTimeFmt.format(new Date(event.createdAt))}</Text>
                  </View>
                  <Text style={[type.footnote, { color: colors.inkSecondary, marginTop: 1 }]}>
                    {event.user.firstName} {event.user.lastName}
                  </Text>
                  {event.comment && <Text style={[type.footnote, { color: colors.inkTertiary, marginTop: 2 }]}>{event.comment}</Text>}
                </View>
              ))}
            </Card>
          </>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
