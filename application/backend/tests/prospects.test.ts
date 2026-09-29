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

describe("Prospects — accès au module commercial", () => {
  it("refuse à un employé d'accéder aux prospects", async () => {
    const { accessToken } = await loginAs(Role.EMPLOYEE, "emp-prospect@deepclean.test");
    const res = await request(app).get("/api/v1/prospects").set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(403);
  });

  it("refuse à un chef d'équipe d'accéder aux prospects", async () => {
    const { accessToken } = await loginAs(Role.SITE_MANAGER, "sm-prospect@deepclean.test");
    const res = await request(app).get("/api/v1/prospects").set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(403);
  });

  it("permet à la RH de créer et consulter un prospect", async () => {
    const { accessToken } = await loginAs(Role.HR, "hr-prospect1@deepclean.test");
    const created = await request(app)
      .post("/api/v1/prospects")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ companyName: "Entreprise ABC", contactLastName: "Martin", email: "contact@abc.test" });

    expect(created.status).toBe(201);
    expect(created.body.prospect.status).toBe("NEW");
    expect(created.body.prospect.companyName).toBe("Entreprise ABC");

    const fetched = await request(app)
      .get(`/api/v1/prospects/${created.body.prospect.id}`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(fetched.status).toBe(200);
  });
});

describe("Prospects — un superviseur ne voit et ne gère que les siens", () => {
  it("assigne automatiquement un prospect créé par un superviseur à lui-même, quoi qu'il envoie", async () => {
    const supervisor = await createTestUser({ role: Role.SUPERVISOR, email: "sup-prospect1@deepclean.test" });
    const otherSupervisor = await createTestUser({ role: Role.SUPERVISOR, email: "sup-prospect2@deepclean.test" });
    const login = await request(app).post("/api/v1/auth/login").send({ username: supervisor.username, password: TEST_PASSWORD });
    const token = login.body.accessToken as string;

    const created = await request(app)
      .post("/api/v1/prospects")
      .set("Authorization", `Bearer ${token}`)
      .send({ companyName: "Entreprise XYZ", assignedUserId: otherSupervisor.id });

    expect(created.status).toBe(201);
    expect(created.body.prospect.assignedUserId).toBe(supervisor.id);
  });

  it("cache à un superviseur les prospects assignés à un autre superviseur", async () => {
    const supervisorA = await createTestUser({ role: Role.SUPERVISOR, email: "sup-prospect3@deepclean.test" });
    const supervisorB = await createTestUser({ role: Role.SUPERVISOR, email: "sup-prospect4@deepclean.test" });
    const loginA = await request(app).post("/api/v1/auth/login").send({ username: supervisorA.username, password: TEST_PASSWORD });
    const loginB = await request(app).post("/api/v1/auth/login").send({ username: supervisorB.username, password: TEST_PASSWORD });
    const tokenA = loginA.body.accessToken as string;
    const tokenB = loginB.body.accessToken as string;

    const created = await request(app)
      .post("/api/v1/prospects")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ companyName: "Entreprise privée à A" });

    const listB = await request(app).get("/api/v1/prospects").set("Authorization", `Bearer ${tokenB}`);
    expect(listB.body.items.some((p: { id: string }) => p.id === created.body.prospect.id)).toBe(false);

    const getB = await request(app)
      .get(`/api/v1/prospects/${created.body.prospect.id}`)
      .set("Authorization", `Bearer ${tokenB}`);
    expect(getB.status).toBe(404);
  });

  it("permet à la RH de voir et réassigner n'importe quel prospect", async () => {
    const supervisorA = await createTestUser({ role: Role.SUPERVISOR, email: "sup-prospect5@deepclean.test" });
    const supervisorB = await createTestUser({ role: Role.SUPERVISOR, email: "sup-prospect6@deepclean.test" });
    const hr = await createTestUser({ role: Role.HR, email: "hr-prospect2@deepclean.test" });
    const loginA = await request(app).post("/api/v1/auth/login").send({ username: supervisorA.username, password: TEST_PASSWORD });
    const loginHr = await request(app).post("/api/v1/auth/login").send({ username: hr.username, password: TEST_PASSWORD });
    const tokenA = loginA.body.accessToken as string;
    const hrToken = loginHr.body.accessToken as string;

    const created = await request(app)
      .post("/api/v1/prospects")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ companyName: "Entreprise à réassigner" });

    const reassigned = await request(app)
      .patch(`/api/v1/prospects/${created.body.prospect.id}`)
      .set("Authorization", `Bearer ${hrToken}`)
      .send({ assignedUserId: supervisorB.id });

    expect(reassigned.status).toBe(200);
    expect(reassigned.body.prospect.assignedUserId).toBe(supervisorB.id);
  });
});

describe("Prospects — transformation en client", () => {
  it("transforme un prospect en client en reprenant ses coordonnées, sans les ressaisir", async () => {
    const { accessToken } = await loginAs(Role.HR, "hr-prospect3@deepclean.test");
    const created = await request(app)
      .post("/api/v1/prospects")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        companyName: "Entreprise à convertir",
        contactFirstName: "Julie",
        contactLastName: "Dupont",
        email: "julie@convertir.test",
        phone: "0600000000",
        address: "10 rue Exemple",
        siret: "12345678900012",
      });

    const converted = await request(app)
      .post(`/api/v1/prospects/${created.body.prospect.id}/convert`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(converted.status).toBe(201);
    expect(converted.body.client.companyName).toBe("Entreprise à convertir");
    expect(converted.body.client.contactFirstName).toBe("Julie");
    expect(converted.body.client.billingAddress).toBe("10 rue Exemple");
    expect(converted.body.client.siret).toBe("12345678900012");
    expect(converted.body.client.prospectId).toBe(created.body.prospect.id);

    const prospectAfter = await request(app)
      .get(`/api/v1/prospects/${created.body.prospect.id}`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(prospectAfter.body.prospect.status).toBe("WON");
    expect(prospectAfter.body.prospect.hasClient).toBe(true);
  });

  it("refuse de transformer deux fois le même prospect en client", async () => {
    const { accessToken } = await loginAs(Role.HR, "hr-prospect4@deepclean.test");
    const created = await request(app)
      .post("/api/v1/prospects")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ companyName: "Entreprise déjà convertie" });

    await request(app).post(`/api/v1/prospects/${created.body.prospect.id}/convert`).set("Authorization", `Bearer ${accessToken}`);
    const second = await request(app)
      .post(`/api/v1/prospects/${created.body.prospect.id}/convert`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(second.status).toBe(409);
  });

  it("n'autorise pas un superviseur à transformer le prospect d'un autre superviseur", async () => {
    const supervisorA = await createTestUser({ role: Role.SUPERVISOR, email: "sup-prospect7@deepclean.test" });
    const supervisorB = await createTestUser({ role: Role.SUPERVISOR, email: "sup-prospect8@deepclean.test" });
    const loginA = await request(app).post("/api/v1/auth/login").send({ username: supervisorA.username, password: TEST_PASSWORD });
    const loginB = await request(app).post("/api/v1/auth/login").send({ username: supervisorB.username, password: TEST_PASSWORD });
    const tokenA = loginA.body.accessToken as string;
    const tokenB = loginB.body.accessToken as string;

    const created = await request(app)
      .post("/api/v1/prospects")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ companyName: "Entreprise protégée" });

    const attempt = await request(app)
      .post(`/api/v1/prospects/${created.body.prospect.id}/convert`)
      .set("Authorization", `Bearer ${tokenB}`);
    expect(attempt.status).toBe(404);
  });
});
