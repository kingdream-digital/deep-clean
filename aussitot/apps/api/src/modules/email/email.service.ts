import type { EmailStatus } from "@aussitot/shared";
import { withTenant, type Db } from "../../lib/db.ts";
import type { Ctx } from "../../lib/context.ts";
import type { AfterCommit } from "../../lib/afterCommit.ts";
import { enqueueEmail } from "../../lib/queue.ts";
import { MailNotConfiguredError, sendMail } from "../../lib/mailer.ts";
import { logger } from "../../lib/logger.ts";
import { toHtml } from "./templates.ts";
import { renderInvoicePdfFor } from "../invoices/invoices.pdf.ts";
import { renderQuotePdfFor } from "../quotes/quotes.pdf.ts";

export type EmailKind = "QUOTE" | "INVOICE" | "INVOICE_REMINDER";

/**
 * Inscrit un email dans la file (table outbox) DANS la transaction de
 * l'action (envoi d'un devis, d'une facture…), puis le confie au worker
 * après validation. Rien n'est perdu si le serveur redémarre entre-temps.
 */
export async function queueEmail(
  tx: Db,
  ctx: Ctx,
  after: AfterCommit,
  email: {
    kind: EmailKind;
    entityType: "quote" | "invoice";
    entityId: string;
    to: string;
    replyTo: string | null;
    subject: string;
    body: string;
  },
): Promise<string> {
  const row = await tx.emailOutbox.create({
    data: {
      kind: email.kind,
      entityType: email.entityType,
      entityId: email.entityId,
      to: email.to,
      replyTo: email.replyTo,
      subject: email.subject,
      body: email.body,
      createdById: ctx.userId,
    },
  });
  after.add(() => enqueueEmail({ orgId: ctx.orgId, emailId: row.id }));
  return row.id;
}

export async function lastEmailFor(
  tx: Db,
  entityType: string,
  entityId: string,
): Promise<{ status: EmailStatus; to: string; at: string; error: string | null } | null> {
  const email = await tx.emailOutbox.findFirst({ where: { entityType, entityId }, orderBy: { createdAt: "desc" } });
  if (!email) return null;
  return {
    status: email.status,
    to: email.to,
    at: (email.sentAt ?? email.createdAt).toISOString(),
    error: email.status === "FAILED" ? email.lastError : null,
  };
}

/**
 * Envoi effectif (worker). Le PDF est généré à ce moment, depuis les données
 * figées du document. Renvoie false si l'envoi doit être retenté.
 */
export async function deliverQueuedEmail(
  orgId: string,
  emailId: string,
  attempt: number,
  maxAttempts: number,
): Promise<"sent" | "retry" | "failed" | "skipped"> {
  const email = await withTenant(orgId, (tx) => tx.emailOutbox.findUnique({ where: { id: emailId } }));
  if (!email || email.status !== "QUEUED") return "skipped";

  try {
    const org = await withTenant(orgId, (tx) =>
      tx.organization.findUniqueOrThrow({ where: { id: orgId }, select: { name: true, brandColor: true } }),
    );
    const pdf =
      email.entityType === "quote" ? await renderQuotePdfFor(orgId, email.entityId) : await renderInvoicePdfFor(orgId, email.entityId);
    const result = await sendMail({
      fromName: org.name,
      replyTo: email.replyTo,
      to: email.to,
      subject: email.subject,
      text: email.body,
      html: toHtml(email.body, org.brandColor, org.name),
      attachments: [{ filename: pdf.filename, content: pdf.buffer, contentType: "application/pdf" }],
    });
    await withTenant(orgId, (tx) =>
      tx.emailOutbox.update({
        where: { id: emailId },
        data: { status: "SENT", sentAt: new Date(), attempts: { increment: 1 }, providerMessageId: result.messageId, lastError: null },
      }),
    );
    return "sent";
  } catch (err) {
    const permanent = err instanceof MailNotConfiguredError || attempt >= maxAttempts;
    const message =
      err instanceof MailNotConfiguredError ? err.message : "Le serveur d'envoi n'a pas accepté le message. Nouvel essai automatique.";
    logger.warn({ err, emailId }, "Échec d'envoi d'email");
    await withTenant(orgId, (tx) =>
      tx.emailOutbox.update({
        where: { id: emailId },
        data: {
          attempts: { increment: 1 },
          lastError:
            permanent && !(err instanceof MailNotConfiguredError)
              ? "L'email n'a pas pu être envoyé après plusieurs essais. Vérifiez l'adresse du destinataire."
              : message,
          status: permanent ? "FAILED" : "QUEUED",
        },
      }),
    );
    return permanent ? "failed" : "retry";
  }
}
