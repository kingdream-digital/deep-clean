import { InvoiceStatus, Role } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { logger } from "../../config/logger";
import { ApiError } from "../../utils/ApiError";
import { logActivity } from "../../utils/activityLog";
import { createNotification } from "../notifications/notifications.service";
import { buildInvoicePdf } from "../invoices/invoices.pdf";
import { getCompanyProfile } from "./companyProfile";
import { buildEnInvoice, einvoiceBlockers } from "./enInvoice";
import type { EinvoiceSource } from "./enInvoice";
import { convertToFacturX, listInvoiceEvents, sendFacturX, superPdpConfigured } from "./superpdp.client";
import type { SuperPdpEvent } from "./superpdp.client";

interface Actor {
  userId: string;
  role: Role;
}

// Statuts officiels du cycle de vie d'une facture électronique (réforme
// française) et statuts techniques de Super PDP, en français simple.
const STATUS_LABELS: Record<string, string> = {
  "api:uploaded": "Déposée sur la plateforme",
  "api:invalid": "Refusée : format non conforme",
  "api:validated": "Contrôles de conformité réussis",
  "api:sent": "Transmise",
  "api:rejected": "Rejetée par la plateforme du client",
  "api:received": "Reçue",
  "api:acknowledged": "Réception confirmée",
  "api:accepted": "Acceptée",
  "fr:200": "Déposée",
  "fr:201": "Émise",
  "fr:202": "Reçue par la plateforme du client",
  "fr:203": "Mise à disposition du client",
  "fr:204": "Prise en charge par le client",
  "fr:205": "Approuvée par le client",
  "fr:206": "Approuvée partiellement",
  "fr:207": "En litige",
  "fr:208": "Suspendue",
  "fr:209": "Complétée",
  "fr:210": "Refusée par le client",
  "fr:211": "Paiement transmis",
  "fr:212": "Encaissée",
  "fr:213": "Rejetée",
  "fr:501": "Irrecevable",
};

/** Statuts qui demandent une action (la facture n'a pas abouti ou est contestée). */
export const PROBLEM_STATUSES = new Set(["api:invalid", "api:rejected", "fr:207", "fr:208", "fr:210", "fr:213", "fr:501"]);
/** Statuts après lesquels plus rien n'évolue : inutile d'interroger la plateforme. */
const FINAL_STATUSES = new Set(["api:invalid", "api:rejected", "fr:210", "fr:212", "fr:213", "fr:501"]);

export function statusLabel(code: string): string {
  return STATUS_LABELS[code] ?? code;
}

/** Dernier statut significatif (les accusés techniques du portail public sont ignorés). */
export function latestStatus(events: SuperPdpEvent[]): SuperPdpEvent | null {
  const meaningful = events.filter((e) => !e.status_code.startsWith("ppf:")).sort((a, b) => a.id - b.id);
  return meaningful[meaningful.length - 1] ?? null;
}

const einvoiceSelect = {
  id: true,
  invoiceNumber: true,
  status: true,
  issueDate: true,
  dueDate: true,
  period: true,
  paymentTerms: true,
  contactName: true,
  contactEmail: true,
  contactPhone: true,
  billingAddress: true,
  siret: true,
  vatRate: true,
  subtotalHt: true,
  vatAmount: true,
  totalTtc: true,
  paidAt: true,
  pdpInvoiceId: true,
  pdpStatus: true,
  client: { select: { companyName: true, email: true, billingAddress: true, postalCode: true, city: true, siret: true, siren: true } },
  quote: { select: { quoteNumber: true } },
  site: { select: { name: true, address: true } },
  items: { select: { description: true, quantity: true, unit: true, unitPriceHt: true, totalHt: true }, orderBy: { sortOrder: "asc" as const } },
};

async function loadInvoice(id: string) {
  const invoice = await prisma.invoice.findUnique({ where: { id }, select: einvoiceSelect });
  if (!invoice) throw ApiError.notFound("Facture introuvable.");
  return invoice;
}

/** État de la facture électronique pour une facture : prête ou non, et pourquoi. */
export async function getEinvoiceReadiness(id: string) {
  const invoice = await loadInvoice(id);
  return {
    configured: superPdpConfigured(),
    blockers: einvoiceBlockers(invoice as EinvoiceSource),
  };
}

export async function sendInvoiceElectronically(actor: Actor, id: string) {
  if (!superPdpConfigured()) {
    throw ApiError.badRequest("La facture électronique n'est pas encore activée : renseignez les identifiants Super PDP (SUPERPDP_CLIENT_ID et SUPERPDP_CLIENT_SECRET) sur le serveur.");
  }
  const invoice = await loadInvoice(id);
  if (invoice.status === InvoiceStatus.DRAFT) throw ApiError.conflict("Validez d'abord la facture avant de l'envoyer.");
  if (invoice.status === InvoiceStatus.CANCELLED) throw ApiError.conflict("Une facture annulée ne peut pas être envoyée.");
  if (invoice.pdpInvoiceId && !(invoice.pdpStatus && ["api:invalid"].includes(invoice.pdpStatus))) {
    throw ApiError.conflict("Cette facture a déjà été envoyée électroniquement.");
  }
  const blockers = einvoiceBlockers(invoice as EinvoiceSource);
  if (blockers.length > 0) {
    throw ApiError.badRequest(`Informations manquantes pour la facture électronique : ${blockers.join(" ; ")}.`);
  }

  const company = getCompanyProfile();
  const pdf = await buildInvoicePdf(invoice);
  const enInvoice = buildEnInvoice(invoice as EinvoiceSource, company);
  const facturX = await convertToFacturX(enInvoice, pdf);
  const sent = await sendFacturX(facturX, invoice.invoiceNumber);

  const last = latestStatus(sent.events ?? []);
  const now = new Date();
  const updated = await prisma.invoice.update({
    where: { id },
    data: {
      pdpInvoiceId: String(sent.id),
      pdpStatus: last?.status_code ?? "api:uploaded",
      pdpStatusLabel: statusLabel(last?.status_code ?? "api:uploaded"),
      pdpSentAt: now,
      pdpUpdatedAt: now,
      pdpError: null,
      // Transmise par la plateforme : la facture est envoyée.
      ...(invoice.status === InvoiceStatus.VALIDATED ? { status: InvoiceStatus.SENT, sentAt: now } : {}),
    },
    select: { id: true, pdpInvoiceId: true, pdpStatus: true, pdpStatusLabel: true, pdpSentAt: true, status: true },
  });
  await logActivity({ userId: actor.userId, action: "INVOICE_EINVOICE_SENT", entityType: "Invoice", entityId: id, metadata: { pdpInvoiceId: sent.id } });
  return updated;
}

/**
 * Relit les statuts d'une facture sur Super PDP. Prévient la direction et la
 * RH dès qu'un statut demande une action (rejet, refus, litige…).
 */
export async function refreshEinvoiceStatus(id: string) {
  const invoice = await prisma.invoice.findUnique({ where: { id }, select: { id: true, invoiceNumber: true, pdpInvoiceId: true, pdpStatus: true, client: { select: { companyName: true } } } });
  if (!invoice) throw ApiError.notFound("Facture introuvable.");
  if (!invoice.pdpInvoiceId) throw ApiError.conflict("Cette facture n'a pas été envoyée électroniquement.");

  const events = await listInvoiceEvents(invoice.pdpInvoiceId);
  const last = latestStatus(events);
  if (!last || last.status_code === invoice.pdpStatus) {
    await prisma.invoice.update({ where: { id }, data: { pdpUpdatedAt: new Date() } });
    return { changed: false, status: invoice.pdpStatus };
  }
  const problem = PROBLEM_STATUSES.has(last.status_code);
  await prisma.invoice.update({
    where: { id },
    data: {
      pdpStatus: last.status_code,
      pdpStatusLabel: statusLabel(last.status_code),
      pdpUpdatedAt: new Date(),
      pdpError: problem ? last.status_text?.slice(0, 500) || statusLabel(last.status_code) : null,
    },
  });
  if (problem) {
    const managers = await prisma.user.findMany({ where: { role: { in: [Role.DIRECTOR, Role.HR] }, isActive: true }, select: { id: true } });
    await Promise.all(
      managers.map((m) =>
        createNotification({
          userId: m.id,
          type: "COMMERCIAL_UPDATE",
          title: "Facture électronique à vérifier",
          body: `Facture ${invoice.invoiceNumber} — ${invoice.client.companyName} : ${statusLabel(last.status_code).toLowerCase()}.`,
          relatedEntityType: "Invoice",
          relatedEntityId: invoice.id,
        })
      )
    );
  }
  return { changed: true, status: last.status_code };
}

/** Tâche planifiée : met à jour les factures électroniques encore en cours. */
export async function runEinvoiceStatusJob(): Promise<void> {
  if (!superPdpConfigured()) return;
  const since = new Date(Date.now() - 90 * 86_400_000);
  const pending = await prisma.invoice.findMany({
    where: { pdpInvoiceId: { not: null }, pdpSentAt: { gte: since }, OR: [{ pdpStatus: null }, { pdpStatus: { notIn: [...FINAL_STATUSES] } }] },
    select: { id: true },
    take: 200,
  });
  for (const { id } of pending) {
    try {
      await refreshEinvoiceStatus(id);
    } catch (err) {
      logger.warn({ err, invoiceId: id }, "Suivi de facture électronique impossible pour le moment");
    }
  }
}
