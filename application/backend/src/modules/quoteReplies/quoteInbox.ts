import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { prisma } from "../../db/prisma";
import { env } from "../../config/env";
import { logger } from "../../config/logger";
import { ingestInboundEmail, IngestResult } from "./quoteReplies.service";

// Lecture des réponses aux devis dans la boîte mail de l'entreprise (IMAP,
// ex. Gmail avec un mot de passe d'application). Lecture seule : les emails ne
// sont jamais supprimés, déplacés ni marqués comme lus (BODY.PEEK).

// Premier passage (ou boîte réinitialisée) : on ne remonte pas plus loin.
const FIRST_SYNC_DAYS = 30;
// Au plus N emails par passage, pour ne jamais bloquer le serveur ; le reste
// est lu au passage suivant (toutes les 5 minutes).
const MAX_MESSAGES_PER_RUN = 200;
// Un email plus gros (pièces jointes lourdes) est ignoré : une réponse à un
// devis n'en a pas besoin pour être comprise.
const MAX_MESSAGE_BYTES = 15 * 1024 * 1024;

export function inboxConfigured(): boolean {
  return !!env.IMAP_HOST?.trim() && !!env.IMAP_USER?.trim() && !!env.IMAP_PASSWORD?.trim();
}

export interface InboxSyncSummary {
  scanned: number;
  recorded: number;
  duplicates: number;
  ignored: number;
}

let running = false;

function readableError(err: unknown): string {
  const e = err as { authenticationFailed?: boolean; code?: string; responseText?: string; message?: string };
  if (e?.authenticationFailed || /auth/i.test(e?.responseText ?? "")) {
    return "Connexion à la boîte mail refusée : vérifiez IMAP_USER et le mot de passe d'application (IMAP_PASSWORD).";
  }
  if (e?.code === "ENOTFOUND" || e?.code === "ECONNREFUSED" || e?.code === "ETIMEDOUT") {
    return "Serveur de messagerie injoignable : vérifiez IMAP_HOST et IMAP_PORT.";
  }
  return "Lecture de la boîte mail impossible pour le moment.";
}

function isAutoReply(headers: Map<string, unknown>): boolean {
  const autoSubmitted = String(headers.get("auto-submitted") ?? "").toLowerCase();
  if (autoSubmitted && autoSubmitted !== "no") return true;
  const precedence = String(headers.get("precedence") ?? "").toLowerCase();
  return ["bulk", "junk", "list", "auto_reply"].includes(precedence) || headers.has("x-autoreply") || headers.has("x-autorespond");
}

/**
 * Lit les nouveaux emails et enregistre ceux qui répondent à un devis.
 * Renvoie le nombre de réponses enregistrées (pour le journal des
 * automatisations). Sans configuration IMAP : ne fait rien.
 */
export async function syncQuoteInbox(): Promise<InboxSyncSummary> {
  const summary: InboxSyncSummary = { scanned: 0, recorded: 0, duplicates: 0, ignored: 0 };
  if (!inboxConfigured() || running) return summary;
  running = true;

  const mailbox = env.IMAP_MAILBOX;
  const client = new ImapFlow({
    host: env.IMAP_HOST!.trim(),
    port: env.IMAP_PORT,
    secure: env.IMAP_PORT === 993,
    auth: { user: env.IMAP_USER!.trim(), pass: env.IMAP_PASSWORD!.trim() },
    logger: false,
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock(mailbox, { readOnly: true });
    try {
      const status = client.mailbox && typeof client.mailbox === "object" ? client.mailbox : null;
      const uidValidity = status?.uidValidity !== undefined ? String(status.uidValidity) : null;
      const state = await prisma.mailboxSyncState.findUnique({ where: { mailbox } });
      const resetNeeded = !state || state.uidValidity !== uidValidity;

      const found = resetNeeded
        ? await client.search({ since: new Date(Date.now() - FIRST_SYNC_DAYS * 86_400_000) }, { uid: true })
        : await client.search({ uid: `${state.lastUid + 1}:*` }, { uid: true });
      // « N:* » renvoie toujours le dernier email, même déjà lu : on filtre.
      const lastUid = resetNeeded ? 0 : state.lastUid;
      const uids = (found || []).filter((uid) => uid > lastUid).sort((a, b) => a - b).slice(0, MAX_MESSAGES_PER_RUN);

      let highestUid = lastUid;
      for (const uid of uids) {
        const message = await client.fetchOne(String(uid), { uid: true, size: true, source: true }, { uid: true });
        highestUid = Math.max(highestUid, uid);
        summary.scanned += 1;
        if (!message || !message.source || (message.size ?? 0) > MAX_MESSAGE_BYTES) {
          summary.ignored += 1;
          continue;
        }
        let result: IngestResult = "ignored";
        try {
          const parsed = await simpleParser(message.source);
          const from = parsed.from?.value?.[0];
          result = await ingestInboundEmail({
            messageId: parsed.messageId ?? null,
            fromEmail: from?.address ?? "",
            fromName: from?.name || null,
            subject: parsed.subject ?? null,
            text: parsed.text ?? "",
            date: parsed.date ?? null,
            isAutoReply: isAutoReply(parsed.headers as Map<string, unknown>),
          });
        } catch (err) {
          logger.warn({ err, uid }, "Email illisible ignoré lors de la lecture des réponses aux devis");
        }
        if (result === "recorded") summary.recorded += 1;
        else if (result === "duplicate") summary.duplicates += 1;
        else summary.ignored += 1;
      }

      await prisma.mailboxSyncState.upsert({
        where: { mailbox },
        create: { mailbox, uidValidity, lastUid: highestUid, lastSyncAt: new Date(), lastError: null },
        update: { uidValidity, lastUid: highestUid, lastSyncAt: new Date(), lastError: null },
      });
    } finally {
      lock.release();
    }
    await client.logout();
  } catch (err) {
    const message = readableError(err);
    logger.warn({ err: (err as Error)?.message }, `Réponses aux devis : ${message}`);
    await prisma.mailboxSyncState
      .upsert({ where: { mailbox }, create: { mailbox, lastError: message }, update: { lastError: message } })
      .catch(() => undefined);
    client.close();
    throw new Error(message);
  } finally {
    running = false;
  }
  return summary;
}

/** État affiché dans l'application (jamais le mot de passe). */
export async function getInboxStatus() {
  const state = await prisma.mailboxSyncState.findUnique({ where: { mailbox: env.IMAP_MAILBOX } });
  return {
    configured: inboxConfigured(),
    address: inboxConfigured() ? env.IMAP_USER!.trim() : null,
    lastSyncAt: state?.lastSyncAt ?? null,
    lastError: state?.lastError ?? null,
  };
}
