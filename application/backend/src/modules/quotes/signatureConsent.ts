import { createHash } from "crypto";

// Consentement à la signature électronique (retour explicite du client) : le
// signataire coche une case obligatoire avant de signer, pour que sa signature
// tracée à l'écran vaille signature manuscrite (Code civil, art. 1366 et 1367 ;
// règlement eIDAS n° 910/2014, signature électronique simple). Le texte
// exact accepté est conservé avec le devis, avec la date et une empreinte du
// contenu signé.
export function signatureConsentText(quoteNumber: string): string {
  return (
    `J'accepte de signer électroniquement le devis ${quoteNumber}. ` +
    "Je reconnais que ma signature tracée sur cet écran a la même valeur qu'une signature manuscrite sur papier, " +
    "qu'elle m'engage et vaut « Bon pour accord » sur le contenu et le montant de ce devis."
  );
}

interface FingerprintSource {
  quoteNumber: string;
  client: { companyName: string };
  subtotalHt: unknown;
  discount: unknown;
  vatRate: unknown;
  vatAmount: unknown;
  totalTtc: unknown;
  monthlyAmountHt: unknown;
  items: { description: string; quantity: unknown; unit: string; unitPriceHt: unknown; discount: unknown; totalHt: unknown; frequency: unknown }[];
}

// Empreinte SHA-256 de ce qui a été signé (contenu du devis, signataire,
// date, texte accepté, tracé). Imprimée sur le PDF et conservée en base : un
// contenu modifié après coup ne redonnerait pas la même empreinte.
export function signatureFingerprint(
  quote: FingerprintSource,
  signed: { signerName: string; signedAt: Date; consentText: string; strokes: number[][] }
): string {
  const payload = JSON.stringify({
    quoteNumber: quote.quoteNumber,
    client: quote.client.companyName,
    subtotalHt: String(quote.subtotalHt),
    discount: String(quote.discount),
    vatRate: String(quote.vatRate),
    vatAmount: String(quote.vatAmount),
    totalTtc: String(quote.totalTtc),
    monthlyAmountHt: String(quote.monthlyAmountHt),
    items: quote.items.map((i) => [i.description, String(i.quantity), i.unit, String(i.unitPriceHt), String(i.discount), String(i.totalHt), String(i.frequency)]),
    signerName: signed.signerName,
    signedAt: signed.signedAt.toISOString(),
    consentText: signed.consentText,
    strokes: signed.strokes,
  });
  return createHash("sha256").update(payload).digest("hex");
}
