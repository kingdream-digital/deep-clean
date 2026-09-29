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

describe("Tableau de bord commercial — accès", () => {
  it("refuse à un employé d'accéder au tableau de bord commercial", async () => {
    const { accessToken } = await loginAs(Role.EMPLOYEE, "emp-dash@deepclean.test");
    const res = await request(app).get("/api/v1/commercial-dashboard").set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(403);
  });

  it("inclut la facturation pour la RH mais pas pour un superviseur (absent de sa liste de permissions)", async () => {
    const { accessToken: hrToken } = await loginAs(Role.HR, "hr-dash1@deepclean.test");
    const { accessToken: supToken } = await loginAs(Role.SUPERVISOR, "sup-dash1@deepclean.test");

    const hrRes = await request(app).get("/api/v1/commercial-dashboard").set("Authorization", `Bearer ${hrToken}`);
    expect(hrRes.status).toBe(200);
    expect(hrRes.body.dashboard.invoicing).not.toBeNull();

    const supRes = await request(app).get("/api/v1/commercial-dashboard").set("Authorization", `Bearer ${supToken}`);
    expect(supRes.status).toBe(200);
    expect(supRes.body.dashboard.invoicing).toBeNull();
  });
});

describe("Tableau de bord commercial — un superviseur ne voit que son périmètre", () => {
  it("compte séparément les prospects/devis de deux superviseurs différents", async () => {
    const supervisorA = await createTestUser({ role: Role.SUPERVISOR, email: "sup-dash2@deepclean.test" });
    const supervisorB = await createTestUser({ role: Role.SUPERVISOR, email: "sup-dash3@deepclean.test" });
    const loginA = await request(app).post("/api/v1/auth/login").send({ username: supervisorA.username, password: TEST_PASSWORD });
    const loginB = await request(app).post("/api/v1/auth/login").send({ username: supervisorB.username, password: TEST_PASSWORD });
    const tokenA = loginA.body.accessToken as string;
    const tokenB = loginB.body.accessToken as string;

    await request(app).post("/api/v1/prospects").set("Authorization", `Bearer ${tokenA}`).send({ companyName: "Prospect de A" });

    const dashA = await request(app).get("/api/v1/commercial-dashboard").set("Authorization", `Bearer ${tokenA}`);
    const dashB = await request(app).get("/api/v1/commercial-dashboard").set("Authorization", `Bearer ${tokenB}`);

    expect(dashA.body.dashboard.commercial.activeProspects).toBe(1);
    expect(dashB.body.dashboard.commercial.activeProspects).toBe(0);
  });

  it("ne compte que les chantiers dont il est le superviseur fixe", async () => {
    const supervisorA = await createTestUser({ role: Role.SUPERVISOR, email: "sup-dash4@deepclean.test" });
    const supervisorB = await createTestUser({ role: Role.SUPERVISOR, email: "sup-dash5@deepclean.test" });
    const loginA = await request(app).post("/api/v1/auth/login").send({ username: supervisorA.username, password: TEST_PASSWORD });
    const tokenA = loginA.body.accessToken as string;

    await request(app)
      .post("/api/v1/sites")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ name: "Chantier de A", address: "1 rue Test", supervisorId: supervisorA.id });
    await request(app)
      .post("/api/v1/sites")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ name: "Chantier de B", address: "2 rue Test", supervisorId: supervisorB.id });

    const dashA = await request(app).get("/api/v1/commercial-dashboard").set("Authorization", `Bearer ${tokenA}`);
    expect(dashA.body.dashboard.sites.activeSites).toBe(1);
  });
});

describe("Tableau de bord commercial — suivi des chantiers, purement informatif", () => {
  it("remonte un chantier dans 'à surveiller' quand des prestations restent à programmer", async () => {
    const { accessToken } = await loginAs(Role.HR, "hr-dash2@deepclean.test");
    const site = await request(app)
      .post("/api/v1/sites")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Chantier à surveiller", address: "1 rue Test" });

    const now = new Date();
    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    await request(app)
      .post(`/api/v1/sites/${site.body.site.id}/targets`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ period, plannedVisits: 5 });

    const dashboard = await request(app).get("/api/v1/commercial-dashboard").set("Authorization", `Bearer ${accessToken}`);
    expect(dashboard.body.dashboard.sites.remainingVisits).toBe(5);
    expect(dashboard.body.dashboard.sites.sitesNeedingAttention).toHaveLength(1);
    expect(dashboard.body.dashboard.sites.sitesNeedingAttention[0].siteId).toBe(site.body.site.id);
  });
});
