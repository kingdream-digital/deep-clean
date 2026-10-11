import { Image, Platform, View } from "react-native";
import {
  brandTextOnWhite,
  computeTotals,
  formatEuro,
  formatQuantity,
  formatVatRate,
  lineTotalHtCents,
  PREVIEW_CLIENT_NAME,
  previewDocumentLines,
  readableTextOn,
  unitShort,
} from "@aussitot/shared";
import type { OrgLogo } from "@/lib/logo";
import { Text } from "@/ui";

// Le papier reste blanc, en mode clair comme en mode sombre : c'est le document que recevra le client.
const PAPER = "#FFFFFF";
const INK = "#0F172A";
const MUTED = "#64748B";
const LINE = "#E2E8F0";
const BAR = "#EDF0F5";

function Small({
  children,
  color = INK,
  bold,
  size = 9,
  align,
}: {
  children: string;
  color?: string;
  bold?: boolean;
  size?: number;
  align?: "right";
}) {
  return (
    <Text
      maxFontSizeMultiplier={1}
      numberOfLines={1}
      weight={bold ? "bold" : "regular"}
      align={align}
      style={{ color, fontSize: size, lineHeight: Math.round(size * 1.35), letterSpacing: 0 }}
    >
      {children}
    </Text>
  );
}

const Bar = ({ width }: { width: number | `${number}%` }) => (
  <View style={{ height: 5, width, borderRadius: 3, backgroundColor: BAR, marginTop: 4 }} />
);

/**
 * Aperçu en direct d'un devis ou d'une facture avec l'identité de
 * l'entreprise : mêmes règles que le PDF (couleur exacte pour les aplats,
 * textes ajustés pour rester lisibles), mêmes montants que le PDF d'exemple.
 */
export function DocumentMiniPreview({
  kind,
  organizationName,
  brandColor,
  logo,
  numberPrefix,
  vatExempt,
  vatRateBps,
}: {
  kind: "quote" | "invoice";
  organizationName: string;
  brandColor: string;
  logo: OrgLogo | null;
  numberPrefix: string;
  vatExempt: boolean;
  vatRateBps: number;
}) {
  const titleColor = brandTextOnWhite(brandColor, INK);
  const onAccent = readableTextOn(brandColor, INK);
  const lines = previewDocumentLines(vatExempt ? 0 : vatRateBps);
  const totals = computeTotals(lines, { vatExempt });
  const title = kind === "quote" ? "DEVIS" : "FACTURE";
  const year = new Date().getFullYear();

  return (
    <View
      accessible={Platform.OS !== "web"}
      accessibilityRole="image"
      accessibilityLabel={`Aperçu ${kind === "quote" ? "d'un devis" : "d'une facture"} avec le logo et la couleur de ${organizationName}`}
      style={{
        backgroundColor: PAPER,
        borderRadius: 10,
        padding: 18,
        borderWidth: 1,
        borderColor: LINE,
        shadowColor: "#0B1026",
        shadowOpacity: 0.1,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 6 },
        elevation: 3,
        gap: 14,
      }}
      testID="branding-preview"
    >
      {/* En-tête : logo (ou nom) à gauche, titre à la couleur de l'entreprise à droite. */}
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          {logo ? (
            <Image
              source={logo.source}
              style={{ height: 30, width: Math.min(120, Math.round(30 * logo.aspectRatio)) }}
              resizeMode="contain"
              accessibilityIgnoresInvertColors
            />
          ) : (
            <Small bold size={11}>
              {organizationName || "Votre entreprise"}
            </Small>
          )}
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text maxFontSizeMultiplier={1} weight="bold" style={{ color: titleColor, fontSize: 15, lineHeight: 19, letterSpacing: 1.2 }}>
            {title}
          </Text>
          <Small bold>{`N° ${numberPrefix || (kind === "quote" ? "D" : "F")}-${year}-0042`}</Small>
          <Small color={MUTED} size={8}>
            Exemple de mise en page
          </Small>
        </View>
      </View>

      <View style={{ flexDirection: "row", gap: 16 }}>
        <View style={{ flex: 1 }}>
          <Small color={MUTED} size={7}>
            ÉMETTEUR
          </Small>
          <Small bold>{organizationName || "Votre entreprise"}</Small>
          <Bar width="80%" />
          <Bar width="55%" />
        </View>
        <View style={{ flex: 1 }}>
          <Small color={MUTED} size={7}>
            CLIENT
          </Small>
          <Small bold>{PREVIEW_CLIENT_NAME}</Small>
          <Bar width="70%" />
          <Bar width="45%" />
        </View>
      </View>

      <View>
        <View style={{ flexDirection: "row", paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: LINE }}>
          <View style={{ flex: 1 }}>
            <Small color={MUTED} size={7} bold>
              DÉSIGNATION
            </Small>
          </View>
          <View style={{ width: 54 }}>
            <Small color={MUTED} size={7} bold align="right">
              QTÉ
            </Small>
          </View>
          <View style={{ width: 66 }}>
            <Small color={MUTED} size={7} bold align="right">
              TOTAL HT
            </Small>
          </View>
        </View>
        {lines.map((line) => (
          <View key={line.description} style={{ flexDirection: "row", paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: LINE }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Small>{line.description.replace(" — exemple", "")}</Small>
            </View>
            <View style={{ width: 54 }}>
              <Small color={MUTED} align="right">{`${formatQuantity(line.quantity)} ${unitShort(line.unit, line.quantity)}`}</Small>
            </View>
            <View style={{ width: 66 }}>
              <Small align="right">{formatEuro(lineTotalHtCents(line))}</Small>
            </View>
          </View>
        ))}
      </View>

      <View style={{ alignSelf: "flex-end", width: "62%", gap: 3 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Small color={MUTED}>Total HT</Small>
          <Small>{formatEuro(totals.subtotalCents)}</Small>
        </View>
        {vatExempt ? null : (
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Small color={MUTED}>{`TVA ${formatVatRate(vatRateBps)}`}</Small>
            <Small>{formatEuro(totals.vatCents)}</Small>
          </View>
        )}
        <View
          style={{
            marginTop: 4,
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            backgroundColor: brandColor,
            borderRadius: 5,
            paddingHorizontal: 8,
            paddingVertical: 6,
          }}
        >
          <Small bold color={onAccent} size={10}>
            {vatExempt ? "Total" : "Total TTC"}
          </Small>
          <Small bold color={onAccent} size={10}>
            {formatEuro(totals.totalCents)}
          </Small>
        </View>
      </View>
    </View>
  );
}
