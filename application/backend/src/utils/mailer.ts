import nodemailer, { Transporter } from "nodemailer";
import { env } from "../config/env";
import { logger } from "../config/logger";

let cachedTransport: Transporter | null = null;

// Sans SMTP_HOST configuré (dev/test, ou avant que le client ne fournisse ses
// identifiants réels de messagerie), on utilise un transport "jsonTransport" :
// le code fonctionne et reste testable de bout en bout, mais rien n'est
// réellement délivré. Un avertissement est journalisé à chaque envoi dans ce
// mode pour ne jamais laisser croire, en production, qu'un email est parti.
function getTransport(): Transporter {
  if (cachedTransport) return cachedTransport;

  cachedTransport = env.SMTP_HOST
    ? nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE,
        auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
      })
    : nodemailer.createTransport({ jsonTransport: true });

  return cachedTransport;
}

export interface MailAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

export interface SendMailInput {
  to: string;
  subject: string;
  text: string;
  attachments?: MailAttachment[];
}

export async function sendMail(input: SendMailInput): Promise<void> {
  if (!env.SMTP_HOST) {
    logger.warn({ to: input.to, subject: input.subject }, "SMTP non configuré — email NON réellement envoyé (mode simulation).");
  }
  const transport = getTransport();
  await transport.sendMail({
    from: env.SMTP_FROM ?? env.SMTP_USER ?? `no-reply@${env.COMPANY_LEGAL_NAME.toLowerCase().replace(/\s+/g, "")}.local`,
    to: input.to,
    subject: input.subject,
    text: input.text,
    attachments: input.attachments,
  });
}
