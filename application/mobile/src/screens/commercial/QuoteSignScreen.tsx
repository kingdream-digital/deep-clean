import React, { useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { Alert } from "../../utils/alert";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { StateView } from "../../components/StateView";
import { TextField } from "../../components/TextField";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Checkbox } from "../../components/Checkbox";
import { PressableScale } from "../../components/PressableScale";
import { SignaturePad, SignatureValue } from "../../components/SignaturePad";
import { useTheme } from "../../theme/ThemeProvider";
import { extractErrorMessage } from "../../api/client";
import { getQuote, signQuote } from "../../api/quotes.api";
import type { Quote } from "../../api/quotes.api";
import type { MenuStackParamList } from "../../navigation/MenuStack";

type Route = RouteProp<MenuStackParamList, "QuoteSign">;
const currencyFmt = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });

/**
 * Signature du devis sur place : le client lit le montant, écrit son nom et
 * signe au doigt sur l'écran. La validation fait passer le devis en
 * « Accepté » et appose la signature sur le PDF.
 */
export function QuoteSignScreen() {
  const { colors, spacing, type } = useTheme();
  const route = useRoute<Route>();
  const navigation = useNavigation<NativeStackNavigationProp<MenuStackParamList>>();
  const { quoteId } = route.params;

  const [quote, setQuote] = useState<Quote | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [signerName, setSignerName] = useState("");
  const [signature, setSignature] = useState<SignatureValue | null>(null);
  const [sendCopy, setSendCopy] = useState(true);
  const [drawing, setDrawing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getQuote(quoteId)
      .then((q) => {
        setQuote(q);
        setSignerName(q.contactName ?? "");
      })
      .catch((err) => setLoadError(extractErrorMessage(err, "Impossible de charger le devis.")));
  }, [quoteId]);

  if (!quote) {
    return (
      <ScreenContainer>
        <StateView kind={loadError ? "error" : "loading"} message={loadError ?? undefined} />
      </ScreenContainer>
    );
  }

  const recipient = quote.contactEmail ?? quote.client.email ?? null;
  const recurring = quote.monthlyAmountHt > 0;
  const monthlyTtc = Math.round(quote.monthlyAmountHt * (1 + quote.vatRate / 100) * 100) / 100;
  const amountLabel = recurring ? `${currencyFmt.format(monthlyTtc)} TTC par mois` : `${currencyFmt.format(quote.totalTtc)} TTC`;
  const canSubmit = !!signature && signature.strokes.length > 0 && signerName.trim().length > 0;

  async function handleSubmit() {
    if (!signature || !quote) return;
    setError(null);
    setSaving(true);
    try {
      const result = await signQuote(quoteId, { signerName: signerName.trim(), signature, sendCopy: sendCopy && !!recipient });
      if (result.copyError) {
        Alert.alert("Devis signé", result.copyError);
      } else if (result.copySentTo) {
        Alert.alert("Devis signé", `Une copie du devis signé a été envoyée à ${result.copySentTo}.`);
      }
      navigation.goBack();
    } catch (err) {
      setError(extractErrorMessage(err, "La signature n'a pas pu être enregistrée."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScreenContainer avoidKeyboard style={{ paddingTop: spacing.lg }}>
      <ScrollView
        scrollEnabled={!drawing}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: spacing.xxxl }}
      >
        <Card style={{ marginBottom: spacing.md }}>
          <Text style={[type.footnote, { color: colors.inkTertiary }]}>Devis {quote.quoteNumber}</Text>
          <Text style={[type.headline, { color: colors.ink, marginTop: 2 }]}>{quote.client.companyName}</Text>
          {!!quote.subject && <Text style={[type.subhead, { color: colors.inkSecondary, marginTop: 2 }]}>{quote.subject}</Text>}
          <Text style={[type.title3, { color: colors.accentText, marginTop: spacing.sm }]}>{amountLabel}</Text>
        </Card>

        <TextField label="Nom et prénom du signataire" placeholder="Ex. : Marie Dupont" value={signerName} onChangeText={setSignerName} autoCapitalize="words" />

        <Text style={[type.footnote, { color: colors.inkSecondary, marginBottom: spacing.sm }]}>
          En signant, le client donne son « Bon pour accord » sur le devis {quote.quoteNumber} pour un montant de {amountLabel}.
        </Text>

        <SignaturePad value={signature} onChange={setSignature} onDrawingChange={setDrawing} />

        <PressableScale
          onPress={() => setSignature(null)}
          disabled={!signature}
          style={{ alignSelf: "flex-end", paddingVertical: spacing.sm, opacity: signature ? 1 : 0.4 }}
        >
          <Text style={[type.footnote, { color: colors.accentText, fontWeight: "600" }]}>Effacer la signature</Text>
        </PressableScale>

        {recipient ? (
          <View style={{ marginBottom: spacing.md }}>
            <Checkbox label={`Envoyer une copie signée par email à ${recipient}`} checked={sendCopy} onChange={setSendCopy} />
          </View>
        ) : (
          <Text style={[type.footnote, { color: colors.inkTertiary, marginBottom: spacing.md }]}>
            Aucune adresse email pour ce client : la copie signée pourra être partagée depuis « Voir / partager le PDF ».
          </Text>
        )}

        {!!error && <Text style={[type.footnote, { color: colors.danger, marginBottom: spacing.md }]}>{error}</Text>}

        <Button label="Valider la signature" icon="create-outline" onPress={handleSubmit} loading={saving} disabled={!canSubmit} />
      </ScrollView>
    </ScreenContainer>
  );
}
