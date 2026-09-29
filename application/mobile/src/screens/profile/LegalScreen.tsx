import React from "react";
import { ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { useTheme } from "../../theme/ThemeProvider";

function Section({
  icon,
  title,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  children: React.ReactNode;
}) {
  const { colors, spacing, type } = useTheme();
  return (
    <View style={{ marginTop: spacing.lg }}>
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: spacing.sm }}>
        <Ionicons name={icon} size={16} color={colors.accent} />
        <Text style={[type.headline, { color: colors.ink, marginLeft: spacing.xs }]}>{title}</Text>
      </View>
      <Card>
        <Text style={[type.callout, { color: colors.inkSecondary, lineHeight: 21 }]}>{children}</Text>
      </Card>
    </View>
  );
}

// Mentions légales et confidentialité — retour explicite du client : en tant
// qu'éditeur (KingDream Digital) et exploitant (Deep Clean) de l'application,
// cette page doit être accessible depuis l'app comme depuis le web. Contenu
// factuel, aligné sur ce que l'application fait réellement (voir
// utils/password.ts, modules/problems/problems.service.ts) plutôt que des
// clauses génériques copiées — à faire relire par un juriste avant une mise
// en production commerciale plus large.
export function LegalScreen() {
  const { colors, spacing, type } = useTheme();

  return (
    <ScreenContainer>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: spacing.lg, paddingBottom: spacing.xxl }}>
        <Text style={[type.title2, { color: colors.ink }]}>Mentions légales & confidentialité</Text>
        <Text style={[type.footnote, { color: colors.inkTertiary, marginTop: spacing.xs }]}>
          Application interne Deep Clean — édition, sécurité et données personnelles.
        </Text>

        <Section icon="business-outline" title="Éditeur de l'application">
          L'application Deep Clean (mobile et web) est conçue et développée par KingDream Digital, qui assure sa
          maintenance technique et ses mises à jour.{"\n\n"}Contact : kingdreamdigital@gmail.com
        </Section>

        <Section icon="briefcase-outline" title="Exploitant">
          L'application est exploitée par Deep Clean pour la gestion interne de son activité : équipes, chantiers,
          plannings, pointages et communication entre collaborateurs. Elle est strictement réservée à un usage
          interne — aucun compte ne peut être créé sans passer par la RH.
        </Section>

        <Section icon="shield-checkmark-outline" title="Sécurité des comptes et des données">
          Les mots de passe ne sont jamais stockés en clair : ils sont chiffrés (hachage) dès leur création, y
          compris pour la RH qui ne peut jamais les consulter. Les échanges entre l'application et le serveur sont
          chiffrés (HTTPS). L'accès à chaque information (planning, heures, chantiers, comptes...) est contrôlé
          selon le rôle de la personne connectée, vérifié systématiquement côté serveur.
        </Section>

        <Section icon="lock-closed-outline" title="Données personnelles collectées">
          Dans le cadre de la gestion de l'activité, l'application traite : l'identité et les coordonnées des
          collaborateurs ; les plannings et heures travaillées ; à chaque pointage, une photo et la position GPS,
          utilisées comme justificatif pour vérifier que le pointage est bien effectué sur le lieu de la mission ;
          les photos jointes à un signalement de problème sur un chantier.{"\n\n"}Ces informations sont utilisées
          uniquement pour la gestion des équipes, des plannings et de la paie, et sont accessibles seulement aux
          personnes habilitées (RH, superviseurs, direction) selon leur rôle.
        </Section>

        <Section icon="time-outline" title="Durée de conservation">
          Les photos jointes à un signalement de problème sont supprimées automatiquement 14 jours après leur envoi.
          Les photos et positions prises lors d'un pointage sont conservées avec l'historique des heures, comme
          justificatif en cas de désaccord sur les heures travaillées, tant que le compte reste actif.
        </Section>

        <Section icon="person-outline" title="Vos droits">
          Pour toute question sur les informations vous concernant, ou pour demander leur accès, leur correction ou
          leur suppression, contactez votre service RH — c'est votre interlocuteur unique pour tout ce qui concerne
          votre compte et vos données.
        </Section>

        <Section icon="document-text-outline" title="Propriété intellectuelle">
          L'application Deep Clean (code, design, identité visuelle) est la propriété de KingDream Digital. Toute
          reproduction ou réutilisation en dehors du cadre de cette exploitation est interdite sans autorisation.
        </Section>
      </ScrollView>
    </ScreenContainer>
  );
}
