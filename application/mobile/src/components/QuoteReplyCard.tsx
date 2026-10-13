import React, { useState } from "react";
import { Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "./Card";
import { Button } from "./Button";
import { PressableScale } from "./PressableScale";
import { useTheme } from "../theme/ThemeProvider";
import type { QuoteReply } from "../api/quotes.api";
import { frenchDateFormat } from "../utils/frenchDate";

const dateTimeFmt = frenchDateFormat({ day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
// Au-delà, la réponse est repliée (bouton « Lire tout »).
const COLLAPSED_LINES = 6;

interface QuoteReplyCardProps {
  reply: QuoteReply;
  // Faux si le devis n'attend plus de réponse (déjà accepté, refusé…) : seul
  // « Ignorer » reste proposé.
  canDecide: boolean;
  busy: boolean;
  onDecide: (decision: "ACCEPT" | "REJECT" | "DISMISS") => void;
}

/**
 * Réponse du client reçue par email, avec la lecture par mots-clés et la
 * confirmation en un clic. La lecture n'est qu'une suggestion : rien ne
 * change sur le devis tant que personne n'a confirmé.
 */
export function QuoteReplyCard({ reply, canDecide, busy, onDecide }: QuoteReplyCardProps) {
  const { colors, spacing, type, radius } = useTheme();
  const [expanded, setExpanded] = useState(false);

  const tone = {
    POSITIVE: { label: "Semble accepter", icon: "thumbs-up" as const, color: colors.success, soft: colors.successSoft },
    NEGATIVE: { label: "Semble refuser", icon: "thumbs-down" as const, color: colors.danger, soft: colors.dangerSoft },
    UNCLEAR: { label: "À lire", icon: "mail-unread" as const, color: colors.warning, soft: colors.warningSoft },
  }[reply.intent];
  const keywords = [...reply.positiveKeywords, ...reply.negativeKeywords, ...reply.doubtKeywords];
  const long = reply.replyText.split("\n").length > COLLAPSED_LINES || reply.replyText.length > 400;

  return (
    <Card style={{ marginBottom: spacing.sm }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: tone.soft, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 }}>
          <Ionicons name={tone.icon} size={13} color={tone.color} />
          <Text style={[type.footnote, { color: tone.color, fontWeight: "700", marginLeft: 5 }]}>{tone.label}</Text>
        </View>
        <Text style={[type.footnote, { color: colors.inkTertiary }]}>{dateTimeFmt.format(new Date(reply.receivedAt))}</Text>
      </View>

      <Text style={[type.subhead, { color: colors.ink, fontWeight: "600", marginTop: spacing.sm }]}>{reply.fromName ?? reply.fromEmail}</Text>
      {!!reply.fromName && <Text style={[type.footnote, { color: colors.inkTertiary }]}>{reply.fromEmail}</Text>}

      {!reply.senderMatchesContact && (
        <View style={{ flexDirection: "row", alignItems: "flex-start", marginTop: spacing.xs }}>
          <Ionicons name="warning-outline" size={14} color={colors.warning} style={{ marginTop: 1 }} />
          <Text style={[type.footnote, { color: colors.warning, marginLeft: 6, flex: 1 }]}>
            Cette adresse n'est pas celle du contact du devis : vérifiez qui répond avant de confirmer.
          </Text>
        </View>
      )}

      <Text style={[type.callout, { color: colors.inkSecondary, marginTop: spacing.sm }]} numberOfLines={expanded ? undefined : COLLAPSED_LINES}>
        {reply.replyText}
      </Text>
      {long && (
        <PressableScale onPress={() => setExpanded((v) => !v)} style={{ paddingVertical: 4 }}>
          <Text style={[type.footnote, { color: colors.accentText, fontWeight: "600" }]}>{expanded ? "Réduire" : "Lire tout"}</Text>
        </PressableScale>
      )}
      {keywords.length > 0 && (
        <Text style={[type.caption, { color: colors.inkTertiary, marginTop: spacing.xs }]}>Mots repérés : {keywords.join(", ")}</Text>
      )}

      <View style={{ gap: spacing.xs, marginTop: spacing.md }}>
        {canDecide && (
          <>
            <Button
              label="Confirmer : devis accepté"
              icon="checkmark-circle-outline"
              variant={reply.intent === "POSITIVE" ? "primary" : "secondary"}
              onPress={() => onDecide("ACCEPT")}
              loading={busy}
            />
            <Button
              label="Confirmer : devis refusé"
              icon="close-circle-outline"
              variant={reply.intent === "NEGATIVE" ? "primary" : "secondary"}
              onPress={() => onDecide("REJECT")}
              loading={busy}
            />
          </>
        )}
        <PressableScale onPress={() => onDecide("DISMISS")} disabled={busy} style={{ alignItems: "center", paddingVertical: spacing.xs }}>
          <Text style={[type.footnote, { color: colors.inkTertiary, fontWeight: "600" }]}>Ignorer cette réponse</Text>
        </PressableScale>
      </View>
    </Card>
  );
}
