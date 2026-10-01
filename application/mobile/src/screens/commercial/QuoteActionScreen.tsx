import React, { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { Picker } from "@react-native-picker/picker";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { TextField } from "../../components/TextField";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Checkbox } from "../../components/Checkbox";
import { DateTimeField } from "../../components/DateTimeField";
import { useTheme } from "../../theme/ThemeProvider";
import { extractErrorMessage } from "../../api/client";
import { markQuoteAccepted, markQuoteRejected, recordQuoteFollowUp, sendQuote, QUOTE_FOLLOW_UP_METHOD_LABELS } from "../../api/quotes.api";
import type { QuoteFollowUpMethod } from "../../api/quotes.api";
import type { MenuStackParamList } from "../../navigation/MenuStack";
import { frenchDateFormat } from "../../utils/frenchDate";

type Route = RouteProp<MenuStackParamList, "QuoteAction">;
const dateFmt = frenchDateFormat({ day: "numeric", month: "long", year: "numeric" });

function tomorrow(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d;
}

const SCREEN_CONFIG: Record<
  Route["params"]["action"],
  { title: string; cta: string; needsMethod: boolean; commentLabel: string; commentPlaceholder: string }
> = {
  send: { title: "Envoyer le devis", cta: "Envoyer par email", needsMethod: false, commentLabel: "Message personnalisé (optionnel)", commentPlaceholder: "Un mot pour accompagner le devis" },
  followUp: { title: "Enregistrer une relance", cta: "Enregistrer la relance", needsMethod: true, commentLabel: "Commentaire", commentPlaceholder: "Ex. : rappel prévu la semaine prochaine" },
  accept: { title: "Marquer comme accepté", cta: "Confirmer l'acceptation", needsMethod: true, commentLabel: "Commentaire", commentPlaceholder: "Ex. : client confirmé par téléphone le 09/10" },
  reject: { title: "Marquer comme refusé", cta: "Confirmer le refus", needsMethod: false, commentLabel: "Motif du refus (optionnel)", commentPlaceholder: "Ex. : budget non validé côté client" },
};

export function QuoteActionScreen() {
  const { colors, spacing, type } = useTheme();
  const route = useRoute<Route>();
  const navigation = useNavigation<NativeStackNavigationProp<MenuStackParamList>>();
  const { quoteId, action } = route.params;
  const config = SCREEN_CONFIG[action];

  const [method, setMethod] = useState<QuoteFollowUpMethod>("PHONE");
  const [comment, setComment] = useState("");
  const [hasNextFollowUp, setHasNextFollowUp] = useState(false);
  const [nextFollowUpAt, setNextFollowUpAt] = useState<Date>(tomorrow());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    setSaving(true);
    try {
      if (action === "send") {
        await sendQuote(quoteId, comment.trim() || undefined);
      } else if (action === "followUp") {
        await recordQuoteFollowUp(quoteId, { method, comment: comment.trim() || undefined, nextFollowUpAt: hasNextFollowUp ? nextFollowUpAt.toISOString() : undefined });
      } else if (action === "accept") {
        await markQuoteAccepted(quoteId, { method, comment: comment.trim() || undefined });
      } else {
        await markQuoteRejected(quoteId, { comment: comment.trim() || undefined });
      }
      navigation.goBack();
    } catch (err) {
      setError(extractErrorMessage(err, "Action impossible."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScreenContainer avoidKeyboard style={{ paddingTop: spacing.lg }}>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: spacing.xxxl }}>
        {config.needsMethod && (
          <View style={{ marginBottom: spacing.md }}>
            <Text style={[type.subhead, { color: colors.inkSecondary, marginBottom: spacing.xxs }]}>Moyen de contact</Text>
            <Card padded={false}>
              <Picker selectedValue={method} onValueChange={(v) => setMethod(v as QuoteFollowUpMethod)} style={{ color: colors.ink }} itemStyle={{ color: colors.ink }}>
                {Object.entries(QUOTE_FOLLOW_UP_METHOD_LABELS).map(([value, label]) => (
                  <Picker.Item key={value} label={label} value={value} />
                ))}
              </Picker>
            </Card>
          </View>
        )}

        <TextField label={config.commentLabel} placeholder={config.commentPlaceholder} value={comment} onChangeText={setComment} multiline numberOfLines={3} />

        {action === "followUp" && (
          <View style={{ marginBottom: spacing.md }}>
            <Checkbox label="Programmer la prochaine relance" checked={hasNextFollowUp} onChange={setHasNextFollowUp} />
            {hasNextFollowUp && (
              <View style={{ marginTop: spacing.sm }}>
                <DateTimeField label="Prochaine relance" mode="date" value={nextFollowUpAt} onChange={setNextFollowUpAt} minimumDate={new Date()} formatValue={(d) => dateFmt.format(d)} />
              </View>
            )}
          </View>
        )}

        {error && <Text style={[type.footnote, { color: colors.danger, marginBottom: spacing.md }]}>{error}</Text>}

        <Button label={config.cta} onPress={handleSubmit} loading={saving} />
      </ScrollView>
    </ScreenContainer>
  );
}
