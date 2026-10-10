import { formatDayLong, formatEuro } from "@aussitot/shared";

/**
 * Emails envoyés AU NOM de l'entreprise cliente (son nom en expéditeur, son
 * adresse en réponse). Texte simple et chaleureux, version HTML sobre.
 */
const day = (d: string) => formatDayLong(d, { weekday: false });
const euro = (cents: number) => formatEuro(cents, { plain: true });

interface Common {
  orgName: string;
  senderName: string;
  contactName: string | null;
  signature: string | null;
  message: string | null;
}

function greeting(contactName: string | null): string {
  return contactName ? `Bonjour ${contactName},` : "Bonjour,";
}

function closing(c: Common): string {
  return ["Bien cordialement,", c.senderName, c.orgName, c.signature ?? ""].filter(Boolean).join("\n");
}

export function quoteEmail(c: Common & { number: string; totalCents: number; validUntil: string | null; vatExempt: boolean }) {
  const subject = `Devis ${c.number} — ${c.orgName}`;
  const text = [
    greeting(c.contactName),
    "",
    `Veuillez trouver ci-joint notre devis ${c.number} d'un montant de ${euro(c.totalCents)}${c.vatExempt ? "" : " TTC"}${c.validUntil ? `, valable jusqu'au ${day(c.validUntil)}` : ""}.`,
    c.message ? `\n${c.message}\n` : "",
    "Pour l'accepter, il vous suffit de nous le retourner signé avec la mention « Bon pour accord », ou de répondre simplement à cet email.",
    "",
    closing(c),
  ].join("\n");
  return { subject, text };
}

export function invoiceEmail(
  c: Common & { number: string; totalCents: number; dueDate: string | null; iban: string | null; isCreditNote: boolean },
) {
  if (c.isCreditNote) {
    return {
      subject: `Avoir ${c.number} — ${c.orgName}`,
      text: [
        greeting(c.contactName),
        "",
        `Veuillez trouver ci-joint notre avoir ${c.number} d'un montant de ${euro(Math.abs(c.totalCents))}.`,
        c.message ? `\n${c.message}\n` : "",
        closing(c),
      ].join("\n"),
    };
  }
  const subject = `Facture ${c.number} — ${c.orgName}`;
  const text = [
    greeting(c.contactName),
    "",
    `Veuillez trouver ci-joint notre facture ${c.number} d'un montant de ${euro(c.totalCents)}${c.dueDate ? `, à régler au plus tard le ${day(c.dueDate)}` : ""}.`,
    c.iban ? `Règlement par virement : IBAN ${c.iban.replace(/(.{4})/g, "$1 ").trim()} (référence ${c.number}).` : "",
    c.message ? `\n${c.message}\n` : "",
    "Merci pour votre confiance.",
    "",
    closing(c),
  ]
    .filter((l, i, arr) => l !== "" || arr[i - 1] !== "")
    .join("\n");
  return { subject, text };
}

export function reminderEmail(c: Common & { number: string; remainingCents: number; dueDate: string | null; iban: string | null }) {
  const subject = `Rappel : facture ${c.number} — ${c.orgName}`;
  const text = [
    greeting(c.contactName),
    "",
    `Sauf erreur de notre part, la facture ${c.number}${c.dueDate ? `, arrivée à échéance le ${day(c.dueDate)},` : ""} reste à régler pour un montant de ${euro(c.remainingCents)}.`,
    c.iban ? `Règlement par virement : IBAN ${c.iban.replace(/(.{4})/g, "$1 ").trim()} (référence ${c.number}).` : "",
    "Si le règlement a été effectué entre-temps, merci de ne pas tenir compte de ce message.",
    c.message ? `\n${c.message}\n` : "",
    closing(c),
  ]
    .filter(Boolean)
    .join("\n");
  return { subject, text };
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Version HTML (texte échappé : aucun contenu saisi ne peut injecter de balise). */
export function toHtml(text: string, brandColor: string | null, orgName: string): string {
  const accent = brandColor ?? "#2347F5";
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px;line-height:1.55">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  return `<!doctype html><html lang="fr"><body style="margin:0;background:#F4F5F7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0F172A">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:14px;overflow:hidden">
<tr><td style="height:4px;background:${accent}"></td></tr>
<tr><td style="padding:28px 28px 8px;font-size:15px">${paragraphs}</td></tr>
<tr><td style="padding:0 28px 24px;font-size:12px;color:#64748B">${escapeHtml(orgName)} · document joint au format PDF</td></tr>
</table></td></tr></table></body></html>`;
}
