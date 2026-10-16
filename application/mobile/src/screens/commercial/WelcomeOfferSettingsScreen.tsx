import React, { useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { TextField } from "../../components/TextField";
import { Button } from "../../components/Button";
import { Switch } from "../../components/Switch";
import { DateTimeField } from "../../components/DateTimeField";
import { StateView } from "../../components/StateView";
import { WelcomeOfferCard } from "../../components/WelcomeOfferCard";
import { useTheme } from "../../theme/ThemeProvider";
import { Alert } from "../../utils/alert";
import { frenchDateFormat } from "../../utils/frenchDate";
import { extractErrorMessage } from "../../api/client";
import { getWelcomeOfferSettings, saveWelcomeOffer } from "../../api/welcomeOffer.api";

const longDate = frenchDateFormat({ day: "numeric", month: "long", year: "numeric" });
const DAY = 24 * 60 * 60 * 1000;

/** Conditions types, à relire par la Direction avant d'activer l'offre. */
function standardConditions(rate: number, startsAt: Date, endsAt: Date): string {
  return (
    `Offre de bienvenue DEEP CLEAN valable du ${longDate.format(startsAt)} au ${longDate.format(endsAt)} inclus. ` +
    "Réservée aux particuliers et aux entreprises qui n'ont jamais fait appel à DEEP CLEAN, pour une première prestation dont la demande de devis est envoyée depuis l'application pendant cette période. " +
    `Remise de ${rate} % calculée sur le prix habituel de la prestation, appliquée directement sur le devis. ` +
    "Une seule utilisation par client (même adresse d'intervention ou même entreprise). Non cumulable avec une autre offre, remise ou tarif négocié. Non remboursable et non convertible en espèces. " +
    "Offre proposée par DEEP CLEAN, SAS au capital de 600 €, RCS Manosque 942 773 375, 21 boulevard de la Plaine, 04100 Manosque."
  );
}

// Offre de bienvenue de l'espace public (Direction / admin technique) : une
// seule offre, affichée au public uniquement si elle est activée ET dans ses
// dates — elle disparaît seule à la date de fin. Elle ne débloque rien dans
// l'app : le commercial applique la remise sur le devis (la demande porte la
// mention de l'offre, voir la fiche prospect).
export function WelcomeOfferSettingsScreen() {
  const { colors, spacing, type } = useTheme();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [rate, setRate] = useState("10");
  const [title, setTitle] = useState("Offre de bienvenue");
  const [summary, setSummary] = useState("Demandez votre devis depuis l'application : la remise est déduite directement de votre devis.");
  const [startsAt, setStartsAt] = useState(() => new Date());
  const [endsAt, setEndsAt] = useState(() => new Date(Date.now() + 90 * DAY));
  const [conditions, setConditions] = useState("");

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const offer = await getWelcomeOfferSettings();
      if (offer) {
        setIsActive(offer.isActive);
        setRate(String(offer.rate));
        setTitle(offer.title);
        setSummary(offer.summary);
        setStartsAt(new Date(offer.startsAt));
        setEndsAt(new Date(offer.endsAt));
        setConditions(offer.conditions);
      } else {
        setConditions(standardConditions(10, startsAt, endsAt));
      }
    } catch (err) {
      setLoadError(extractErrorMessage(err, "Impossible de charger l'offre."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rateValue = Number.parseInt(rate, 10);

  async function save() {
    if (!Number.isInteger(rateValue) || rateValue < 1 || rateValue > 50) {
      Alert.alert("Offre de bienvenue", "La remise doit être comprise entre 1 et 50 %.");
      return;
    }
    if (endsAt <= startsAt) {
      Alert.alert("Offre de bienvenue", "La date de fin doit suivre la date de début.");
      return;
    }
    setSaving(true);
    try {
      // Journée de fin incluse jusqu'à minuit.
      const end = new Date(endsAt);
      end.setHours(23, 59, 59, 0);
      const start = new Date(startsAt);
      start.setHours(0, 0, 0, 0);
      await saveWelcomeOffer({ isActive, rate: rateValue, title: title.trim(), summary: summary.trim(), conditions: conditions.trim(), startsAt: start.toISOString(), endsAt: end.toISOString() });
      Alert.alert("Offre de bienvenue", isActive ? "Offre enregistrée : elle s'affiche dans l'espace public pendant ses dates." : "Offre enregistrée, non affichée au public.");
    } catch (err) {
      Alert.alert("Offre de bienvenue", extractErrorMessage(err, "Enregistrement impossible."));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <StateView kind="loading" />;
  if (loadError) return <StateView kind="error" message={loadError} onRetry={() => void load()} />;

  return (
    <ScreenContainer>
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: spacing.lg, paddingBottom: spacing.xxl }}>
        <Text style={[type.subhead, { color: colors.inkSecondary, marginBottom: spacing.md }]}>
          Remise proposée aux nouveaux clients qui demandent leur devis depuis l'application. Elle s'affiche dans l'espace public pendant ses
          dates, avec ses conditions complètes, et chaque demande reçue porte la mention de l'offre pour l'appliquer sur le devis.
        </Text>

        <Card style={{ flexDirection: "row", alignItems: "center", marginBottom: spacing.md }}>
          <View style={{ flex: 1, marginRight: spacing.sm }}>
            <Text style={[type.headline, { color: colors.ink }]}>Afficher l'offre au public</Text>
            <Text style={[type.footnote, { color: colors.inkSecondary }]}>{isActive ? "Visible pendant ses dates" : "Masquée"}</Text>
          </View>
          <Switch value={isActive} onValueChange={setIsActive} accessibilityLabel="Afficher l'offre au public" />
        </Card>

        <TextField label="Remise (%)" value={rate} onChangeText={setRate} keyboardType="number-pad" maxLength={2} />
        <TextField label="Titre" value={title} onChangeText={setTitle} maxLength={80} />
        <TextField label="Phrase d'accroche" value={summary} onChangeText={setSummary} maxLength={240} multiline />
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <DateTimeField label="Début" mode="date" value={startsAt} onChange={setStartsAt} formatValue={(d) => longDate.format(d)} />
          </View>
          <View style={{ flex: 1 }}>
            <DateTimeField label="Fin" mode="date" value={endsAt} onChange={setEndsAt} minimumDate={startsAt} formatValue={(d) => longDate.format(d)} />
          </View>
        </View>
        <TextField label="Conditions complètes" value={conditions} onChangeText={setConditions} multiline numberOfLines={8} maxLength={4000} />
        <Button
          label="Rédiger les conditions types"
          icon="document-text-outline"
          variant="secondary"
          onPress={() => setConditions(standardConditions(Number.isInteger(rateValue) ? rateValue : 10, startsAt, endsAt))}
        />
        <Text style={[type.caption, { color: colors.inkTertiary, marginTop: spacing.xs }]}>
          À relire avant d'activer : l'offre doit être réellement appliquée sur les devis, au tarif habituel.
        </Text>

        <Text style={[type.overline, { color: colors.inkTertiary, marginTop: spacing.xl, marginBottom: spacing.sm }]}>APERÇU DANS L'APPLICATION</Text>
        <WelcomeOfferCard
          offer={{ id: "apercu", rate: Number.isInteger(rateValue) ? rateValue : 0, title, summary, conditions, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() }}
        />

        <View style={{ marginTop: spacing.xl }}>
          <Button label="Enregistrer" icon="checkmark" size="lg" onPress={() => void save()} loading={saving} />
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
