import request from "supertest";
import { Role } from "@prisma/client";
import { createApp } from "../src/app";
import { prisma } from "../src/db/prisma";
import { createTestUser, resetDatabase, TEST_PASSWORD } from "./helpers";

const app = createApp();

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function loginAs(role: Role, email: string) {
  const user = await createTestUser({ role, email });
  const login = await request(app).post("/api/v1/auth/login").send({ username: user.username, password: TEST_PASSWORD });
  return { user, accessToken: login.body.accessToken as string };
}

async function createTestClient(token: string, overrides: Record<string, unknown> = {}) {
  const res = await request(app)
    .post("/api/v1/clients")
    .set("Authorization", `Bearer ${token}`)
    .send({ companyName: "Entreprise ABC", email: "contact@abc.test", ...overrides });
  return res.body.client as { id: string };
}

describe("Facturation — accès réservé à RH/Direction/Admin", () => {
  it("refuse à un superviseur d'accéder à la facturation (absent de sa liste de permissions)", async () => {
    const { accessToken } = await loginAs(Role.SUPERVISOR, "sup-invoice1@deepclean.test");
    const res = await request(app).get("/api/v1/invoices").set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(403);
  });

  it("refuse à un employé d'accéder à la facturation", async () => {
    const { accessToken } = await loginAs(Role.EMPLOYEE, "emp-invoice1@deepclean.test");
    const res = await request(app).get("/api/v1/invoices").set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(403);
  });

  it("permet à la RH de créer une facture directement pour un client", async () => {
    const { accessToken } = await loginAs(Role.HR, "hr-invoice1@deepclean.test");
    const client = await createTestClient(accessToken);

    const res = await request(app)
      .post("/api/v1/invoices")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ clientId: client.id, items: [{ description: "Prestation", quantity: 1, unit: "FLAT_RATE", unitPriceHt: 100, totalHt: 999999 }] });

    expect(res.status).toBe(201);
    expect(res.body.invoice.invoiceNumber).toMatch(/^FAC-\d{4}-0001$/);
    // Le total envoyé (999999) est ignoré, recalculé côté serveur (§13, même
    // principe que les devis).
    expect(res.body.invoice.items[0].totalHt).toBe(100);
    expect(res.body.invoice.subtotalHt).toBe(100);
    expect(res.body.invoice.vatAmount).toBe(20);
    expect(res.body.invoice.totalTtc).toBe(120);
  });
});

describe("Facturation — référence devis/chantier, jamais d'effet sur le planning", () => {
  async function createAcceptedQuote(token: string, clientId: string) {
    const created = await request(app)
      .post("/api/v1/quotes")
      .set("Authorization", `Bearer ${token}`)
      .send({ clientId, items: [{ description: "Nettoyage bureaux", quantity: 1, unit: "INTERVENTION", unitPriceHt: 150 }] });
    await request(app).post(`/api/v1/quotes/${created.body.quote.id}/validate`).set("Authorization", `Bearer ${token}`);
    await request(app).post(`/api/v1/quotes/${created.body.quote.id}/send`).set("Authorization", `Bearer ${token}`).send({});
    await request(app).post(`/api/v1/quotes/${created.body.quote.id}/accept`).set("Authorization", `Bearer ${token}`).send({ method: "PHONE" });
    return created.body.quote.id as string;
  }

  it("crée une facture référençant le devis accepté et reprend ses coordonnées", async () => {
    const { accessToken } = await loginAs(Role.HR, "hr-invoice2@deepclean.test");
    const client = await createTestClient(accessToken, { email: "invoice-quote@abc.test" });
    const quoteId = await createAcceptedQuote(accessToken, client.id);

    const res = await request(app)
      .post("/api/v1/invoices")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ clientId: client.id, quoteId, items: [{ description: "Nettoyage bureaux", quantity: 1, unit: "INTERVENTION", unitPriceHt: 150 }] });

    expect(res.status).toBe(201);
    expect(res.body.invoice.quoteId).toBe(quoteId);
    expect(res.body.invoice.contactEmail).toBe("invoice-quote@abc.test");
  });

  it("refuse de facturer deux fois le même mois pour le même devis, sauf si la première facture est annulée", async () => {
    const { accessToken } = await loginAs(Role.HR, "hr-invoice-dup@deepclean.test");
    const client = await createTestClient(accessToken, { email: "dup@abc.test" });
    const quoteId = await createAcceptedQuote(accessToken, client.id);
    const body = { clientId: client.id, quoteId, billingMode: "FLAT_RATE", period: "2026-10", items: [{ description: "Forfait", quantity: 1, unit: "INTERVENTION", unitPriceHt: 990 }] };

    const first = await request(app).post("/api/v1/invoices").set("Authorization", `Bearer ${accessToken}`).send(body);
    expect(first.status).toBe(201);

    const second = await request(app).post("/api/v1/invoices").set("Authorization", `Bearer ${accessToken}`).send(body);
    expect(second.status).toBe(409);
    expect(second.body.error.message).toContain("Octobre 2026 est déjà facturé");

    const otherMonth = await request(app).post("/api/v1/invoices").set("Authorization", `Bearer ${accessToken}`).send({ ...body, period: "2026-11" });
    expect(otherMonth.status).toBe(201);

    await request(app).post(`/api/v1/invoices/${first.body.invoice.id}/cancel`).set("Authorization", `Bearer ${accessToken}`).send({ comment: "Erreur" });
    const redo = await request(app).post("/api/v1/invoices").set("Authorization", `Bearer ${accessToken}`).send(body);
    expect(redo.status).toBe(201);
  });

  it("refuse de référencer un devis non accepté", async () => {
    const { accessToken } = await loginAs(Role.HR, "hr-invoice3@deepclean.test");
    const client = await createTestClient(accessToken);
    const quote = await request(app)
      .post("/api/v1/quotes")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ clientId: client.id, items: [{ description: "Prestation", quantity: 1, unit: "FLAT_RATE", unitPriceHt: 100 }] });

    const res = await request(app)
      .post("/api/v1/invoices")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ clientId: client.id, quoteId: quote.body.quote.id, items: [{ description: "Prestation", quantity: 1, unit: "FLAT_RATE", unitPriceHt: 100 }] });

    expect(res.status).toBe(400);
  });

  it("ne crée, ne modifie ni ne supprime aucune mission lors de la facturation", async () => {
    const { accessToken } = await loginAs(Role.HR, "hr-invoice4@deepclean.test");
    const client = await createTestClient(accessToken);
    const site = await request(app)
      .post("/api/v1/sites")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Chantier facturé", address: "1 rue Test", clientId: client.id });

    const before = await prisma.mission.count();
    await request(app)
      .post("/api/v1/invoices")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ clientId: client.id, siteId: site.body.site.id, items: [{ description: "Prestation", quantity: 1, unit: "FLAT_RATE", unitPriceHt: 100 }] });
    const after = await prisma.mission.count();

    expect(after).toBe(before);
  });
});

describe("Facturation — cycle de statuts", () => {
  async function createDraftInvoice(token: string, clientId: string) {
    const res = await request(app)
      .post("/api/v1/invoices")
      .set("Authorization", `Bearer ${token}`)
      .send({ clientId, items: [{ description: "Prestation", quantity: 1, unit: "FLAT_RATE", unitPriceHt: 100 }] });
    return res.body.invoice as { id: string };
  }

  it("refuse d'envoyer une facture non validée", async () => {
    const { accessToken } = await loginAs(Role.HR, "hr-invoice5@deepclean.test");
    const client = await createTestClient(accessToken);
    const invoice = await createDraftInvoice(accessToken, client.id);

    const sent = await request(app).post(`/api/v1/invoices/${invoice.id}/send`).set("Authorization", `Bearer ${accessToken}`).send({});
    expect(sent.status).toBe(409);
  });

  it("valide, envoie puis marque une facture comme payée", async () => {
    const { accessToken } = await loginAs(Role.DIRECTOR, "dir-invoice1@deepclean.test");
    const client = await createTestClient(accessToken, { email: "invoice-flow@abc.test" });
    const invoice = await createDraftInvoice(accessToken, client.id);

    const validated = await request(app).post(`/api/v1/invoices/${invoice.id}/validate`).set("Authorization", `Bearer ${accessToken}`);
    expect(validated.body.invoice.status).toBe("VALIDATED");

    const sent = await request(app).post(`/api/v1/invoices/${invoice.id}/send`).set("Authorization", `Bearer ${accessToken}`).send({});
    expect(sent.status).toBe(200);
    expect(sent.body.invoice.status).toBe("SENT");

    const paid = await request(app).post(`/api/v1/invoices/${invoice.id}/pay`).set("Authorization", `Bearer ${accessToken}`);
    expect(paid.status).toBe(200);
    expect(paid.body.invoice.status).toBe("PAID");
    expect(paid.body.invoice.paidAt).toBeTruthy();
  });

  it("refuse de modifier une facture déjà validée", async () => {
    const { accessToken } = await loginAs(Role.HR, "hr-invoice6@deepclean.test");
    const client = await createTestClient(accessToken);
    const invoice = await createDraftInvoice(accessToken, client.id);
    await request(app).post(`/api/v1/invoices/${invoice.id}/validate`).set("Authorization", `Bearer ${accessToken}`);

    const update = await request(app)
      .patch(`/api/v1/invoices/${invoice.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ paymentTerms: "Nouveau" });
    expect(update.status).toBe(409);
  });

  it("annule une facture non payée", async () => {
    const { accessToken } = await loginAs(Role.HR, "hr-invoice7@deepclean.test");
    const client = await createTestClient(accessToken);
    const invoice = await createDraftInvoice(accessToken, client.id);

    const cancelled = await request(app)
      .post(`/api/v1/invoices/${invoice.id}/cancel`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ comment: "Erreur de saisie" });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.invoice.status).toBe("CANCELLED");
  });

  it("refuse d'annuler une facture déjà payée", async () => {
    const { accessToken } = await loginAs(Role.HR, "hr-invoice8@deepclean.test");
    const client = await createTestClient(accessToken, { email: "invoice-paid@abc.test" });
    const invoice = await createDraftInvoice(accessToken, client.id);
    await request(app).post(`/api/v1/invoices/${invoice.id}/validate`).set("Authorization", `Bearer ${accessToken}`);
    await request(app).post(`/api/v1/invoices/${invoice.id}/send`).set("Authorization", `Bearer ${accessToken}`).send({});
    await request(app).post(`/api/v1/invoices/${invoice.id}/pay`).set("Authorization", `Bearer ${accessToken}`);

    const cancelled = await request(app).post(`/api/v1/invoices/${invoice.id}/cancel`).set("Authorization", `Bearer ${accessToken}`).send({});
    expect(cancelled.status).toBe(409);
  });
});

describe("Facturation — PDF", () => {
  it("génère un PDF sans exposer les notes internes", async () => {
    const { accessToken } = await loginAs(Role.HR, "hr-invoice-pdf@deepclean.test");
    const client = await createTestClient(accessToken);
    const created = await request(app)
      .post("/api/v1/invoices")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        clientId: client.id,
        internalNotes: "MENTION-INTERNE-FACTURE-SECRETE",
        items: [{ description: "Prestation", quantity: 1, unit: "FLAT_RATE", unitPriceHt: 100 }],
      });

    const pdf = await request(app).get(`/api/v1/invoices/${created.body.invoice.id}/pdf`).set("Authorization", `Bearer ${accessToken}`);
    expect(pdf.status).toBe(200);
    expect(pdf.headers["content-type"]).toBe("application/pdf");
    expect(pdf.body.toString("latin1")).not.toContain("MENTION-INTERNE-FACTURE-SECRETE");
  });
});
