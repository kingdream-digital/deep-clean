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

async function createAcceptedQuote(token: string) {
  const client = await request(app)
    .post("/api/v1/clients")
    .set("Authorization", `Bearer ${token}`)
    .send({ companyName: "Entreprise ABC", email: "contact@abc.test" });

  const created = await request(app)
    .post("/api/v1/quotes")
    .set("Authorization", `Bearer ${token}`)
    .send({
      clientId: client.body.client.id,
      items: [
        { description: "Nettoyage bureaux", quantity: 1, unit: "INTERVENTION", unitPriceHt: 150, frequency: "MULTIPLE_PER_MONTH", occurrencesPerMonth: 6 },
      ],
    });
  await request(app).post(`/api/v1/quotes/${created.body.quote.id}/validate`).set("Authorization", `Bearer ${token}`);
  await request(app).post(`/api/v1/quotes/${created.body.quote.id}/send`).set("Authorization", `Bearer ${token}`).send({});
  await request(app)
    .post(`/api/v1/quotes/${created.body.quote.id}/accept`)
    .set("Authorization", `Bearer ${token}`)
    .send({ method: "PHONE" });

  return { clientId: client.body.client.id as string, quoteId: created.body.quote.id as string };
}

describe("Chantiers — création à partir d'un devis accepté (action humaine)", () => {
  it("crée un chantier lié au devis et au client, sans créer aucune mission", async () => {
    const { accessToken } = await loginAs(Role.HR, "hr-site-quote1@deepclean.test");
    const { clientId, quoteId } = await createAcceptedQuote(accessToken);

    const res = await request(app)
      .post("/api/v1/sites")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Entreprise ABC — Nettoyage bureaux", address: "12 rue Exemple", clientId, quoteId });

    expect(res.status).toBe(201);
    expect(res.body.site.clientId).toBe(clientId);
    expect(res.body.site.quoteId).toBe(quoteId);

    const missions = await prisma.mission.count({ where: { siteId: res.body.site.id } });
    expect(missions).toBe(0);
  });

  it("refuse de créer un chantier à partir d'un devis non accepté", async () => {
    const { accessToken } = await loginAs(Role.HR, "hr-site-quote2@deepclean.test");
    const client = await request(app)
      .post("/api/v1/clients")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ companyName: "Entreprise Brouillon" });
    const quote = await request(app)
      .post("/api/v1/quotes")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ clientId: client.body.client.id, items: [{ description: "Prestation", quantity: 1, unit: "FLAT_RATE", unitPriceHt: 100 }] });

    const res = await request(app)
      .post("/api/v1/sites")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Chantier", address: "1 rue Test", clientId: client.body.client.id, quoteId: quote.body.quote.id });

    expect(res.status).toBe(400);
  });

  it("refuse de créer un second chantier à partir du même devis", async () => {
    const { accessToken } = await loginAs(Role.HR, "hr-site-quote3@deepclean.test");
    const { clientId, quoteId } = await createAcceptedQuote(accessToken);

    await request(app)
      .post("/api/v1/sites")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Chantier 1", address: "1 rue Test", clientId, quoteId });

    const second = await request(app)
      .post("/api/v1/sites")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Chantier 2", address: "2 rue Test", clientId, quoteId });

    expect(second.status).toBe(409);
  });
});

describe("Chantiers — objectifs et suivi mensuel (jamais d'automatisation vers le planning)", () => {
  it("permet à la RH de définir un objectif mensuel puis affiche le suivi calculé depuis les missions réelles", async () => {
    const { accessToken } = await loginAs(Role.HR, "hr-site-target1@deepclean.test");
    const site = await request(app)
      .post("/api/v1/sites")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Chantier suivi", address: "1 rue Test" });
    const siteId = site.body.site.id as string;

    const target = await request(app)
      .post(`/api/v1/sites/${siteId}/targets`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ period: "2026-10", plannedVisits: 5, plannedAmount: 900, billingMode: "FLAT_RATE" });
    expect(target.status).toBe(200);
    expect(target.body.target.plannedVisits).toBe(5);

    const progress = await request(app)
      .get(`/api/v1/sites/${siteId}/progress`)
      .query({ period: "2026-10" })
      .set("Authorization", `Bearer ${accessToken}`);

    expect(progress.status).toBe(200);
    expect(progress.body.progress.target.plannedVisits).toBe(5);
    // Aucune mission créée sur ce chantier ce mois-ci : 0 réalisée, 5 restantes.
    expect(progress.body.progress.completedVisits).toBe(0);
    expect(progress.body.progress.remainingVisits).toBe(5);
  });

  it("refuse à un employé de définir un objectif de chantier", async () => {
    const { accessToken: hrToken } = await loginAs(Role.HR, "hr-site-target2@deepclean.test");
    const { accessToken: empToken } = await loginAs(Role.EMPLOYEE, "emp-site-target2@deepclean.test");
    const site = await request(app)
      .post("/api/v1/sites")
      .set("Authorization", `Bearer ${hrToken}`)
      .send({ name: "Chantier protégé", address: "1 rue Test" });

    const res = await request(app)
      .post(`/api/v1/sites/${site.body.site.id}/targets`)
      .set("Authorization", `Bearer ${empToken}`)
      .send({ period: "2026-10", plannedVisits: 5 });
    expect(res.status).toBe(403);
  });

  it("ne compte pas les missions annulées dans les prestations réalisées ou restantes", async () => {
    const { accessToken } = await loginAs(Role.SUPERVISOR, "sup-site-target3@deepclean.test");
    const employee = await createTestUser({ role: Role.EMPLOYEE, email: "emp-site-target3@deepclean.test" });
    const site = await request(app)
      .post("/api/v1/sites")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Chantier avec missions", address: "1 rue Test" });
    const siteId = site.body.site.id as string;

    await request(app)
      .post(`/api/v1/sites/${siteId}/targets`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ period: "2026-10", plannedVisits: 3 });

    const mission1 = await request(app)
      .post("/api/v1/missions")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        siteId,
        title: "Nettoyage",
        date: "2026-10-05",
        startTime: "08:00",
        endTime: "10:00",
        assigneeIds: [employee.id],
      });
    expect(mission1.status).toBe(201);

    const mission2 = await request(app)
      .post("/api/v1/missions")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        siteId,
        title: "Nettoyage annulé",
        date: "2026-10-06",
        startTime: "08:00",
        endTime: "10:00",
        assigneeIds: [employee.id],
      });
    expect(mission2.status).toBe(201);
    await request(app).post(`/api/v1/missions/${mission2.body.mission.id}/cancel`).set("Authorization", `Bearer ${accessToken}`).send({});

    const progress = await request(app)
      .get(`/api/v1/sites/${siteId}/progress`)
      .query({ period: "2026-10" })
      .set("Authorization", `Bearer ${accessToken}`);

    expect(progress.body.progress.scheduledVisits).toBe(1);
    expect(progress.body.progress.cancelledVisits).toBe(1);
    expect(progress.body.progress.remainingVisits).toBe(3);
  });
});
