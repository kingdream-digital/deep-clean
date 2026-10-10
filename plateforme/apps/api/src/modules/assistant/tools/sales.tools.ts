import { z } from "zod";
import { CLIENT_KINDS, PAYMENT_METHODS, PAYMENT_METHOD_LABELS, formatDayLong, type InvoiceStatus } from "@aussitot/shared";
import { withTenant } from "../../../lib/db.ts";
import { AppError } from "../../../lib/errors.ts";
import type { Ctx } from "../../../lib/context.ts";
import { todayIn } from "../../../lib/time.ts";
import * as clients from "../../clients/clients.service.ts";
import * as catalog from "../../catalog/catalog.service.ts";
import * as sites from "../../sites/sites.service.ts";
import * as quotes from "../../quotes/quotes.service.ts";
import * as invoices from "../../invoices/invoices.service.ts";
import { defineTool } from "./types.ts";
import { euros, eurosSchema, invoiceForModel, lineSchema, quoteForModel, toCents, toDocumentLines } from "./common.ts";

// ---------------------------------------------------------------------------
// Résolution d'un devis / d'une facture par identifiant OU par numéro dicté
// ---------------------------------------------------------------------------

const quoteRef = {
  quote_id: z.uuid().optional().describe("Identifiant du devis (prioritaire)."),
  number: z.string().max(40).optional().describe("Numéro du devis, ex. « D-2026-0012 »."),
};
const invoiceRef = {
  invoice_id: z.uuid().optional().describe("Identifiant de la facture (prioritaire)."),
  number: z.string().max(40).optional().describe("Numéro de la facture, ex. « F-2026-0042 »."),
};

async function resolveQuoteId(ctx: Ctx, ref: { quote_id?: string; number?: string }): Promise<string> {
  if (ref.quote_id) return ref.quote_id;
  if (!ref.number) throw AppError.badRequest("Précisez l'identifiant ou le numéro du devis.");
  const found = await withTenant(ctx.orgId, (tx) =>
    tx.quote.findFirst({ where: { number: { equals: ref.number!.trim(), mode: "insensitive" } }, select: { id: true } }),
  );
  if (!found) throw AppError.notFound(`Aucun devis portant le numéro ${ref.number}.`);
  return found.id;
}

async function resolveInvoiceId(ctx: Ctx, ref: { invoice_id?: string; number?: string }): Promise<string> {
  if (ref.invoice_id) return ref.invoice_id;
  if (!ref.number) throw AppError.badRequest("Précisez l'identifiant ou le numéro de la facture.");
  const found = await withTenant(ctx.orgId, (tx) =>
    tx.invoice.findFirst({ where: { number: { equals: ref.number!.trim(), mode: "insensitive" } }, select: { id: true } }),
  );
  if (!found) throw AppError.notFound(`Aucune facture portant le numéro ${ref.number}.`);
  return found.id;
}

// ---------------------------------------------------------------------------
// Clients, lieux, catalogue
// ---------------------------------------------------------------------------

export const searchClients = defineTool({
  name: "search_clients",
  description:
    "Recherche des clients par nom (tolère les fautes, les accents et les noms partiels). À utiliser AVANT toute action sur un client désigné par son nom. Renvoie au plus 5 clients.",
  input: z.object({ query: z.string().min(1).max(100).describe("Nom ou partie du nom du client.") }),
  permissions: ["clients.read"],
  label: (i) => `Recherche du client « ${i.query} »`,
  run: async (ctx, i) => {
    const page = await clients.listClients(ctx, { q: i.query, limit: 5 });
    const found = page.items.map((c) => ({
      id: c.id,
      nom: c.name,
      type: c.kind === "COMPANY" ? "professionnel" : "particulier",
      email: c.email,
      ville: c.city,
    }));
    return {
      content: found.length ? found : { resultat: "Aucun client trouvé." },
      summary: found.length
        ? `${found.length} client${found.length > 1 ? "s" : ""} trouvé${found.length > 1 ? "s" : ""}`
        : "Aucun client trouvé",
      card:
        page.items.length === 1
          ? { kind: "client", client: page.items[0]! }
          : page.items.length > 1
            ? {
                kind: "list",
                title: "Clients trouvés",
                items: page.items.map((c) => ({
                  id: c.id,
                  title: c.name,
                  subtitle: [c.city, c.email].filter(Boolean).join(" · "),
                  link: `/clients/${c.id}`,
                })),
              }
            : undefined,
    };
  },
});

export const getClient = defineTool({
  name: "get_client",
  description: "Fiche complète d'un client : coordonnées, adresse, SIRET, nombre de devis, total facturé et reste à encaisser.",
  input: z.object({ client_id: z.uuid() }),
  permissions: ["clients.read"],
  label: () => "Ouverture de la fiche client",
  run: async (ctx, i) => {
    const c = await clients.getClient(ctx, i.client_id);
    return {
      content: {
        id: c.id,
        nom: c.name,
        contact: [c.contactFirstName, c.contactLastName].filter(Boolean).join(" ") || null,
        email: c.email,
        telephone: c.phone,
        adresse: [c.addressLine1, c.addressLine2, [c.postalCode, c.city].filter(Boolean).join(" ")].filter(Boolean).join(", ") || null,
        siret: c.siret,
        devis: c.stats?.quotesCount,
        total_facture: c.stats ? euros(c.stats.invoicedCents) : null,
        reste_a_encaisser: c.stats ? euros(c.stats.outstandingCents) : null,
        notes: c.notes,
      },
      card: { kind: "client", client: c },
    };
  },
});

const clientFields = {
  kind: z.enum(CLIENT_KINDS).optional().describe("COMPANY (professionnel, par défaut) ou INDIVIDUAL (particulier)."),
  email: z.string().max(254).optional(),
  phone: z.string().max(30).optional(),
  contact_first_name: z.string().max(60).optional(),
  contact_last_name: z.string().max(60).optional(),
  address_line1: z.string().max(160).optional().describe("Numéro et rue."),
  postal_code: z.string().max(12).optional(),
  city: z.string().max(80).optional(),
  siret: z.string().max(20).optional(),
  notes: z.string().max(2000).optional(),
};

function clientPayload(i: Partial<Record<keyof typeof clientFields, string | undefined>> & { name?: string }) {
  return {
    name: i.name,
    kind: i.kind as "COMPANY" | "INDIVIDUAL" | undefined,
    email: i.email,
    phone: i.phone,
    contactFirstName: i.contact_first_name,
    contactLastName: i.contact_last_name,
    addressLine1: i.address_line1,
    postalCode: i.postal_code,
    city: i.city,
    siret: i.siret,
    notes: i.notes,
  };
}

export const createClient = defineTool({
  name: "create_client",
  description:
    "Crée un nouveau client. Vérifie d'abord avec search_clients qu'il n'existe pas déjà. Une adresse complète est nécessaire pour pouvoir le facturer, et un email pour lui envoyer des documents.",
  input: z.object({ name: z.string().min(1).max(200).describe("Raison sociale ou nom complet."), ...clientFields }),
  permissions: ["clients.write"],
  label: (i) => `Création du client « ${i.name} »`,
  run: async (ctx, i) => {
    const c = await clients.createClient(ctx, clientPayload(i) as never);
    return {
      content: { id: c.id, nom: c.name, email: c.email },
      summary: `Client « ${c.name} » créé`,
      card: { kind: "client", client: c },
    };
  },
});

export const updateClient = defineTool({
  name: "update_client",
  description:
    "Met à jour les coordonnées d'un client (email, téléphone, adresse, contact, SIRET, notes). Seuls les champs fournis changent.",
  input: z.object({ client_id: z.uuid(), name: z.string().min(1).max(200).optional(), ...clientFields }),
  permissions: ["clients.write"],
  label: () => "Mise à jour de la fiche client",
  run: async (ctx, i) => {
    const payload = Object.fromEntries(Object.entries(clientPayload(i)).filter(([, v]) => v !== undefined));
    const c = await clients.updateClient(ctx, i.client_id, payload);
    return {
      content: { id: c.id, nom: c.name, email: c.email },
      summary: `Fiche de « ${c.name} » mise à jour`,
      card: { kind: "client", client: c },
    };
  },
});

export const searchSites = defineTool({
  name: "search_sites",
  description: "Recherche un lieu d'intervention (chantier, local, résidence…) par nom.",
  input: z.object({ query: z.string().min(1).max(100) }),
  permissions: ["sites.read"],
  label: (i) => `Recherche du lieu « ${i.query} »`,
  run: async (ctx, i) => {
    const found = await sites.listSites(ctx, { q: i.query });
    return {
      content: found
        .slice(0, 5)
        .map((s) => ({ id: s.id, nom: s.name, client: s.clientName, client_id: s.clientId, adresse: sites.siteAddress(s) })),
    };
  },
});

export const searchCatalog = defineTool({
  name: "search_catalog",
  description:
    "Cherche une prestation dans le catalogue de l'entreprise pour en connaître le prix unitaire HT, l'unité et la TVA. À utiliser avant de chiffrer une prestation dont le prix n'a pas été dicté.",
  input: z.object({ query: z.string().min(1).max(100).describe("Nom de la prestation, ex. « vitres », « remise en état ».") }),
  permissions: ["catalog.read"],
  label: (i) => `Recherche de « ${i.query} » dans le catalogue`,
  run: async (ctx, i) => {
    const items = await catalog.listCatalog(ctx, { q: i.query });
    return {
      content: items.length
        ? items.slice(0, 8).map((c) => ({
            id: c.id,
            prestation: c.name,
            unite: c.unit,
            prix_unitaire_ht_eur: c.unitPriceCents / 100,
            tva_percent: c.vatRateBps / 100,
          }))
        : { resultat: "Aucune prestation correspondante dans le catalogue." },
    };
  },
});

// ---------------------------------------------------------------------------
// Devis
// ---------------------------------------------------------------------------

export const listQuotes = defineTool({
  name: "list_quotes",
  description: "Liste les devis, du plus récent au plus ancien, avec filtre éventuel par statut ou par client.",
  input: z.object({
    status: z
      .enum(["DRAFT", "SENT", "ACCEPTED", "DECLINED", "EXPIRED", "CANCELLED"])
      .optional()
      .describe("DRAFT brouillon, SENT envoyé (en attente de réponse), ACCEPTED, DECLINED, EXPIRED, CANCELLED."),
    client_id: z.uuid().optional(),
    query: z.string().max(100).optional().describe("Texte recherché (numéro, titre, client)."),
    limit: z.number().int().min(1).max(20).optional(),
  }),
  permissions: ["quotes.read"],
  label: () => "Recherche des devis",
  run: async (ctx, i) => {
    const page = await quotes.listQuotes(ctx, { status: i.status, clientId: i.client_id, q: i.query, limit: i.limit ?? 10 });
    return {
      content: page.items.length ? page.items.map(quoteForModel) : { resultat: "Aucun devis." },
      card: page.items.length
        ? {
            kind: "list",
            title: "Devis",
            items: page.items.map((q) => ({
              id: q.id,
              title: `${q.number} · ${q.clientName}`,
              subtitle: q.title ?? undefined,
              trailing: euros(q.totalCents),
              link: `/devis/${q.id}`,
            })),
          }
        : undefined,
    };
  },
});

export const getQuote = defineTool({
  name: "get_quote",
  description: "Détail d'un devis (lignes, montants, statut, envoi).",
  input: z.object(quoteRef),
  permissions: ["quotes.read"],
  label: () => "Ouverture du devis",
  run: async (ctx, i) => {
    const q = await quotes.getQuote(ctx, await resolveQuoteId(ctx, i));
    return {
      content: {
        ...quoteForModel(q),
        lignes: q.lines.map((l) => ({
          designation: l.description,
          quantite: l.quantity,
          unite: l.unit,
          prix_unitaire_ht: euros(l.unitPriceCents),
          total_ht: euros(l.totalHtCents),
        })),
        email_client: q.clientEmail,
        dernier_envoi: q.lastEmail,
      },
      card: { kind: "quote", quote: q },
    };
  },
});

export const createQuote = defineTool({
  name: "create_quote",
  description:
    "Crée un devis en BROUILLON pour un client existant (client_id obtenu via search_clients ou create_client). Les montants sont calculés par l'application. Le devis n'est pas envoyé : propose ensuite l'envoi.",
  input: z.object({
    client_id: z.uuid(),
    title: z.string().max(160).optional().describe("Objet du devis, ex. « Entretien mensuel des bureaux »."),
    site_id: z.uuid().optional(),
    lines: z.array(lineSchema).min(1).max(50),
    notes: z.string().max(4000).optional().describe("Texte visible par le client sur le devis (conditions, horaires…)."),
    valid_days: z.number().int().min(1).max(365).optional().describe("Durée de validité en jours (sinon : réglage de l'entreprise)."),
  }),
  permissions: ["quotes.write"],
  label: () => "Préparation du devis",
  run: async (ctx, i) => {
    const issueDate = todayIn(ctx.timezone);
    const validUntil = i.valid_days
      ? new Date(Date.parse(`${issueDate}T00:00:00Z`) + i.valid_days * 86_400_000).toISOString().slice(0, 10)
      : undefined;
    const q = await quotes.createQuote(ctx, {
      clientId: i.client_id,
      siteId: i.site_id,
      title: i.title,
      notes: i.notes,
      validUntil,
      lines: await toDocumentLines(ctx, i.lines),
    });
    return { content: quoteForModel(q), summary: `Devis ${q.number} créé — ${euros(q.totalCents)} TTC`, card: { kind: "quote", quote: q } };
  },
});

export const updateQuote = defineTool({
  name: "update_quote",
  description:
    "Modifie un devis en BROUILLON : titre, notes, et/ou remplacement COMPLET des lignes (envoyer toutes les lignes souhaitées, pas seulement les nouvelles). Un devis déjà envoyé ne se modifie pas : utiliser duplicate_quote.",
  input: z.object({
    ...quoteRef,
    title: z.string().max(160).optional(),
    notes: z.string().max(4000).optional(),
    lines: z.array(lineSchema).min(1).max(50).optional(),
  }),
  permissions: ["quotes.write"],
  label: () => "Mise à jour du devis",
  run: async (ctx, i) => {
    const id = await resolveQuoteId(ctx, i);
    const q = await quotes.updateQuote(ctx, id, {
      title: i.title,
      notes: i.notes,
      lines: i.lines ? await toDocumentLines(ctx, i.lines) : undefined,
    });
    return {
      content: quoteForModel(q),
      summary: `Devis ${q.number} mis à jour — ${euros(q.totalCents)} TTC`,
      card: { kind: "quote", quote: q },
    };
  },
});

export const duplicateQuote = defineTool({
  name: "duplicate_quote",
  description: "Crée une nouvelle version (brouillon) d'un devis existant, avec un nouveau numéro, pour le modifier.",
  input: z.object(quoteRef),
  permissions: ["quotes.write"],
  label: () => "Duplication du devis",
  run: async (ctx, i) => {
    const q = await quotes.duplicateQuote(ctx, await resolveQuoteId(ctx, i));
    return { content: quoteForModel(q), summary: `Nouvelle version ${q.number} créée`, card: { kind: "quote", quote: q } };
  },
});

export const sendQuote = defineTool({
  name: "send_quote",
  description:
    "Envoie le devis au client par email, PDF joint. Nécessite la confirmation de l'utilisateur (une carte s'affiche). Par défaut à l'adresse de la fiche client.",
  input: z.object({
    ...quoteRef,
    to: z.email().optional().describe("Destinataire, seulement si l'utilisateur l'a précisé."),
    message: z.string().max(2000).optional(),
  }),
  permissions: ["quotes.send"],
  confirm: true,
  label: () => "Préparation de l'envoi du devis",
  describe: async (ctx, i) => {
    const q = await quotes.getQuote(ctx, await resolveQuoteId(ctx, i));
    const to = i.to ?? q.clientEmail;
    if (!to) throw AppError.badRequest(`Le client « ${q.clientName} » n'a pas d'adresse email : demandez-la ou ajoutez-la à sa fiche.`);
    if (q.lines.length === 0) throw AppError.badRequest("Ce devis ne contient aucune prestation.");
    return {
      title: `Envoyer le devis ${q.number}`,
      details: [
        `À : ${to}`,
        `Client : ${q.clientName}`,
        `Montant : ${euros(q.totalCents)}${q.vatExempt ? "" : " TTC"}`,
        ...(i.message ? [`Message : « ${i.message} »`] : []),
      ],
      confirmLabel: "Envoyer",
    };
  },
  run: async (ctx, i) => {
    const q = await quotes.sendQuote(ctx, await resolveQuoteId(ctx, i), { to: i.to, message: i.message });
    return {
      content: { ...quoteForModel(q), envoi: "en cours d'envoi par email" },
      summary: `Devis ${q.number} envoyé à ${q.lastEmail?.to ?? q.clientEmail}`,
      card: { kind: "quote", quote: q },
    };
  },
});

export const setQuoteStatus = defineTool({
  name: "set_quote_status",
  description:
    "Enregistre la réponse du client à un devis (ACCEPTED accepté, DECLINED refusé) ou l'annule (CANCELLED). Nécessite confirmation.",
  input: z.object({ ...quoteRef, status: z.enum(["ACCEPTED", "DECLINED", "CANCELLED"]) }),
  permissions: ["quotes.write"],
  confirm: true,
  label: () => "Mise à jour du statut du devis",
  describe: async (ctx, i) => {
    const q = await quotes.getQuote(ctx, await resolveQuoteId(ctx, i));
    const verb = { ACCEPTED: "Marquer comme accepté", DECLINED: "Marquer comme refusé", CANCELLED: "Annuler" }[i.status];
    return {
      title: `${verb} le devis ${q.number}`,
      details: [`Client : ${q.clientName}`, `Montant : ${euros(q.totalCents)}`],
      confirmLabel: i.status === "CANCELLED" ? "Annuler le devis" : "Confirmer",
    };
  },
  run: async (ctx, i) => {
    const id = await resolveQuoteId(ctx, i);
    const q =
      i.status === "ACCEPTED"
        ? await quotes.acceptQuote(ctx, id)
        : i.status === "DECLINED"
          ? await quotes.declineQuote(ctx, id)
          : await quotes.cancelQuote(ctx, id);
    return { content: quoteForModel(q), summary: `Devis ${q.number} : statut mis à jour`, card: { kind: "quote", quote: q } };
  },
});

// ---------------------------------------------------------------------------
// Factures
// ---------------------------------------------------------------------------

export const listInvoices = defineTool({
  name: "list_invoices",
  description:
    "Liste les factures : toutes, brouillons, impayées (émises non soldées), en retard de paiement, ou payées ; filtre possible par client.",
  input: z.object({
    filter: z.enum(["all", "draft", "unpaid", "overdue", "paid"]).optional(),
    client_id: z.uuid().optional(),
    query: z.string().max(100).optional(),
    limit: z.number().int().min(1).max(20).optional(),
  }),
  permissions: ["invoices.read"],
  label: (i) =>
    i.filter === "overdue"
      ? "Recherche des factures en retard"
      : i.filter === "unpaid"
        ? "Recherche des factures impayées"
        : "Recherche des factures",
  run: async (ctx, i) => {
    const status: InvoiceStatus | undefined = i.filter === "draft" ? "DRAFT" : i.filter === "paid" ? "PAID" : undefined;
    const page = await invoices.listInvoices(ctx, {
      status,
      unpaid: i.filter === "unpaid",
      overdue: i.filter === "overdue",
      clientId: i.client_id,
      q: i.query,
      limit: i.limit ?? 10,
    });
    const total = page.items.reduce((sum, inv) => sum + inv.totalCents - inv.amountPaidCents, 0);
    return {
      content: page.items.length
        ? {
            factures: page.items.map(invoiceForModel),
            ...(i.filter === "unpaid" || i.filter === "overdue" ? { total_restant_du: euros(total) } : {}),
          }
        : { resultat: "Aucune facture." },
      card: page.items.length
        ? {
            kind: "list",
            title: i.filter === "overdue" ? "Factures en retard" : i.filter === "unpaid" ? "Factures à encaisser" : "Factures",
            total: page.items.length,
            items: page.items.map((inv) => ({
              id: inv.id,
              title: `${inv.number ?? "Brouillon"} · ${inv.clientName}`,
              subtitle: inv.dueDate ? `Échéance ${formatDayLong(inv.dueDate, { weekday: false })}` : undefined,
              trailing: euros(inv.totalCents - inv.amountPaidCents),
              link: `/factures/${inv.id}`,
            })),
          }
        : undefined,
    };
  },
});

export const getInvoice = defineTool({
  name: "get_invoice",
  description: "Détail d'une facture (lignes, paiements, échéance, envoi).",
  input: z.object(invoiceRef),
  permissions: ["invoices.read"],
  label: () => "Ouverture de la facture",
  run: async (ctx, i) => {
    const inv = await invoices.getInvoice(ctx, await resolveInvoiceId(ctx, i));
    return {
      content: {
        ...invoiceForModel(inv),
        lignes: inv.lines.map((l) => ({
          designation: l.description,
          quantite: l.quantity,
          unite: l.unit,
          total_ht: euros(l.totalHtCents),
        })),
        paiements: inv.payments.map((p) => ({ montant: euros(p.amountCents), le: p.paidOn, mode: PAYMENT_METHOD_LABELS[p.method] })),
        email_client: inv.clientEmail,
      },
      card: { kind: "invoice", invoice: inv },
    };
  },
});

export const createInvoice = defineTool({
  name: "create_invoice",
  description: "Crée une facture en BROUILLON (sans numéro) pour un client. Elle n'est ni émise ni envoyée : propose ensuite l'envoi.",
  input: z.object({
    client_id: z.uuid(),
    title: z.string().max(160).optional(),
    lines: z.array(lineSchema).min(1).max(50),
    service_period: z.string().max(80).optional().describe("Période facturée, ex. « octobre 2026 »."),
    due_date: z.iso.date().optional().describe("Échéance AAAA-MM-JJ (sinon : délai de paiement de l'entreprise)."),
    notes: z.string().max(4000).optional(),
  }),
  permissions: ["invoices.write"],
  label: () => "Préparation de la facture",
  run: async (ctx, i) => {
    const inv = await invoices.createInvoice(ctx, {
      clientId: i.client_id,
      title: i.title,
      servicePeriod: i.service_period,
      dueDate: i.due_date,
      notes: i.notes,
      lines: await toDocumentLines(ctx, i.lines),
    });
    return {
      content: invoiceForModel(inv),
      summary: `Facture brouillon créée — ${euros(inv.totalCents)} TTC`,
      card: { kind: "invoice", invoice: inv },
    };
  },
});

export const createInvoiceFromQuote = defineTool({
  name: "create_invoice_from_quote",
  description: "Crée une facture en BROUILLON reprenant toutes les lignes d'un devis (accepté de préférence).",
  input: z.object(quoteRef),
  permissions: ["invoices.write"],
  label: () => "Facturation du devis",
  run: async (ctx, i) => {
    const inv = await invoices.createInvoiceFromQuote(ctx, await resolveQuoteId(ctx, i));
    return {
      content: invoiceForModel(inv),
      summary: `Facture brouillon créée depuis le devis ${inv.quoteNumber}`,
      card: { kind: "invoice", invoice: inv },
    };
  },
});

export const sendInvoice = defineTool({
  name: "send_invoice",
  description:
    "Envoie la facture au client par email, PDF joint. Si c'est un brouillon, elle est d'abord ÉMISE (numéro légal définitif, plus modifiable). Nécessite confirmation.",
  input: z.object({ ...invoiceRef, to: z.email().optional(), message: z.string().max(2000).optional() }),
  permissions: ["invoices.issue"],
  confirm: true,
  label: () => "Préparation de l'envoi de la facture",
  describe: async (ctx, i) => {
    const inv = await invoices.getInvoice(ctx, await resolveInvoiceId(ctx, i));
    const to = i.to ?? inv.clientEmail;
    if (!to) throw AppError.badRequest(`Le client « ${inv.clientName} » n'a pas d'adresse email.`);
    return {
      title: inv.number ? `Envoyer la facture ${inv.number}` : "Émettre et envoyer la facture",
      details: [
        `À : ${to}`,
        `Client : ${inv.clientName}`,
        `Montant : ${euros(inv.totalCents)}${inv.vatExempt ? "" : " TTC"}`,
        ...(inv.status === "DRAFT" ? ["La facture recevra son numéro définitif et ne sera plus modifiable."] : []),
      ],
      confirmLabel: inv.status === "DRAFT" ? "Émettre et envoyer" : "Envoyer",
    };
  },
  run: async (ctx, i) => {
    const inv = await invoices.sendInvoice(ctx, await resolveInvoiceId(ctx, i), { to: i.to, message: i.message });
    return {
      content: { ...invoiceForModel(inv), envoi: "en cours d'envoi par email" },
      summary: `Facture ${inv.number} envoyée`,
      card: { kind: "invoice", invoice: inv },
    };
  },
});

export const recordPayment = defineTool({
  name: "record_payment",
  description: "Enregistre un paiement reçu sur une facture émise. Sans montant précisé : le solde restant. Nécessite confirmation.",
  input: z.object({
    ...invoiceRef,
    amount_eur: eurosSchema.optional().describe("Montant reçu en euros (TTC)."),
    paid_on: z.iso.date().optional().describe("Date du paiement AAAA-MM-JJ (par défaut aujourd'hui)."),
    method: z
      .enum(PAYMENT_METHODS)
      .optional()
      .describe("TRANSFER virement, CARD carte, CHECK chèque, CASH espèces, DIRECT_DEBIT prélèvement, OTHER."),
  }),
  permissions: ["invoices.payments"],
  confirm: true,
  label: () => "Préparation de l'encaissement",
  describe: async (ctx, i) => {
    const inv = await invoices.getInvoice(ctx, await resolveInvoiceId(ctx, i));
    const remaining = inv.totalCents - inv.amountPaidCents;
    const amount = i.amount_eur !== undefined ? toCents(i.amount_eur) : remaining;
    return {
      title: `Encaisser ${euros(amount)} sur la facture ${inv.number ?? "brouillon"}`,
      details: [
        `Client : ${inv.clientName}`,
        `Mode : ${PAYMENT_METHOD_LABELS[i.method ?? "TRANSFER"]}`,
        `Reste à payer ensuite : ${euros(Math.max(0, remaining - amount))}`,
      ],
      confirmLabel: "Enregistrer le paiement",
    };
  },
  run: async (ctx, i) => {
    const id = await resolveInvoiceId(ctx, i);
    const before = await invoices.getInvoice(ctx, id);
    const amountCents = i.amount_eur !== undefined ? toCents(i.amount_eur) : before.totalCents - before.amountPaidCents;
    const inv = await invoices.recordPayment(ctx, id, {
      amountCents,
      paidOn: i.paid_on ?? todayIn(ctx.timezone),
      method: i.method ?? "TRANSFER",
    });
    return {
      content: invoiceForModel(inv),
      summary: `Paiement de ${euros(amountCents)} enregistré`,
      card: { kind: "invoice", invoice: inv },
    };
  },
});

export const sendReminder = defineTool({
  name: "send_payment_reminder",
  description: "Envoie au client un email de relance pour une facture impayée. Nécessite confirmation.",
  input: z.object({ ...invoiceRef, message: z.string().max(2000).optional() }),
  permissions: ["invoices.issue"],
  confirm: true,
  label: () => "Préparation de la relance",
  describe: async (ctx, i) => {
    const inv = await invoices.getInvoice(ctx, await resolveInvoiceId(ctx, i));
    if (!inv.clientEmail) throw AppError.badRequest(`Le client « ${inv.clientName} » n'a pas d'adresse email.`);
    return {
      title: `Relancer ${inv.clientName}`,
      details: [`Facture ${inv.number}`, `Reste à payer : ${euros(inv.totalCents - inv.amountPaidCents)}`, `À : ${inv.clientEmail}`],
      confirmLabel: "Envoyer la relance",
    };
  },
  run: async (ctx, i) => {
    const inv = await invoices.remindInvoice(ctx, await resolveInvoiceId(ctx, i), { message: i.message });
    return { content: invoiceForModel(inv), summary: `Relance envoyée pour la facture ${inv.number}` };
  },
});

export const cancelInvoice = defineTool({
  name: "cancel_invoice",
  description: "Annule une facture émise et non payée en émettant un avoir du même montant. Nécessite confirmation.",
  input: z.object({ ...invoiceRef, reason: z.string().max(500).optional() }),
  permissions: ["invoices.issue"],
  confirm: true,
  label: () => "Préparation de l'annulation",
  describe: async (ctx, i) => {
    const inv = await invoices.getInvoice(ctx, await resolveInvoiceId(ctx, i));
    return {
      title: `Annuler la facture ${inv.number ?? "brouillon"}`,
      details: [
        `Client : ${inv.clientName}`,
        `Un avoir de ${euros(inv.totalCents)} sera émis.`,
        ...(i.reason ? [`Motif : ${i.reason}`] : []),
      ],
      confirmLabel: "Émettre l'avoir",
    };
  },
  run: async (ctx, i) => {
    const credit = await invoices.cancelWithCreditNote(ctx, await resolveInvoiceId(ctx, i), i.reason);
    return { content: invoiceForModel(credit), summary: `Avoir ${credit.number} émis`, card: { kind: "invoice", invoice: credit } };
  },
});
