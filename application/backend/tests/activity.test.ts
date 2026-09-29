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

// Retour explicite du client (validé) : le journal d'activité, qui peut
// exposer des détails techniques sensibles sur le fonctionnement interne de
// l'application, est désormais réservé à l'admin technique — RH et direction
// (qui y avaient accès jusque-là) en perdent l'accès.
describe("Journal d'activité — réservé à l'admin technique", () => {
  it("refuse à la RH de consulter le journal d'activité", async () => {
    const { accessToken } = await loginAs(Role.HR, "hr-activity@deepclean.test");
    const res = await request(app).get("/api/v1/activity-logs").set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(403);
  });

  it("refuse à la direction de consulter le journal d'activité", async () => {
    const { accessToken } = await loginAs(Role.DIRECTOR, "dir-activity@deepclean.test");
    const res = await request(app).get("/api/v1/activity-logs").set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(403);
  });

  it("refuse au superviseur de consulter le journal d'activité", async () => {
    const { accessToken } = await loginAs(Role.SUPERVISOR, "sup-activity@deepclean.test");
    const res = await request(app).get("/api/v1/activity-logs").set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(403);
  });

  it("permet à l'admin technique de consulter le journal d'activité", async () => {
    const { accessToken } = await loginAs(Role.ADMIN, "admin-activity@deepclean.test");
    const res = await request(app).get("/api/v1/activity-logs").set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
  });
});
