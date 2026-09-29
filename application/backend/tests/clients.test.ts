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

describe("Clients — accès au module commercial", () => {
  it("refuse à un employé d'accéder aux clients", async () => {
    const { accessToken } = await loginAs(Role.EMPLOYEE, "emp-client@deepclean.test");
    const res = await request(app).get("/api/v1/clients").set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(403);
  });

  it("permet à la RH de créer un client directement (sans passer par un prospect)", async () => {
    const { accessToken } = await loginAs(Role.HR, "hr-client1@deepclean.test");
    const created = await request(app)
      .post("/api/v1/clients")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ companyName: "Client Direct SARL", email: "contact@direct.test" });

    expect(created.status).toBe(201);
    expect(created.body.client.companyName).toBe("Client Direct SARL");
  });
});

describe("Clients — un client est un référentiel partagé, visible par tout le module commercial", () => {
  it("permet à un superviseur de voir un client créé par un autre superviseur", async () => {
    const supervisorA = await createTestUser({ role: Role.SUPERVISOR, email: "sup-client1@deepclean.test" });
    const supervisorB = await createTestUser({ role: Role.SUPERVISOR, email: "sup-client2@deepclean.test" });
    const loginA = await request(app).post("/api/v1/auth/login").send({ username: supervisorA.username, password: TEST_PASSWORD });
    const loginB = await request(app).post("/api/v1/auth/login").send({ username: supervisorB.username, password: TEST_PASSWORD });
    const tokenA = loginA.body.accessToken as string;
    const tokenB = loginB.body.accessToken as string;

    const created = await request(app)
      .post("/api/v1/clients")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ companyName: "Client partagé" });

    const getB = await request(app).get(`/api/v1/clients/${created.body.client.id}`).set("Authorization", `Bearer ${tokenB}`);
    expect(getB.status).toBe(200);
  });

  it("refuse à un superviseur de modifier un client créé par un autre superviseur", async () => {
    const supervisorA = await createTestUser({ role: Role.SUPERVISOR, email: "sup-client3@deepclean.test" });
    const supervisorB = await createTestUser({ role: Role.SUPERVISOR, email: "sup-client4@deepclean.test" });
    const loginA = await request(app).post("/api/v1/auth/login").send({ username: supervisorA.username, password: TEST_PASSWORD });
    const loginB = await request(app).post("/api/v1/auth/login").send({ username: supervisorB.username, password: TEST_PASSWORD });
    const tokenA = loginA.body.accessToken as string;
    const tokenB = loginB.body.accessToken as string;

    const created = await request(app)
      .post("/api/v1/clients")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ companyName: "Client protégé" });

    const updateAttempt = await request(app)
      .patch(`/api/v1/clients/${created.body.client.id}`)
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ companyName: "Tentative de modification" });
    expect(updateAttempt.status).toBe(403);
  });

  it("permet à la RH de modifier n'importe quel client", async () => {
    const supervisor = await createTestUser({ role: Role.SUPERVISOR, email: "sup-client5@deepclean.test" });
    const { accessToken: hrToken } = await loginAs(Role.HR, "hr-client2@deepclean.test");
    const loginSup = await request(app).post("/api/v1/auth/login").send({ username: supervisor.username, password: TEST_PASSWORD });
    const supToken = loginSup.body.accessToken as string;

    const created = await request(app)
      .post("/api/v1/clients")
      .set("Authorization", `Bearer ${supToken}`)
      .send({ companyName: "Client modifiable par RH" });

    const updated = await request(app)
      .patch(`/api/v1/clients/${created.body.client.id}`)
      .set("Authorization", `Bearer ${hrToken}`)
      .send({ city: "Lyon" });
    expect(updated.status).toBe(200);
    expect(updated.body.client.city).toBe("Lyon");
  });
});
