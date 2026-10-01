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


describe("Compteurs de non-lus du centre de notifications", () => {
  it("expose un total hors « nouveau message », pour que le badge ne compte pas deux fois un message reçu", async () => {
    const { user: sender, accessToken: senderToken } = await loginAs(Role.SUPERVISOR, "notif-count-sender@deepclean.test");
    const { accessToken: recipientToken } = await loginAs(Role.EMPLOYEE, "notif-count-recipient@deepclean.test");

    // Une notification qui n'est pas un message (ici une annonce diffusée).
    await request(app)
      .post("/api/v1/announcements")
      .set("Authorization", `Bearer ${senderToken}`)
      .send({ title: "Fermeture exceptionnelle", body: "Le dépôt sera fermé vendredi." });

    // Puis deux messages, qui créent chacun une notification ET un non-lu.
    const conversation = await request(app)
      .post("/api/v1/messages/conversations/direct")
      .set("Authorization", `Bearer ${senderToken}`)
      .send({ userId: (await request(app).get("/api/v1/auth/me").set("Authorization", `Bearer ${recipientToken}`)).body.user.id });
    for (const body of ["Premier", "Second"]) {
      await request(app)
        .post("/api/v1/messages")
        .set("Authorization", `Bearer ${senderToken}`)
        .field("conversationId", conversation.body.conversation.id)
        .field("body", body);
    }

    const notifications = await request(app).get("/api/v1/notifications").set("Authorization", `Bearer ${recipientToken}`);
    const messages = await request(app).get("/api/v1/messages/unread-count").set("Authorization", `Bearer ${recipientToken}`);

    expect(notifications.body.unreadCount).toBe(3); // 1 annonce + 2 messages
    expect(notifications.body.unreadCountExcludingMessages).toBe(1);
    expect(messages.body.unreadCount).toBe(2);
    // Ce que le badge de l'onglet affiche réellement : 3, et non 5.
    expect(notifications.body.unreadCountExcludingMessages + messages.body.unreadCount).toBe(3);
    void sender;
  });

  it("peut écarter les notifications de message, pour que l'activité récente montre le métier", async () => {
    const { accessToken: senderToken } = await loginAs(Role.SUPERVISOR, "notif-filter-sender@deepclean.test");
    const { accessToken: recipientToken } = await loginAs(Role.EMPLOYEE, "notif-filter-recipient@deepclean.test");
    const recipientId = (await request(app).get("/api/v1/auth/me").set("Authorization", `Bearer ${recipientToken}`)).body
      .user.id;

    await request(app)
      .post("/api/v1/announcements")
      .set("Authorization", `Bearer ${senderToken}`)
      .send({ title: "Réunion de service", body: "Jeudi 14h au dépôt." });

    const conversation = await request(app)
      .post("/api/v1/messages/conversations/direct")
      .set("Authorization", `Bearer ${senderToken}`)
      .send({ userId: recipientId });
    await request(app)
      .post("/api/v1/messages")
      .set("Authorization", `Bearer ${senderToken}`)
      .field("conversationId", conversation.body.conversation.id)
      .field("body", "Un message qui ne doit pas noyer l'activité");

    const all = await request(app).get("/api/v1/notifications").set("Authorization", `Bearer ${recipientToken}`);
    expect(all.body.items).toHaveLength(2);

    const filtered = await request(app)
      .get("/api/v1/notifications?excludeMessages=true")
      .set("Authorization", `Bearer ${recipientToken}`);
    expect(filtered.body.items).toHaveLength(1);
    expect(filtered.body.items[0].type).toBe("ANNOUNCEMENT_POSTED");
    // Les compteurs restent ceux de tout le centre de notifications : le badge
    // de l'onglet ne doit pas dépendre de l'écran qui interroge l'API.
    expect(filtered.body.unreadCount).toBe(2);
    expect(filtered.body.unreadCountExcludingMessages).toBe(1);
  });
});
