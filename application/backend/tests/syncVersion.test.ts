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

async function loginAs(user: { username: string }) {
  const login = await request(app).post("/api/v1/auth/login").send({ username: user.username, password: TEST_PASSWORD });
  return login.body.accessToken as string;
}

describe("Synchronisation entre appareils (version des données)", () => {
  it("exige d'être connecté", async () => {
    expect((await request(app).get("/api/v1/sync/version")).status).toBe(401);
  });

  it("change après une modification réussie, pas après une lecture ni une erreur", async () => {
    const hr = await createTestUser({ role: Role.HR, email: "sync-hr@deepclean.test" });
    const token = await loginAs(hr);
    const version = async () => (await request(app).get("/api/v1/sync/version").set("Authorization", `Bearer ${token}`)).body.version as string;

    const v1 = await version();
    await request(app).get("/api/v1/sites").set("Authorization", `Bearer ${token}`);
    expect(await version()).toBe(v1);

    const failed = await request(app).post("/api/v1/sites").set("Authorization", `Bearer ${token}`).send({});
    expect(failed.status).toBe(400);
    expect(await version()).toBe(v1);

    const created = await request(app).post("/api/v1/sites").set("Authorization", `Bearer ${token}`).send({ name: "Chantier sync", address: "1 rue Test" });
    expect(created.status).toBe(201);
    await new Promise((r) => setImmediate(r));
    expect(await version()).not.toBe(v1);
  });

  it("ignore les lectures de notifications", async () => {
    const employee = await createTestUser({ role: Role.EMPLOYEE, email: "sync-emp@deepclean.test" });
    const token = await loginAs(employee);
    const v1 = (await request(app).get("/api/v1/sync/version").set("Authorization", `Bearer ${token}`)).body.version;
    await request(app).post("/api/v1/notifications/read-all").set("Authorization", `Bearer ${token}`);
    expect((await request(app).get("/api/v1/sync/version").set("Authorization", `Bearer ${token}`)).body.version).toBe(v1);
  });
});
