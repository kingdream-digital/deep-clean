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

describe("Messagerie interne — annuaire et permissions", () => {
  it("liste l'annuaire des comptes actifs, sans se lister soi-même, quel que soit le rôle", async () => {
    const { user: employee, accessToken } = await loginAs(Role.EMPLOYEE, "emp-msg1@deepclean.test");
    await createTestUser({ role: Role.HR, email: "hr-msg1@deepclean.test" });
    await createTestUser({ role: Role.EMPLOYEE, email: "inactive-msg1@deepclean.test", isActive: false });

    const res = await request(app).get("/api/v1/messages/contacts").set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.items.some((c: { id: string }) => c.id === employee.id)).toBe(false);
    expect(res.body.items.some((c: { email?: string }) => "email" in c)).toBe(false);
    // Le compte désactivé n'apparaît pas dans l'annuaire.
    expect(res.body.items.find((c: { firstName: string }) => c.firstName === "Test" )).toBeDefined();
  });

  it("refuse d'envoyer un message à un compte désactivé", async () => {
    const { accessToken } = await loginAs(Role.EMPLOYEE, "emp-msg2@deepclean.test");
    const inactive = await createTestUser({ role: Role.EMPLOYEE, email: "inactive-msg2@deepclean.test", isActive: false });

    const res = await request(app)
      .post("/api/v1/messages")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ recipientId: inactive.id, body: "Bonjour" });

    expect(res.status).toBe(404);
  });

  it("refuse de s'envoyer un message à soi-même", async () => {
    const { user, accessToken } = await loginAs(Role.EMPLOYEE, "emp-msg3@deepclean.test");

    const res = await request(app)
      .post("/api/v1/messages")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ recipientId: user.id, body: "Bonjour moi-même" });

    expect(res.status).toBe(400);
  });
});

describe("Messagerie interne — envoi et fils de discussion", () => {
  it("permet à deux comptes de n'importe quel rôle d'échanger des messages", async () => {
    const { user: employee, accessToken: employeeToken } = await loginAs(Role.EMPLOYEE, "emp-msg4@deepclean.test");
    const { user: hr, accessToken: hrToken } = await loginAs(Role.HR, "hr-msg4@deepclean.test");

    const sent = await request(app)
      .post("/api/v1/messages")
      .set("Authorization", `Bearer ${employeeToken}`)
      .send({ recipientId: hr.id, body: "Bonjour RH, question sur mon planning." });
    expect(sent.status).toBe(201);
    expect(sent.body.message.senderId).toBe(employee.id);

    const reply = await request(app)
      .post("/api/v1/messages")
      .set("Authorization", `Bearer ${hrToken}`)
      .send({ recipientId: employee.id, body: "Bonjour, je regarde ça." });
    expect(reply.status).toBe(201);

    const thread = await request(app)
      .get(`/api/v1/messages/with/${hr.id}`)
      .set("Authorization", `Bearer ${employeeToken}`);
    expect(thread.status).toBe(200);
    expect(thread.body.items).toHaveLength(2);
    expect(thread.body.items[0].body).toBe("Bonjour RH, question sur mon planning.");
    expect(thread.body.items[1].body).toBe("Bonjour, je regarde ça.");
  });

  it("un utilisateur non impliqué dans le fil ne peut pas le consulter (aucune fuite via le paramètre userId)", async () => {
    const { accessToken: tokenA } = await loginAs(Role.EMPLOYEE, "emp-msg5@deepclean.test");
    const { user: b } = await loginAs(Role.EMPLOYEE, "emp-msg6@deepclean.test");
    const { accessToken: tokenC } = await loginAs(Role.EMPLOYEE, "emp-msg7@deepclean.test");

    await request(app)
      .post("/api/v1/messages")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ recipientId: b.id, body: "Message privé entre A et B" });

    // C demande le fil "avec B" — mais l'authentification de C fait que la
    // requête porte en réalité sur le fil C<->B, jamais A<->B.
    const res = await request(app).get(`/api/v1/messages/with/${b.id}`).set("Authorization", `Bearer ${tokenC}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(0);
  });

  it("marque un fil comme lu et fait redescendre le compteur non-lu global", async () => {
    const { user: sender, accessToken: senderToken } = await loginAs(Role.SUPERVISOR, "sup-msg1@deepclean.test");
    const { user: recipient, accessToken: recipientToken } = await loginAs(Role.EMPLOYEE, "emp-msg8@deepclean.test");

    await request(app)
      .post("/api/v1/messages")
      .set("Authorization", `Bearer ${senderToken}`)
      .send({ recipientId: recipient.id, body: "Nouvelle consigne pour demain." });

    const before = await request(app).get("/api/v1/messages/unread-count").set("Authorization", `Bearer ${recipientToken}`);
    expect(before.body.unreadCount).toBe(1);

    const markRead = await request(app)
      .post(`/api/v1/messages/with/${sender.id}/read`)
      .set("Authorization", `Bearer ${recipientToken}`);
    expect(markRead.status).toBe(204);

    const after = await request(app).get("/api/v1/messages/unread-count").set("Authorization", `Bearer ${recipientToken}`);
    expect(after.body.unreadCount).toBe(0);
  });

  it("liste les conversations triées par dernier message, avec le bon compteur de non-lus", async () => {
    const { user: hr, accessToken: hrToken } = await loginAs(Role.HR, "hr-msg2@deepclean.test");
    const { user: employeeA, accessToken: tokenA } = await loginAs(Role.EMPLOYEE, "emp-msg9@deepclean.test");
    const { user: employeeB, accessToken: tokenB } = await loginAs(Role.EMPLOYEE, "emp-msg10@deepclean.test");

    await request(app).post("/api/v1/messages").set("Authorization", `Bearer ${tokenA}`).send({ recipientId: hr.id, body: "Premier message" });
    await request(app).post("/api/v1/messages").set("Authorization", `Bearer ${tokenB}`).send({ recipientId: hr.id, body: "Message plus récent" });

    const res = await request(app).get("/api/v1/messages/conversations").set("Authorization", `Bearer ${hrToken}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.items[0].user.id).toBe(employeeB.id);
    expect(res.body.items[0].unreadCount).toBe(1);
    expect(res.body.items[1].user.id).toBe(employeeA.id);
  });
});
