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

describe("Devis — accès au module commercial", () => {
  it("refuse à un employé d'accéder aux devis", async () => {
    const { accessToken } = await loginAs(Role.EMPLOYEE, "emp-quote@deepclean.test");
    const res = await request(app).get("/api/v1/quotes").set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(403);
  });
});

describe("Devis — numérotation et calculs serveur", () => {
  it("génère un numéro DEV-AAAA-NNNN et recalcule les montants malgré des totaux envoyés falsifiés", async () => {
    const { accessToken } = await loginAs(Role.HR, "hr-quote1@deepclean.test");
    const client = await createTestClient(accessToken);

    const res = await request(app)
      .post("/api/v1/quotes")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        clientId: client.id,
        vatRate: 20,
        items: [
          {
            description: "Nettoyage bureaux",
            quantity: 1,
            unit: "INTERVENTION",
            unitPriceHt: 150,
            frequency: "MULTIPLE_PER_MONTH",
            occurrencesPerMonth: 6,
            // Tentative de falsification : le serveur doit ignorer un total
            // envoyé et le recalculer lui-même (cahier des charges §13).
            totalHt: 999999,
          },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.quote.quoteNumber).toMatch(/^DEV-\d{4}-0001$/);
    expect(res.body.quote.items[0].totalHt).toBe(150);
    // 6 passages/mois * 150€ = 900€ prévisionnel mensuel (exemple exact du
    // cahier des charges §11).
    expect(res.body.quote.items[0].monthlyAmountHt).toBe(900);
    expect(res.body.quote.monthlyAmountHt).toBe(900);
    expect(res.body.quote.subtotalHt).toBe(150);
    expect(res.body.quote.vatAmount).toBe(30);
    expect(res.body.quote.totalTtc).toBe(180);
  });

  it("incrémente le numéro de devis pour chaque nouveau devis", async () => {
    const { accessToken } = await loginAs(Role.HR, "hr-quote2@deepclean.test");
    const client = await createTestClient(accessToken);
    const payload = { clientId: client.id, items: [{ description: "Prestation", quantity: 1, unit: "FLAT_RATE", unitPriceHt: 100 }] };

    const first = await request(app).post("/api/v1/quotes").set("Authorization", `Bearer ${accessToken}`).send(payload);
    const second = await request(app).post("/api/v1/quotes").set("Authorization", `Bearer ${accessToken}`).send(payload);

    expect(first.body.quote.quoteNumber).not.toBe(second.body.quote.quoteNumber);
  });

  it("applique une remise globale avant le calcul de la TVA", async () => {
    const { accessToken } = await loginAs(Role.HR, "hr-quote3@deepclean.test");
    const client = await createTestClient(accessToken);

    const res = await request(app)
      .post("/api/v1/quotes")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        clientId: client.id,
        discount: 20,
        vatRate: 10,
        items: [{ description: "Prestation", quantity: 1, unit: "FLAT_RATE", unitPriceHt: 100 }],
      });

    expect(res.body.quote.subtotalHt).toBe(100);
    expect(res.body.quote.vatAmount).toBe(8); // (100 - 20) * 10%
    expect(res.body.quote.totalTtc).toBe(88);
  });

  it("reprend automatiquement les coordonnées du client sur le devis", async () => {
    const { accessToken } = await loginAs(Role.HR, "hr-quote4@deepclean.test");
    const client = await createTestClient(accessToken, { email: "prefill@abc.test", phone: "0600000000" });

    const res = await request(app)
      .post("/api/v1/quotes")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ clientId: client.id, items: [{ description: "Prestation", quantity: 1, unit: "FLAT_RATE", unitPriceHt: 50 }] });

    expect(res.body.quote.contactEmail).toBe("prefill@abc.test");
    expect(res.body.quote.contactPhone).toBe("0600000000");
  });
});

describe("Devis — portée Superviseur", () => {
  it("cache à un superviseur les devis assignés à un autre superviseur", async () => {
    const supervisorA = await createTestUser({ role: Role.SUPERVISOR, email: "sup-quote1@deepclean.test" });
    const supervisorB = await createTestUser({ role: Role.SUPERVISOR, email: "sup-quote2@deepclean.test" });
    const loginA = await request(app).post("/api/v1/auth/login").send({ username: supervisorA.username, password: TEST_PASSWORD });
    const loginB = await request(app).post("/api/v1/auth/login").send({ username: supervisorB.username, password: TEST_PASSWORD });
    const tokenA = loginA.body.accessToken as string;
    const tokenB = loginB.body.accessToken as string;
    const client = await createTestClient(tokenA);

    const created = await request(app)
      .post("/api/v1/quotes")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ clientId: client.id, items: [{ description: "Prestation", quantity: 1, unit: "FLAT_RATE", unitPriceHt: 50 }] });

    const getB = await request(app).get(`/api/v1/quotes/${created.body.quote.id}`).set("Authorization", `Bearer ${tokenB}`);
    expect(getB.status).toBe(404);
  });
});

describe("Devis — cycle de statuts", () => {
  async function createDraftQuote(token: string, clientId: string) {
    const res = await request(app)
      .post("/api/v1/quotes")
      .set("Authorization", `Bearer ${token}`)
      .send({ clientId, items: [{ description: "Prestation", quantity: 1, unit: "FLAT_RATE", unitPriceHt: 100 }] });
    return res.body.quote as { id: string; status: string };
  }

  it("refuse à un superviseur de valider un devis (réservé à RH/Direction/Admin)", async () => {
    const supervisor = await createTestUser({ role: Role.SUPERVISOR, email: "sup-quote3@deepclean.test" });
    const login = await request(app).post("/api/v1/auth/login").send({ username: supervisor.username, password: TEST_PASSWORD });
    const token = login.body.accessToken as string;
    const client = await createTestClient(token);
    const quote = await createDraftQuote(token, client.id);

    const validated = await request(app).post(`/api/v1/quotes/${quote.id}/validate`).set("Authorization", `Bearer ${token}`);
    expect(validated.status).toBe(403);
  });

  it("permet à la RH de valider, puis au superviseur d'envoyer le devis", async () => {
    const supervisor = await createTestUser({ role: Role.SUPERVISOR, email: "sup-quote4@deepclean.test" });
    const hr = await createTestUser({ role: Role.HR, email: "hr-quote5@deepclean.test" });
    const loginSup = await request(app).post("/api/v1/auth/login").send({ username: supervisor.username, password: TEST_PASSWORD });
    const loginHr = await request(app).post("/api/v1/auth/login").send({ username: hr.username, password: TEST_PASSWORD });
    const supToken = loginSup.body.accessToken as string;
    const hrToken = loginHr.body.accessToken as string;

    const client = await createTestClient(hrToken, { email: "client@quote-flow.test" });
    const quote = await createDraftQuote(supToken, client.id);

    const validated = await request(app).post(`/api/v1/quotes/${quote.id}/validate`).set("Authorization", `Bearer ${hrToken}`);
    expect(validated.status).toBe(200);
    expect(validated.body.quote.status).toBe("VALIDATED");

    const sent = await request(app).post(`/api/v1/quotes/${quote.id}/send`).set("Authorization", `Bearer ${supToken}`).send({});
    expect(sent.status).toBe(200);
    expect(sent.body.quote.status).toBe("SENT");

    const events = await request(app).get(`/api/v1/quotes/${quote.id}/events`).set("Authorization", `Bearer ${supToken}`);
    expect(events.body.items.some((e: { action: string }) => e.action === "SENT")).toBe(true);
  });

  it("refuse d'envoyer un devis qui n'a pas été validé", async () => {
    const { accessToken } = await loginAs(Role.HR, "hr-quote6@deepclean.test");
    const client = await createTestClient(accessToken);
    const quote = await createDraftQuote(accessToken, client.id);

    const sent = await request(app).post(`/api/v1/quotes/${quote.id}/send`).set("Authorization", `Bearer ${accessToken}`).send({});
    expect(sent.status).toBe(409);
  });

  it("refuse de modifier un devis déjà validé (verrouillage)", async () => {
    const { accessToken } = await loginAs(Role.HR, "hr-quote7@deepclean.test");
    const client = await createTestClient(accessToken);
    const quote = await createDraftQuote(accessToken, client.id);
    await request(app).post(`/api/v1/quotes/${quote.id}/validate`).set("Authorization", `Bearer ${accessToken}`);

    const update = await request(app)
      .patch(`/api/v1/quotes/${quote.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ subject: "Nouveau sujet" });
    expect(update.status).toBe(409);
  });

  it("marque un devis envoyé comme accepté et journalise la méthode de confirmation", async () => {
    const { accessToken } = await loginAs(Role.HR, "hr-quote8@deepclean.test");
    const client = await createTestClient(accessToken, { email: "accept@quote.test" });
    const quote = await createDraftQuote(accessToken, client.id);
    await request(app).post(`/api/v1/quotes/${quote.id}/validate`).set("Authorization", `Bearer ${accessToken}`);
    await request(app).post(`/api/v1/quotes/${quote.id}/send`).set("Authorization", `Bearer ${accessToken}`).send({});

    const accepted = await request(app)
      .post(`/api/v1/quotes/${quote.id}/accept`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ method: "PHONE", comment: "Client confirmé par téléphone" });

    expect(accepted.status).toBe(200);
    expect(accepted.body.quote.status).toBe("ACCEPTED");
    expect(accepted.body.quote.acceptedMethod).toBe("PHONE");
    expect(accepted.body.quote.acceptedById).toBeTruthy();
  });

  it("refuse de marquer comme accepté un devis encore en brouillon", async () => {
    const { accessToken } = await loginAs(Role.HR, "hr-quote9@deepclean.test");
    const client = await createTestClient(accessToken);
    const quote = await createDraftQuote(accessToken, client.id);

    const accepted = await request(app)
      .post(`/api/v1/quotes/${quote.id}/accept`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ method: "EMAIL" });
    expect(accepted.status).toBe(409);
  });

  it("enregistre une relance et fait passer le statut à 'relance en cours'", async () => {
    const { accessToken } = await loginAs(Role.HR, "hr-quote10@deepclean.test");
    const client = await createTestClient(accessToken, { email: "followup@quote.test" });
    const quote = await createDraftQuote(accessToken, client.id);
    await request(app).post(`/api/v1/quotes/${quote.id}/validate`).set("Authorization", `Bearer ${accessToken}`);
    await request(app).post(`/api/v1/quotes/${quote.id}/send`).set("Authorization", `Bearer ${accessToken}`).send({});

    const followUp = await request(app)
      .post(`/api/v1/quotes/${quote.id}/follow-up`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ method: "PHONE", comment: "Rappel prévu la semaine prochaine" });

    expect(followUp.status).toBe(200);
    expect(followUp.body.quote.status).toBe("FOLLOW_UP");
  });

  it("crée une nouvelle version d'un devis verrouillé plutôt que de le modifier", async () => {
    const { accessToken } = await loginAs(Role.HR, "hr-quote11@deepclean.test");
    const client = await createTestClient(accessToken);
    const quote = await createDraftQuote(accessToken, client.id);
    await request(app).post(`/api/v1/quotes/${quote.id}/validate`).set("Authorization", `Bearer ${accessToken}`);

    const version = await request(app).post(`/api/v1/quotes/${quote.id}/versions`).set("Authorization", `Bearer ${accessToken}`);
    expect(version.status).toBe(201);
    expect(version.body.quote.status).toBe("DRAFT");
    expect(version.body.quote.previousVersionId).toBe(quote.id);
    expect(version.body.quote.quoteNumber).not.toBe((quote as unknown as { quoteNumber: string }).quoteNumber);
  });
});

describe("Devis — PDF", () => {
  it("génère un PDF sans exposer les notes internes", async () => {
    const { accessToken } = await loginAs(Role.HR, "hr-quote-pdf@deepclean.test");
    const client = await createTestClient(accessToken);
    const created = await request(app)
      .post("/api/v1/quotes")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        clientId: client.id,
        internalNotes: "MENTION-INTERNE-SECRETE",
        items: [{ description: "Prestation", quantity: 1, unit: "FLAT_RATE", unitPriceHt: 100 }],
      });

    const pdf = await request(app).get(`/api/v1/quotes/${created.body.quote.id}/pdf`).set("Authorization", `Bearer ${accessToken}`);
    expect(pdf.status).toBe(200);
    expect(pdf.headers["content-type"]).toBe("application/pdf");
    expect(pdf.body.toString("latin1")).not.toContain("MENTION-INTERNE-SECRETE");
  });
});
