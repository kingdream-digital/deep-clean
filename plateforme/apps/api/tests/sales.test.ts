import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { api, createClient, createTestOrg, sampleLines, testApp, type TestOrg } from "./helpers.ts";
import { testOutbox } from "../src/lib/mailer.ts";
import { deliverQueuedEmail } from "../src/modules/email/email.service.ts";
import { withTenant } from "../src/lib/db.ts";

let app: FastifyInstance;
let org: TestOrg;
let client: { id: string };

beforeAll(async () => {
  app = await testApp();
  org = await createTestOrg(app, "sales");
  client = await createClient(app, org.admin.token);
});
afterAll(async () => app.close());

/** Exécute les emails en file comme le ferait le worker. */
async function flushEmails(): Promise<void> {
  const queued = await withTenant(org.orgId, (tx) => tx.emailOutbox.findMany({ where: { status: "QUEUED" } }));
  for (const email of queued) await deliverQueuedEmail(org.orgId, email.id, 1, 6);
}

describe("devis", () => {
  it("calcule les montants côté serveur, quoi que l'app envoie", async () => {
    const res = await api(app, org.admin.token).post("/v1/quotes", {
      clientId: client.id,
      title: "Entretien boutique",
      lines: sampleLines.map((l) => ({ ...l, totalHtCents: 1, totalCents: 1 })),
    });
    expect(res.statusCode).toBe(201);
    const quote = res.json();
    expect(quote.number).toMatch(/^D-\d{4}-\d{4}$/);
    expect(quote.subtotalCents).toBe(3 * 3500 + 12000);
    expect(quote.vatCents).toBe(4500);
    expect(quote.totalCents).toBe(27000);
    expect(quote.status).toBe("DRAFT");
    expect(quote.validUntil > quote.issueDate).toBe(true);
  });

  it("envoie le devis au client avec le PDF, puis le fige", async () => {
    const quote = (await api(app, org.admin.token).post("/v1/quotes", { clientId: client.id, lines: sampleLines })).json();
    const sent = await api(app, org.admin.token).post(`/v1/quotes/${quote.id}/send`, { message: "Au plaisir de travailler ensemble." });
    expect(sent.statusCode).toBe(200);
    expect(sent.json().status).toBe("SENT");
    expect(sent.json().lastEmail.status).toBe("QUEUED");

    testOutbox.length = 0;
    await flushEmails();
    expect(testOutbox).toHaveLength(1);
    const mail = testOutbox[0]!;
    expect(mail.to).toBe("contact@dupont.test");
    expect(mail.subject).toContain(quote.number);
    expect(mail.text).toContain("270,00 € TTC");
    expect(mail.text).toContain("Au plaisir de travailler ensemble.");
    expect(mail.html).not.toContain("<script");
    expect(mail.attachments?.[0]?.filename).toBe(`Devis-${quote.number}.pdf`);
    expect(mail.attachments?.[0]?.content.subarray(0, 5).toString()).toBe("%PDF-");

    const after = (await api(app, org.admin.token).get(`/v1/quotes/${quote.id}`)).json();
    expect(after.lastEmail.status).toBe("SENT");
    const locked = await api(app, org.admin.token).patch(`/v1/quotes/${quote.id}`, { title: "modifié" });
    expect(locked.statusCode).toBe(409);
  });

  it("refuse d'envoyer un devis vide ou à un client sans email", async () => {
    const empty = (await api(app, org.admin.token).post("/v1/quotes", { clientId: client.id })).json();
    expect((await api(app, org.admin.token).post(`/v1/quotes/${empty.id}/send`)).statusCode).toBe(400);
    const noEmail = await createClient(app, org.admin.token, "Client sans email", { email: "" });
    const quote = (await api(app, org.admin.token).post("/v1/quotes", { clientId: noEmail.id, lines: sampleLines })).json();
    const res = await api(app, org.admin.token).post(`/v1/quotes/${quote.id}/send`);
    expect(res.statusCode).toBe(400);
    expect(res.json().error.details.to[0]).toContain("adresse email");
  });

  it("produit un PDF téléchargeable", async () => {
    const quote = (await api(app, org.admin.token).post("/v1/quotes", { clientId: client.id, lines: sampleLines })).json();
    const pdf = await api(app, org.admin.token).get(`/v1/quotes/${quote.id}/pdf`);
    expect(pdf.statusCode).toBe(200);
    expect(pdf.headers["content-type"]).toBe("application/pdf");
    expect(pdf.rawPayload.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("suit le cycle accepté → facture", async () => {
    const quote = (await api(app, org.admin.token).post("/v1/quotes", { clientId: client.id, lines: sampleLines })).json();
    await api(app, org.admin.token).post(`/v1/quotes/${quote.id}/send`);
    const accepted = await api(app, org.admin.token).post(`/v1/quotes/${quote.id}/accept`);
    expect(accepted.json().status).toBe("ACCEPTED");
    const invoice = await api(app, org.admin.token).post(`/v1/invoices/from-quote/${quote.id}`);
    expect(invoice.statusCode).toBe(201);
    expect(invoice.json().totalCents).toBe(quote.totalCents);
    expect(invoice.json().quoteNumber).toBe(quote.number);
    expect(invoice.json().number).toBeNull();
  });
});

describe("factures", () => {
  async function draft(lines = sampleLines) {
    return (await api(app, org.admin.token).post("/v1/invoices", { clientId: client.id, lines })).json();
  }

  it("attribue des numéros continus, sans doublon même en émission simultanée", async () => {
    const drafts = await Promise.all(Array.from({ length: 8 }, () => draft()));
    const issued = await Promise.all(drafts.map((d) => api(app, org.admin.token).post(`/v1/invoices/${d.id}/issue`)));
    const numbers = issued.map((r) => r.json().number as string).sort();
    expect(new Set(numbers).size).toBe(8);
    const seqs = numbers.map((n) => Number(n.split("-").at(-1))).sort((x, y) => x - y);
    expect(seqs).toEqual(Array.from({ length: 8 }, (_, i) => seqs[0]! + i));
  });

  it("refuse d'émettre une facture sans les mentions obligatoires", async () => {
    const noAddress = await createClient(app, org.admin.token, "Client incomplet", { addressLine1: "", postalCode: "", city: "" });
    const invoice = (await api(app, org.admin.token).post("/v1/invoices", { clientId: noAddress.id, lines: sampleLines })).json();
    const res = await api(app, org.admin.token).post(`/v1/invoices/${invoice.id}/issue`);
    expect(res.statusCode).toBe(400);
    expect(res.json().error.details.mentions[0]).toContain("Adresse complète du client");
  });

  it("enregistre les paiements partiels puis le solde", async () => {
    const invoice = await draft();
    await api(app, org.admin.token).post(`/v1/invoices/${invoice.id}/send`);
    const partial = await api(app, org.admin.token).post(`/v1/invoices/${invoice.id}/payments`, {
      amountCents: 10000,
      paidOn: "2026-10-12",
      method: "TRANSFER",
    });
    expect(partial.json().status).toBe("PARTIALLY_PAID");
    const tooMuch = await api(app, org.admin.token).post(`/v1/invoices/${invoice.id}/payments`, {
      amountCents: 999999,
      paidOn: "2026-10-12",
    });
    expect(tooMuch.statusCode).toBe(400);
    const full = await api(app, org.admin.token).post(`/v1/invoices/${invoice.id}/payments`, {
      amountCents: 17000,
      paidOn: "2026-10-13",
      method: "CHECK",
    });
    expect(full.json().status).toBe("PAID");
    expect(full.json().amountPaidCents).toBe(27000);
  });

  it("annule une facture émise par un avoir, jamais par suppression", async () => {
    const invoice = await draft();
    const issued = (await api(app, org.admin.token).post(`/v1/invoices/${invoice.id}/issue`)).json();
    expect((await api(app, org.admin.token).delete(`/v1/invoices/${invoice.id}`)).statusCode).toBe(409);
    const credit = await api(app, org.admin.token).post(`/v1/invoices/${invoice.id}/cancel`, { reason: "Erreur de client" });
    expect(credit.statusCode).toBe(200);
    expect(credit.json().kind).toBe("CREDIT_NOTE");
    expect(credit.json().number).toMatch(/^AV-\d{4}-\d{4}$/);
    expect(credit.json().totalCents).toBe(-issued.totalCents);
    expect(credit.json().creditedInvoiceNumber).toBe(issued.number);
    expect((await api(app, org.admin.token).get(`/v1/invoices/${invoice.id}`)).json().status).toBe("CANCELLED");
  });

  it("liste les impayés en retard et permet la relance", async () => {
    const invoice = await draft();
    // Une modification partielle ne touche pas aux lignes (régression Zod 4).
    const patched = await api(app, org.admin.token).patch(`/v1/invoices/${invoice.id}`, { dueDate: "2026-01-15" });
    expect(patched.json().lines).toHaveLength(2);
    expect((await api(app, org.admin.token).post(`/v1/invoices/${invoice.id}/send`)).statusCode).toBe(200);
    // Échéance forcée dans le passé (facture émise aujourd'hui, échéance au plus tôt ce jour).
    const pg = await import("pg");
    const admin = new pg.default.Client({ connectionString: process.env.DATABASE_ADMIN_URL });
    await admin.connect();
    await admin.query(`UPDATE invoices SET "dueDate" = '2026-01-15' WHERE id = $1`, [invoice.id]);
    await admin.end();
    const overdue = await api(app, org.admin.token).get("/v1/invoices?overdue=true");
    expect(overdue.json().items.map((i: { id: string }) => i.id)).toContain(invoice.id);
    testOutbox.length = 0;
    expect((await api(app, org.admin.token).post(`/v1/invoices/${invoice.id}/remind`)).statusCode).toBe(200);
    await flushEmails();
    expect(testOutbox.some((m) => m.subject.startsWith("Rappel : facture"))).toBe(true);
  });

  it("applique la franchise en base de TVA (micro-entreprise)", async () => {
    const settings = (await api(app, org.admin.token).get("/v1/organization")).json();
    await api(app, org.admin.token).put("/v1/organization", { ...settings, vatRegime: "FRANCHISE", vatNumber: null });
    const invoice = await draft();
    expect(invoice.vatExempt).toBe(true);
    expect(invoice.vatCents).toBe(0);
    expect(invoice.totalCents).toBe(invoice.subtotalCents);
    await api(app, org.admin.token).put("/v1/organization", settings);
  });
});

describe("tableau de bord", () => {
  it("donne les indicateurs commerciaux à la direction", async () => {
    const res = await api(app, org.admin.token).get("/v1/dashboard");
    expect(res.statusCode).toBe(200);
    expect(res.json().sales.invoicedThisMonthCents).toBeGreaterThan(0);
  });
});
