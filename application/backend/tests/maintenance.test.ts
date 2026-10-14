import request from "supertest";
import { Role } from "@prisma/client";
import { createApp } from "../src/app";
import { prisma } from "../src/db/prisma";
import { DEFAULT_MAINTENANCE_MESSAGE } from "../src/config/maintenance";
import { createTestUser, resetDatabase, TEST_PASSWORD } from "./helpers";

const app = createApp();

function login(username: string) {
  return request(app).post("/api/v1/auth/login").send({ username, password: TEST_PASSWORD });
}

beforeEach(async () => {
  await resetDatabase();
  delete process.env.MAINTENANCE_MODE;
  delete process.env.MAINTENANCE_MESSAGE;
  delete process.env.MAINTENANCE_UNTIL;
});

afterAll(async () => {
  delete process.env.MAINTENANCE_MODE;
  await prisma.$disconnect();
});

describe("Mode maintenance", () => {
  it("statut public : ouvert par défaut, sans connexion requise", async () => {
    const res = await request(app).get("/api/v1/status");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ maintenance: false, message: null, until: null });
  });

  it("statut public en maintenance : message par défaut, heure de retour prévue", async () => {
    process.env.MAINTENANCE_MODE = "true";
    process.env.MAINTENANCE_UNTIL = "14h30";
    const res = await request(app).get("/api/v1/status");
    expect(res.body).toEqual({ maintenance: true, message: DEFAULT_MAINTENANCE_MESSAGE, until: "14:30" });
  });

  it("refuse la connexion à tout le monde sauf l'admin technique", async () => {
    const emp = await createTestUser({ role: Role.EMPLOYEE, email: "emp-maint@deepclean.test" });
    const dir = await createTestUser({ role: Role.DIRECTOR, email: "dir-maint@deepclean.test" });
    const admin = await createTestUser({ role: Role.ADMIN, email: "admin-maint@deepclean.test" });
    process.env.MAINTENANCE_MODE = "true";
    process.env.MAINTENANCE_MESSAGE = "Nouvelle version en cours d'installation.";

    for (const u of [emp, dir]) {
      const res = await login(u.username);
      expect(res.status).toBe(503);
      expect(res.body.error).toMatchObject({ code: "MAINTENANCE", message: "Nouvelle version en cours d'installation." });
      expect(res.body.accessToken).toBeUndefined();
    }
    expect((await login(admin.username)).status).toBe(200);
  });

  it("met en attente les sessions ouvertes, sans les fermer : tout revient à la fin", async () => {
    const emp = await createTestUser({ role: Role.EMPLOYEE, email: "emp-maint2@deepclean.test" });
    const token = (await login(emp.username)).body.accessToken as string;
    const auth = { Authorization: `Bearer ${token}` };

    process.env.MAINTENANCE_MODE = "true";
    const blocked = await request(app).get("/api/v1/auth/me").set(auth);
    expect(blocked.status).toBe(503);
    expect(blocked.body.error.code).toBe("MAINTENANCE");
    expect((await request(app).get("/api/v1/missions").set(auth)).status).toBe(503);

    process.env.MAINTENANCE_MODE = "false";
    expect((await request(app).get("/api/v1/auth/me").set(auth)).status).toBe(200);
  });

  it("ne révèle rien à un mauvais mot de passe, et le contrôle de santé reste au vert", async () => {
    const emp = await createTestUser({ role: Role.EMPLOYEE, email: "emp-maint3@deepclean.test" });
    process.env.MAINTENANCE_MODE = "true";
    const res = await request(app).post("/api/v1/auth/login").send({ username: emp.username, password: "Mauvais1!motdepasse" });
    expect(res.status).toBe(401);
    expect((await request(app).get("/health")).status).toBe(200);
  });
});
