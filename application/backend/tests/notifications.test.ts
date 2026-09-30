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

describe("Notifications — suppression", () => {
  it("permet à un utilisateur de supprimer sa propre notification", async () => {
    const { accessToken: hrToken } = await loginAs(Role.HR, "hr-notif1@deepclean.test");
    const { accessToken: empToken } = await loginAs(Role.EMPLOYEE, "emp-notif1@deepclean.test");

    // Une actualité notifie automatiquement tous les autres comptes actifs
    // (voir announcements.service.ts::createAnnouncement) — moyen le plus
    // simple de faire naître une vraie notification sans endpoint dédié.
    await request(app)
      .post("/api/v1/announcements")
      .set("Authorization", `Bearer ${hrToken}`)
      .field("title", "Info")
      .field("body", "Une actualité.");

    const list = await request(app).get("/api/v1/notifications").set("Authorization", `Bearer ${empToken}`);
    expect(list.body.items.length).toBeGreaterThan(0);
    const notificationId = list.body.items[0].id as string;

    const del = await request(app)
      .delete(`/api/v1/notifications/${notificationId}`)
      .set("Authorization", `Bearer ${empToken}`);
    expect(del.status).toBe(204);

    const after = await request(app).get("/api/v1/notifications").set("Authorization", `Bearer ${empToken}`);
    expect(after.body.items.find((n: { id: string }) => n.id === notificationId)).toBeUndefined();
  });

  it("refuse de supprimer la notification d'un autre utilisateur (404, pas 403 — n'en révèle pas l'existence)", async () => {
    const { accessToken: hrToken } = await loginAs(Role.HR, "hr-notif2@deepclean.test");
    const { accessToken: empToken } = await loginAs(Role.EMPLOYEE, "emp-notif2@deepclean.test");
    const { accessToken: otherToken } = await loginAs(Role.EMPLOYEE, "emp-notif2b@deepclean.test");

    await request(app)
      .post("/api/v1/announcements")
      .set("Authorization", `Bearer ${hrToken}`)
      .field("title", "Info")
      .field("body", "Une autre actualité.");

    const list = await request(app).get("/api/v1/notifications").set("Authorization", `Bearer ${empToken}`);
    const notificationId = list.body.items[0].id as string;

    const del = await request(app)
      .delete(`/api/v1/notifications/${notificationId}`)
      .set("Authorization", `Bearer ${otherToken}`);
    expect(del.status).toBe(404);

    // Toujours là pour son vrai propriétaire.
    const stillThere = await request(app).get("/api/v1/notifications").set("Authorization", `Bearer ${empToken}`);
    expect(stillThere.body.items.find((n: { id: string }) => n.id === notificationId)).toBeDefined();
  });

  it("renvoie 404 pour la suppression d'une notification inexistante", async () => {
    const { accessToken } = await loginAs(Role.EMPLOYEE, "emp-notif3@deepclean.test");
    const res = await request(app)
      .delete("/api/v1/notifications/00000000-0000-0000-0000-000000000000")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(404);
  });
});
