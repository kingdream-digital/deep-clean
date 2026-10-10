import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../config/env.ts";
import { logger } from "./logger.ts";

export interface OutgoingMail {
  fromName: string;
  replyTo?: string | null;
  to: string;
  subject: string;
  text: string;
  html: string;
  attachments?: { filename: string; content: Buffer; contentType: string }[];
}

/** Boîte d'envoi des tests (aucun email réel n'est envoyé pendant les tests). */
export const testOutbox: OutgoingMail[] = [];

let transporter: Transporter | null | undefined;

function getTransporter(): Transporter | null {
  if (transporter !== undefined) return transporter;
  if (env.SMTP_HOST) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
      pool: true,
      maxConnections: 5,
    });
  } else if (!env.isProduction) {
    // Développement sans serveur SMTP : le message est journalisé, pas envoyé.
    transporter = nodemailer.createTransport({ jsonTransport: true });
  } else {
    transporter = null;
  }
  return transporter;
}

export class MailNotConfiguredError extends Error {
  constructor() {
    super("L'envoi d'emails n'est pas configuré sur le serveur (SMTP).");
  }
}

export async function sendMail(mail: OutgoingMail): Promise<{ messageId: string; simulated: boolean }> {
  if (env.isTest) {
    testOutbox.push(mail);
    return { messageId: `test-${testOutbox.length}`, simulated: true };
  }
  const transport = getTransporter();
  if (!transport) throw new MailNotConfiguredError();
  const info = await transport.sendMail({
    from: { name: mail.fromName, address: env.MAIL_FROM_ADDRESS },
    replyTo: mail.replyTo ?? undefined,
    to: mail.to,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
    attachments: mail.attachments,
  });
  const simulated = !env.SMTP_HOST;
  if (simulated)
    logger.info({ to: mail.to, subject: mail.subject }, "Email non envoyé (pas de SMTP en développement) — contenu journalisé");
  return { messageId: String(info.messageId ?? "local"), simulated };
}
