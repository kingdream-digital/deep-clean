import { createHash } from "crypto";
import { Prisma, QuoteStatus, Role } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { env } from "../../config/env";
import { logger } from "../../config/logger";
import { createNotification } from "../notifications/notifications.service";
import { classifyReply, extractQuoteNumbers, extractReplyText } from "./replyClassifier";

// Email reçu dans la boîte de l'entreprise, déjà décodé (voir quoteInbox.ts).
export interface InboundEmail {
  messageId: string | null;
  fromEmail: string;
  fromName: string | null;
  subject: string | null;
  text: string;
  date: Date | null;
  // Réponse automatique (absence, accusé de réception…) : jamais traitée.
  isAutoReply?: boolean;
}

export type IngestResult = "recorded" | "duplicate" | "ignored";

// Devis pour lesquels une réponse du client a un sens.
const OPEN_QUOTE_STATUSES: QuoteStatus[] = [QuoteStatus.VALIDATED, QuoteStatus.SENT, QuoteStatus.FOLLOW_UP];

const AUTO_REPLY_SUBJECT = /^(reponse automatique|réponse automatique|automatic reply|auto[- ]?reply|out of office|absence|absent|accuse de reception|accusé de réception|undeliverable|non remis|delivery status)/i;

const MAX_REPLY_TEXT = 5000;

function sameEmail(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
}

// Adresses de l'entreprise elle-même : ses propres envois (copie, transfert)
// ne sont jamais pris pour une réponse du client.
function ownAddresses(): string[] {
  const fromHeader = env.SMTP_FROM?.match(/<([^>]+)>/)?.[1] ?? env.SMTP_FROM;
  return [env.IMAP_USER, env.SMTP_USER, fromHeader, env.COMPANY_EMAIL].filter((v): v is string => !!v && v.includes("@")).map((v) => v.trim().toLowerCase());
}

const quoteForReplySelect = {
  id: true,
  quoteNumber: true,
  status: true,
  contactEmail: true,
  assignedUserId: true,
  createdById: true,
  client: { select: { companyName: true, email: true } },
} satisfies Prisma.QuoteSelect;

type QuoteForReply = Prisma.QuoteGetPayload<{ select: typeof quoteForReplySelect }>;

// Retrouve le devis concerné : d'abord par son numéro (objet « Re: Devis
// DEV-2026-0001 — … » ou message cité), sinon par l'adresse de l'expéditeur
// si elle correspond à UN SEUL devis en attente de réponse.
async function findQuoteForEmail(email: InboundEmail): Promise<QuoteForReply | null> {
  const numbers = extractQuoteNumbers(`${email.subject ?? ""}\n${email.text}`);
  if (numbers.length) {
    const quotes = await prisma.quote.findMany({ where: { quoteNumber: { in: numbers } }, select: quoteForReplySelect });
    // Le numéro cité en premier (l'objet) l'emporte.
    for (const number of numbers) {
      const quote = quotes.find((q) => q.quoteNumber === number);
      if (quote) return quote;
    }
  }
  const sender = email.fromEmail.trim();
  const candidates = await prisma.quote.findMany({
    where: {
      status: { in: [QuoteStatus.SENT, QuoteStatus.FOLLOW_UP] },
      OR: [{ contactEmail: { equals: sender, mode: "insensitive" } }, { client: { email: { equals: sender, mode: "insensitive" } } }],
    },
    select: quoteForReplySelect,
    take: 2,
  });
  return candidates.length === 1 ? candidates[0]! : null;
}

function messageKey(email: InboundEmail): string {
  if (email.messageId?.trim()) return email.messageId.trim().slice(0, 500);
  // Sans Message-ID (rare) : empreinte stable de l'email pour le dédoublonnage.
  const digest = createHash("sha256").update(`${email.fromEmail}|${email.date?.toISOString() ?? ""}|${email.subject ?? ""}|${email.text}`).digest("hex");
  return `sans-id:${digest}`;
}

const INTENT_TEXT = {
  POSITIVE: (who: string, number: string) => ({
    title: `Devis ${number} : réponse positive`,
    body: `${who} semble accepter le devis ${number}. Confirmez l'acceptation en un clic.`,
  }),
  NEGATIVE: (who: string, number: string) => ({
    title: `Devis ${number} : réponse négative`,
    body: `${who} semble refuser le devis ${number}. Confirmez le refus en un clic.`,
  }),
  UNCLEAR: (who: string, number: string) => ({
    title: `Devis ${number} : réponse du client`,
    body: `${who} a répondu au devis ${number}. Réponse à lire.`,
  }),
} as const;

// Personnes concernées par l'issue d'un devis — même règle que l'acceptation
// et le refus (quotes.service.ts::notifyQuote) : le commercial responsable,
// la direction et la RH.
async function notifyReply(quote: QuoteForReply, intent: keyof typeof INTENT_TEXT) {
  const recipients = new Set<string>([quote.assignedUserId ?? quote.createdById]);
  const managers = await prisma.user.findMany({ where: { role: { in: [Role.DIRECTOR, Role.HR] }, isActive: true }, select: { id: true } });
  for (const m of managers) recipients.add(m.id);
  const { title, body } = INTENT_TEXT[intent](quote.client.companyName, quote.quoteNumber);
  await Promise.all(
    [...recipients].map((userId) => createNotification({ userId, type: "COMMERCIAL_UPDATE", title, body, relatedEntityType: "Quote", relatedEntityId: quote.id }))
  );
}

/**
 * Traite un email reçu : s'il répond à un devis encore ouvert, l'enregistre
 * avec la lecture par mots-clés et prévient les personnes concernées. Ne
 * change JAMAIS le statut du devis : un humain confirme en un clic.
 */
export async function ingestInboundEmail(email: InboundEmail): Promise<IngestResult> {
  const sender = email.fromEmail.trim().toLowerCase();
  if (!sender.includes("@")) return "ignored";
  if (email.isAutoReply || AUTO_REPLY_SUBJECT.test((email.subject ?? "").trim())) return "ignored";
  if (ownAddresses().includes(sender)) return "ignored";

  const quote = await findQuoteForEmail(email);
  if (!quote || !OPEN_QUOTE_STATUSES.includes(quote.status)) return "ignored";

  const replyText = extractReplyText(email.text).slice(0, MAX_REPLY_TEXT);
  if (!replyText) return "ignored";
  const classification = classifyReply(replyText);
  const senderMatchesContact = sameEmail(sender, quote.contactEmail) || sameEmail(sender, quote.client.email);

  try {
    await prisma.quoteReply.create({
      data: {
        quoteId: quote.id,
        messageId: messageKey(email),
        fromEmail: sender,
        fromName: email.fromName?.slice(0, 200) || null,
        subject: email.subject?.slice(0, 500) || null,
        receivedAt: email.date ?? new Date(),
        replyText,
        intent: classification.intent,
        positiveKeywords: classification.positive,
        negativeKeywords: classification.negative,
        doubtKeywords: classification.doubts,
        senderMatchesContact,
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return "duplicate";
    throw err;
  }

  logger.info({ quoteId: quote.id, intent: classification.intent }, "Réponse client à un devis reçue par email");
  await notifyReply(quote, classification.intent);
  return "recorded";
}
