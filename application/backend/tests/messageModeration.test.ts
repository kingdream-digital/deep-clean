import request from "supertest";
import { Role } from "@prisma/client";
import { createApp } from "../src/app";
import { prisma } from "../src/db/prisma";
import { createTestUser, resetDatabase, TEST_PASSWORD } from "./helpers";

// Messagerie : blocage d'un contact et signalement d'un message à la RH
// (règle App Store 1.2 — contenus publiés par les utilisateurs).

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
  return { user, token: login.body.accessToken as string };
}

async function openDirect(token: string, userId: string) {
  const res = await request(app).post("/api/v1/messages/conversations/direct").set("Authorization", `Bearer ${token}`).send({ userId });
  return res.body.conversation as { id: string };
}

async function sendText(token: string, conversationId: string, body: string) {
  return request(app).post("/api/v1/messages").set("Authorization", `Bearer ${token}`).field("conversationId", conversationId).field("body", body);
}

async function createGroup(token: string, participantIds: string[]) {
  const res = await request(app)
    .post("/api/v1/messages/conversations/group")
    .set("Authorization", `Bearer ${token}`)
    .send({ title: "Équipe", participantIds });
  return res.body.conversation as { id: string };
}

describe("Blocage d'un contact", () => {
  it("empêche la personne bloquée d'écrire en direct et masque ses messages", async () => {
    const alice = await loginAs(Role.EMPLOYEE, "alice-mod@deepclean.test");
    const bob = await loginAs(Role.EMPLOYEE, "bob-mod@deepclean.test");
    const conv = await openDirect(alice.token, bob.user.id);
    expect((await sendText(bob.token, conv.id, "Premier message")).status).toBe(201);

    const block = await request(app).post("/api/v1/messages/blocks").set("Authorization", `Bearer ${alice.token}`).send({ userId: bob.user.id });
    expect(block.status).toBe(204);

    const refused = await sendText(bob.token, conv.id, "Encore moi");
    expect(refused.status).toBe(403);
    const ownSide = await sendText(alice.token, conv.id, "Réponse");
    expect(ownSide.status).toBe(403);
    expect(ownSide.body.error.message).toMatch(/Débloquez/);

    // Le message déjà reçu n'est plus lisible par Alice…
    const thread = await request(app).get(`/api/v1/messages/conversations/${conv.id}/messages`).set("Authorization", `Bearer ${alice.token}`);
    const fromBob = thread.body.items.find((m: { senderId: string }) => m.senderId === bob.user.id);
    expect(fromBob).toMatchObject({ body: null, blockedSender: true });
    // …mais Bob voit toujours son propre historique.
    const bobThread = await request(app).get(`/api/v1/messages/conversations/${conv.id}/messages`).set("Authorization", `Bearer ${bob.token}`);
    expect(bobThread.body.items[0].body).toBe("Premier message");

    const list = await request(app).get("/api/v1/messages/blocks").set("Authorization", `Bearer ${alice.token}`);
    expect(list.body.items.map((c: { id: string }) => c.id)).toEqual([bob.user.id]);

    const unblock = await request(app).delete(`/api/v1/messages/blocks/${bob.user.id}`).set("Authorization", `Bearer ${alice.token}`);
    expect(unblock.status).toBe(204);
    expect((await sendText(bob.token, conv.id, "Après déblocage")).status).toBe(201);
  });

  it("ne notifie plus celle ou celui qui a bloqué l'auteur dans un groupe", async () => {
    const alice = await loginAs(Role.EMPLOYEE, "alice-grp@deepclean.test");
    const bob = await loginAs(Role.EMPLOYEE, "bob-grp@deepclean.test");
    const carol = await loginAs(Role.EMPLOYEE, "carol-grp@deepclean.test");
    const group = await createGroup(bob.token, [alice.user.id, carol.user.id]);
    await request(app).post("/api/v1/messages/blocks").set("Authorization", `Bearer ${alice.token}`).send({ userId: bob.user.id });
    await prisma.notification.deleteMany();

    expect((await sendText(bob.token, group.id, "Bonjour l'équipe")).status).toBe(201);

    const notified = await prisma.notification.findMany({ where: { type: "MESSAGE_RECEIVED" }, select: { userId: true } });
    expect(notified.map((n) => n.userId)).toEqual([carol.user.id]);
  });

  it("refuse de se bloquer soi-même ou un compte inconnu", async () => {
    const alice = await loginAs(Role.EMPLOYEE, "alice-self@deepclean.test");
    const self = await request(app).post("/api/v1/messages/blocks").set("Authorization", `Bearer ${alice.token}`).send({ userId: alice.user.id });
    expect(self.status).toBe(400);
    const unknown = await request(app)
      .post("/api/v1/messages/blocks")
      .set("Authorization", `Bearer ${alice.token}`)
      .send({ userId: "00000000-0000-4000-8000-000000000000" });
    expect(unknown.status).toBe(404);
  });
});

describe("Signalement d'un message", () => {
  it("prévient la RH et l'admin technique, une seule fois par personne", async () => {
    const alice = await loginAs(Role.EMPLOYEE, "alice-rep@deepclean.test");
    const bob = await loginAs(Role.EMPLOYEE, "bob-rep@deepclean.test");
    const hr = await createTestUser({ role: Role.HR, email: "hr-rep@deepclean.test" });
    const admin = await createTestUser({ role: Role.ADMIN, email: "admin-rep@deepclean.test" });
    const conv = await openDirect(alice.token, bob.user.id);
    const sent = await sendText(bob.token, conv.id, "Message déplacé");
    await prisma.notification.deleteMany();

    const report = await request(app)
      .post(`/api/v1/messages/${sent.body.message.id}/report`)
      .set("Authorization", `Bearer ${alice.token}`)
      .send({ reason: "INSULT", comment: "Propos blessants" });
    expect(report.status).toBe(201);

    const notified = await prisma.notification.findMany({ where: { title: "Message signalé" } });
    expect(notified.map((n) => n.userId).sort()).toEqual([hr.id, admin.id].sort());
    expect(notified[0]).toMatchObject({ relatedEntityType: "User", relatedEntityId: bob.user.id });
    expect(notified[0]?.body).toContain("Message déplacé");

    const again = await request(app)
      .post(`/api/v1/messages/${sent.body.message.id}/report`)
      .set("Authorization", `Bearer ${alice.token}`)
      .send({ reason: "INSULT" });
    expect(again.status).toBe(200);
    expect(again.body.alreadyReported).toBe(true);
    expect(await prisma.notification.count({ where: { title: "Message signalé" } })).toBe(2);
    expect(await prisma.messageReport.count()).toBe(1);
  });

  it("refuse le signalement de son propre message ou d'un fil dont on n'est pas membre", async () => {
    const alice = await loginAs(Role.EMPLOYEE, "alice-rep2@deepclean.test");
    const bob = await loginAs(Role.EMPLOYEE, "bob-rep2@deepclean.test");
    const mallory = await loginAs(Role.EMPLOYEE, "mallory-rep2@deepclean.test");
    const conv = await openDirect(alice.token, bob.user.id);
    const sent = await sendText(bob.token, conv.id, "Bonjour");

    const own = await request(app).post(`/api/v1/messages/${sent.body.message.id}/report`).set("Authorization", `Bearer ${bob.token}`).send({ reason: "SPAM" });
    expect(own.status).toBe(400);
    const outsider = await request(app)
      .post(`/api/v1/messages/${sent.body.message.id}/report`)
      .set("Authorization", `Bearer ${mallory.token}`)
      .send({ reason: "SPAM" });
    expect(outsider.status).toBe(404);
    const badReason = await request(app)
      .post(`/api/v1/messages/${sent.body.message.id}/report`)
      .set("Authorization", `Bearer ${alice.token}`)
      .send({ reason: "AUTRE" });
    expect(badReason.status).toBe(400);
  });
});
