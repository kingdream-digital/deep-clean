import request from "supertest";
import { Role } from "@prisma/client";
import { createApp } from "../src/app";
import { prisma } from "../src/db/prisma";
import { createTestUser, resetDatabase, tinyTestPhoto, TEST_PASSWORD } from "./helpers";
import { migrateMessagesToConversations } from "../src/db/migrateMessagesToConversations";

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

/** Fil à deux, créé comme le fait l'application quand on ouvre une discussion. */
async function openDirect(token: string, userId: string) {
  const res = await request(app)
    .post("/api/v1/messages/conversations/direct")
    .set("Authorization", `Bearer ${token}`)
    .send({ userId });
  return res.body.conversation as { id: string };
}

async function sendText(token: string, conversationId: string, body: string) {
  return request(app)
    .post("/api/v1/messages")
    .set("Authorization", `Bearer ${token}`)
    .field("conversationId", conversationId)
    .field("body", body);
}

/** PDF minimal mais réel : la validation côté serveur lit les octets, pas le type déclaré. */
function tinyTestPdf(): Buffer {
  return Buffer.from(
    "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
    "latin1"
  );
}

describe("Messagerie interne — annuaire et permissions", () => {
  it("liste l'annuaire des comptes actifs, sans se lister soi-même, quel que soit le rôle", async () => {
    const { user: employee, accessToken } = await loginAs(Role.EMPLOYEE, "emp-msg1@deepclean.test");
    const hr = await createTestUser({ role: Role.HR, email: "hr-msg1@deepclean.test" });
    const inactive = await createTestUser({ role: Role.EMPLOYEE, email: "inactive-msg1@deepclean.test", isActive: false });

    const res = await request(app).get("/api/v1/messages/contacts").set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.items.some((c: { id: string }) => c.id === employee.id)).toBe(false);
    expect(res.body.items.some((c: { id: string }) => c.id === hr.id)).toBe(true);
    expect(res.body.items.some((c: { id: string }) => c.id === inactive.id)).toBe(false);
    expect(res.body.items.some((c: { email?: string }) => "email" in c)).toBe(false);
    // La photo de profil n'est jamais exposée par sa clé de stockage.
    expect(res.body.items.some((c: { avatarKey?: string }) => "avatarKey" in c)).toBe(false);
  });

  it("refuse d'ouvrir une discussion avec un compte désactivé", async () => {
    const { accessToken } = await loginAs(Role.EMPLOYEE, "emp-msg2@deepclean.test");
    const inactive = await createTestUser({ role: Role.EMPLOYEE, email: "inactive-msg2@deepclean.test", isActive: false });

    const res = await request(app)
      .post("/api/v1/messages/conversations/direct")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ userId: inactive.id });

    expect(res.status).toBe(404);
  });

  it("refuse d'ouvrir une discussion avec soi-même", async () => {
    const { user, accessToken } = await loginAs(Role.EMPLOYEE, "emp-msg3@deepclean.test");

    const res = await request(app)
      .post("/api/v1/messages/conversations/direct")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ userId: user.id });

    expect(res.status).toBe(400);
  });
});

describe("Messagerie interne — fils à deux", () => {
  it("permet à deux comptes de n'importe quel rôle d'échanger des messages", async () => {
    const { user: employee, accessToken: employeeToken } = await loginAs(Role.EMPLOYEE, "emp-msg4@deepclean.test");
    const { user: hr, accessToken: hrToken } = await loginAs(Role.HR, "hr-msg4@deepclean.test");

    const conversation = await openDirect(employeeToken, hr.id);

    const sent = await sendText(employeeToken, conversation.id, "Bonjour RH, question sur mon planning.");
    expect(sent.status).toBe(201);
    expect(sent.body.message.senderId).toBe(employee.id);

    const reply = await sendText(hrToken, conversation.id, "Bonjour, je regarde ça.");
    expect(reply.status).toBe(201);

    const thread = await request(app)
      .get(`/api/v1/messages/conversations/${conversation.id}/messages`)
      .set("Authorization", `Bearer ${employeeToken}`);
    expect(thread.status).toBe(200);
    expect(thread.body.items).toHaveLength(2);
    expect(thread.body.items[0].body).toBe("Bonjour RH, question sur mon planning.");
    expect(thread.body.items[1].body).toBe("Bonjour, je regarde ça.");
  });

  it("réutilise le même fil quels que soient qui l'ouvre et combien de fois", async () => {
    const { user: a, accessToken: tokenA } = await loginAs(Role.EMPLOYEE, "emp-msg4b@deepclean.test");
    const { user: b, accessToken: tokenB } = await loginAs(Role.EMPLOYEE, "emp-msg4c@deepclean.test");

    const first = await openDirect(tokenA, b.id);
    const again = await openDirect(tokenA, b.id);
    const fromOtherSide = await openDirect(tokenB, a.id);

    expect(again.id).toBe(first.id);
    expect(fromOtherSide.id).toBe(first.id);
  });

  it("un utilisateur étranger au fil ne peut ni le lire ni y écrire (aucune fuite via l'identifiant)", async () => {
    const { accessToken: tokenA } = await loginAs(Role.EMPLOYEE, "emp-msg5@deepclean.test");
    const { user: b } = await loginAs(Role.EMPLOYEE, "emp-msg6@deepclean.test");
    const { accessToken: tokenC } = await loginAs(Role.EMPLOYEE, "emp-msg7@deepclean.test");

    const conversation = await openDirect(tokenA, b.id);
    await sendText(tokenA, conversation.id, "Message privé entre A et B");

    // 404 et non 403 : l'existence même du fil ne doit pas être révélée.
    const read = await request(app)
      .get(`/api/v1/messages/conversations/${conversation.id}/messages`)
      .set("Authorization", `Bearer ${tokenC}`);
    expect(read.status).toBe(404);

    const write = await sendText(tokenC, conversation.id, "je m'incruste");
    expect(write.status).toBe(404);

    const list = await request(app).get("/api/v1/messages/conversations").set("Authorization", `Bearer ${tokenC}`);
    expect(list.body.items).toHaveLength(0);
  });

  it("marque un fil comme lu et fait redescendre le compteur non-lu global", async () => {
    const { user: sender, accessToken: senderToken } = await loginAs(Role.SUPERVISOR, "sup-msg1@deepclean.test");
    const { user: recipient, accessToken: recipientToken } = await loginAs(Role.EMPLOYEE, "emp-msg8@deepclean.test");

    const conversation = await openDirect(senderToken, recipient.id);
    await sendText(senderToken, conversation.id, "Nouvelle consigne pour demain.");

    const before = await request(app).get("/api/v1/messages/unread-count").set("Authorization", `Bearer ${recipientToken}`);
    expect(before.body.unreadCount).toBe(1);

    // L'expéditeur, lui, n'a jamais de non-lu pour son propre message.
    const senderCount = await request(app).get("/api/v1/messages/unread-count").set("Authorization", `Bearer ${senderToken}`);
    expect(senderCount.body.unreadCount).toBe(0);

    const markRead = await request(app)
      .post(`/api/v1/messages/conversations/${conversation.id}/read`)
      .set("Authorization", `Bearer ${recipientToken}`);
    expect(markRead.status).toBe(204);

    const after = await request(app).get("/api/v1/messages/unread-count").set("Authorization", `Bearer ${recipientToken}`);
    expect(after.body.unreadCount).toBe(0);
    void sender;
  });

  it("liste les conversations triées par dernier message, avec le bon compteur de non-lus", async () => {
    const { user: hr, accessToken: hrToken } = await loginAs(Role.HR, "hr-msg2@deepclean.test");
    const { user: employeeA, accessToken: tokenA } = await loginAs(Role.EMPLOYEE, "emp-msg9@deepclean.test");
    const { user: employeeB, accessToken: tokenB } = await loginAs(Role.EMPLOYEE, "emp-msg10@deepclean.test");

    const convA = await openDirect(tokenA, hr.id);
    await sendText(tokenA, convA.id, "Premier message");
    const convB = await openDirect(tokenB, hr.id);
    await sendText(tokenB, convB.id, "Message plus récent");

    const res = await request(app).get("/api/v1/messages/conversations").set("Authorization", `Bearer ${hrToken}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.items[0].otherUser.id).toBe(employeeB.id);
    expect(res.body.items[0].unreadCount).toBe(1);
    expect(res.body.items[1].otherUser.id).toBe(employeeA.id);
  });

  it("n'encombre pas la liste avec un fil ouvert mais resté sans message", async () => {
    const { accessToken } = await loginAs(Role.EMPLOYEE, "emp-msg11@deepclean.test");
    const { user: other } = await loginAs(Role.EMPLOYEE, "emp-msg12@deepclean.test");

    await openDirect(accessToken, other.id);

    const res = await request(app).get("/api/v1/messages/conversations").set("Authorization", `Bearer ${accessToken}`);
    expect(res.body.items).toHaveLength(0);
  });
});

describe("Messagerie interne — groupes (retour explicite du client)", () => {
  async function setupGroup() {
    const creator = await loginAs(Role.HR, "hr-grp@deepclean.test");
    const member1 = await loginAs(Role.SITE_MANAGER, "sm-grp@deepclean.test");
    const member2 = await loginAs(Role.EMPLOYEE, "emp-grp@deepclean.test");
    const outsider = await loginAs(Role.EMPLOYEE, "out-grp@deepclean.test");

    const res = await request(app)
      .post("/api/v1/messages/conversations/group")
      .set("Authorization", `Bearer ${creator.accessToken}`)
      .send({ title: "Chantier Le Phare", participantIds: [member1.user.id, member2.user.id] });

    return { creator, member1, member2, outsider, res, group: res.body.conversation };
  }

  it("crée un groupe dont le créateur est administrateur, avec tous ses participants", async () => {
    const { res, group, creator, member1 } = await setupGroup();

    expect(res.status).toBe(201);
    expect(group.isGroup).toBe(true);
    expect(group.title).toBe("Chantier Le Phare");
    expect(group.participants).toHaveLength(3);
    expect(group.participants.find((p: { id: string }) => p.id === creator.user.id).isAdmin).toBe(true);
    expect(group.participants.find((p: { id: string }) => p.id === member1.user.id).isAdmin).toBe(false);
  });

  it("refuse un « groupe » de deux personnes, qui est une conversation à deux", async () => {
    const { accessToken } = await loginAs(Role.HR, "hr-grp2@deepclean.test");
    const { user: other } = await loginAs(Role.EMPLOYEE, "emp-grp2@deepclean.test");

    const res = await request(app)
      .post("/api/v1/messages/conversations/group")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ title: "Trop petit", participantIds: [other.id] });

    expect(res.status).toBe(400);
  });

  it("distribue les messages à tous les membres et à personne d'autre", async () => {
    const { group, creator, member1, member2, outsider } = await setupGroup();

    const sent = await sendText(creator.accessToken, group.id, "Point d'équipe demain 8h.");
    expect(sent.status).toBe(201);

    for (const member of [member1, member2]) {
      const list = await request(app).get("/api/v1/messages/conversations").set("Authorization", `Bearer ${member.accessToken}`);
      const theirs = list.body.items.find((c: { id: string }) => c.id === group.id);
      expect(theirs).toBeDefined();
      expect(theirs.unreadCount).toBe(1);
      expect(theirs.lastMessage.senderName).toBe(`${creator.user.firstName} ${creator.user.lastName}`);
    }

    const outsiderList = await request(app)
      .get("/api/v1/messages/conversations")
      .set("Authorization", `Bearer ${outsider.accessToken}`);
    expect(outsiderList.body.items).toHaveLength(0);

    const outsiderRead = await request(app)
      .get(`/api/v1/messages/conversations/${group.id}/messages`)
      .set("Authorization", `Bearer ${outsider.accessToken}`);
    expect(outsiderRead.status).toBe(404);

    const outsiderWrite = await sendText(outsider.accessToken, group.id, "bonjour");
    expect(outsiderWrite.status).toBe(404);
  });

  it("notifie chaque membre concerné, jamais l'auteur du message", async () => {
    const { group, creator, member1 } = await setupGroup();

    await sendText(creator.accessToken, group.id, "Consigne importante.");

    const memberNotifs = await request(app).get("/api/v1/notifications").set("Authorization", `Bearer ${member1.accessToken}`);
    const notif = memberNotifs.body.items.find(
      (n: { type: string; relatedEntityId: string }) => n.type === "MESSAGE_RECEIVED" && n.relatedEntityId === group.id
    );
    expect(notif).toBeDefined();
    // Le titre porte le nom du groupe et le corps rappelle qui parle : sans
    // cela une notification de groupe est indistinguable d'un message privé.
    expect(notif.title).toBe("Chantier Le Phare");
    expect(notif.body).toContain(creator.user.firstName);
    expect(notif.relatedEntityType).toBe("Conversation");

    const authorNotifs = await request(app).get("/api/v1/notifications").set("Authorization", `Bearer ${creator.accessToken}`);
    expect(
      authorNotifs.body.items.filter(
        (n: { type: string; relatedEntityId: string }) => n.type === "MESSAGE_RECEIVED" && n.relatedEntityId === group.id
      )
    ).toHaveLength(0);
  });

  it("réserve l'ajout, le retrait et le renommage aux administrateurs du groupe", async () => {
    const { group, creator, member1, member2, outsider } = await setupGroup();

    const addByMember = await request(app)
      .post(`/api/v1/messages/conversations/${group.id}/participants`)
      .set("Authorization", `Bearer ${member1.accessToken}`)
      .send({ userIds: [outsider.user.id] });
    expect(addByMember.status).toBe(403);

    const renameByMember = await request(app)
      .patch(`/api/v1/messages/conversations/${group.id}`)
      .set("Authorization", `Bearer ${member1.accessToken}`)
      .send({ title: "Renommé par un membre" });
    expect(renameByMember.status).toBe(403);

    const removeByMember = await request(app)
      .delete(`/api/v1/messages/conversations/${group.id}/participants/${member2.user.id}`)
      .set("Authorization", `Bearer ${member1.accessToken}`);
    expect(removeByMember.status).toBe(403);

    const addByAdmin = await request(app)
      .post(`/api/v1/messages/conversations/${group.id}/participants`)
      .set("Authorization", `Bearer ${creator.accessToken}`)
      .send({ userIds: [outsider.user.id] });
    expect(addByAdmin.status).toBe(200);
    expect(addByAdmin.body.conversation.participants.filter((p: { hasLeft: boolean }) => !p.hasLeft)).toHaveLength(4);

    const renameByAdmin = await request(app)
      .patch(`/api/v1/messages/conversations/${group.id}`)
      .set("Authorization", `Bearer ${creator.accessToken}`)
      .send({ title: "Le Phare — équipe" });
    expect(renameByAdmin.status).toBe(200);
    expect(renameByAdmin.body.conversation.title).toBe("Le Phare — équipe");
  });

  it("coupe l'accès de la personne retirée, sans effacer l'historique pour les autres", async () => {
    const { group, creator, member1, member2 } = await setupGroup();
    await sendText(member1.accessToken, group.id, "Message resté dans l'historique");

    const removed = await request(app)
      .delete(`/api/v1/messages/conversations/${group.id}/participants/${member1.user.id}`)
      .set("Authorization", `Bearer ${creator.accessToken}`);
    expect(removed.status).toBe(200);

    const theirList = await request(app).get("/api/v1/messages/conversations").set("Authorization", `Bearer ${member1.accessToken}`);
    expect(theirList.body.items.some((c: { id: string }) => c.id === group.id)).toBe(false);

    const theirWrite = await sendText(member1.accessToken, group.id, "je reviens");
    expect(theirWrite.status).toBe(403);

    const stillThere = await request(app)
      .get(`/api/v1/messages/conversations/${group.id}/messages`)
      .set("Authorization", `Bearer ${member2.accessToken}`);
    expect(stillThere.body.items.some((m: { body: string }) => m.body === "Message resté dans l'historique")).toBe(true);
  });

  it("laisse quitter un groupe et confie l'administration à un membre restant", async () => {
    const { group, creator, member1 } = await setupGroup();

    const left = await request(app)
      .post(`/api/v1/messages/conversations/${group.id}/leave`)
      .set("Authorization", `Bearer ${creator.accessToken}`);
    expect(left.status).toBe(204);

    const view = await request(app)
      .get(`/api/v1/messages/conversations/${group.id}`)
      .set("Authorization", `Bearer ${member1.accessToken}`);
    expect(view.status).toBe(200);
    expect(
      view.body.conversation.participants.some((p: { isAdmin: boolean; hasLeft: boolean }) => p.isAdmin && !p.hasLeft)
    ).toBe(true);
  });

  it("trace la vie du groupe dans le fil sans compter ces événements comme des messages à lire", async () => {
    const { group, creator, member1 } = await setupGroup();

    const thread = await request(app)
      .get(`/api/v1/messages/conversations/${group.id}/messages`)
      .set("Authorization", `Bearer ${member1.accessToken}`);
    const creation = thread.body.items.find((m: { systemEvent: string }) => m.systemEvent === "GROUP_CREATED");
    expect(creation).toBeDefined();
    expect(creation.body).toContain(creator.user.firstName);

    const unread = await request(app).get("/api/v1/messages/unread-count").set("Authorization", `Bearer ${member1.accessToken}`);
    expect(unread.body.unreadCount).toBe(0);
  });

  it("refuse de créer un groupe incluant un compte désactivé", async () => {
    const { accessToken } = await loginAs(Role.HR, "hr-grp3@deepclean.test");
    const { user: active } = await loginAs(Role.EMPLOYEE, "emp-grp3@deepclean.test");
    const inactive = await createTestUser({ role: Role.EMPLOYEE, email: "inactive-grp@deepclean.test", isActive: false });

    const res = await request(app)
      .post("/api/v1/messages/conversations/group")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ title: "Avec un compte désactivé", participantIds: [active.id, inactive.id] });

    expect(res.status).toBe(400);
  });
});

describe("Messagerie interne — pièces jointes", () => {
  it("permet d'envoyer une photo sans texte, servie uniquement aux membres du fil", async () => {
    const { accessToken: senderToken } = await loginAs(Role.EMPLOYEE, "emp-msg-photo1@deepclean.test");
    const { user: recipient, accessToken: recipientToken } = await loginAs(Role.EMPLOYEE, "emp-msg-photo2@deepclean.test");
    const { accessToken: outsiderToken } = await loginAs(Role.EMPLOYEE, "emp-msg-photo3@deepclean.test");

    const conversation = await openDirect(senderToken, recipient.id);
    const sent = await request(app)
      .post("/api/v1/messages")
      .set("Authorization", `Bearer ${senderToken}`)
      .field("conversationId", conversation.id)
      .attach("photo", await tinyTestPhoto(), { filename: "photo.jpg", contentType: "image/jpeg" });

    expect(sent.status).toBe(201);
    expect(sent.body.message.hasPhoto).toBe(true);
    expect(sent.body.message.photoKey).toBeUndefined();

    const photo = await request(app)
      .get(`/api/v1/messages/${sent.body.message.id}/photo`)
      .set("Authorization", `Bearer ${recipientToken}`);
    expect(photo.status).toBe(200);
    expect(photo.headers["content-type"]).toContain("image/jpeg");

    const outsider = await request(app)
      .get(`/api/v1/messages/${sent.body.message.id}/photo`)
      .set("Authorization", `Bearer ${outsiderToken}`);
    expect(outsider.status).toBe(404);
  });

  it("partage un document PDF dans un groupe, téléchargeable par les seuls membres", async () => {
    const creator = await loginAs(Role.SUPERVISOR, "sup-doc@deepclean.test");
    const member = await loginAs(Role.EMPLOYEE, "emp-doc1@deepclean.test");
    const member2 = await loginAs(Role.EMPLOYEE, "emp-doc2@deepclean.test");
    const outsider = await loginAs(Role.EMPLOYEE, "out-doc@deepclean.test");

    const group = (
      await request(app)
        .post("/api/v1/messages/conversations/group")
        .set("Authorization", `Bearer ${creator.accessToken}`)
        .send({ title: "Consignes", participantIds: [member.user.id, member2.user.id] })
    ).body.conversation;

    const sent = await request(app)
      .post("/api/v1/messages")
      .set("Authorization", `Bearer ${creator.accessToken}`)
      .field("conversationId", group.id)
      .field("body", "Les consignes de sécurité")
      .attach("document", tinyTestPdf(), { filename: "Consignes.pdf", contentType: "application/pdf" });

    expect(sent.status).toBe(201);
    expect(sent.body.message.document.name).toBe("Consignes.pdf");
    expect(sent.body.message.document.sizeBytes).toBeGreaterThan(0);
    expect(sent.body.message.documentKey).toBeUndefined();

    const download = await request(app)
      .get(`/api/v1/messages/${sent.body.message.id}/document`)
      .set("Authorization", `Bearer ${member.accessToken}`);
    expect(download.status).toBe(200);
    expect(download.headers["content-type"]).toContain("application/pdf");

    const refused = await request(app)
      .get(`/api/v1/messages/${sent.body.message.id}/document`)
      .set("Authorization", `Bearer ${outsider.accessToken}`);
    expect(refused.status).toBe(404);

    const anonymous = await request(app).get(`/api/v1/messages/${sent.body.message.id}/document`);
    expect(anonymous.status).toBe(401);
  });

  it("refuse un fichier qui n'est pas réellement un PDF malgré un type déclaré valide", async () => {
    const { accessToken } = await loginAs(Role.EMPLOYEE, "emp-doc3@deepclean.test");
    const { user: other } = await loginAs(Role.EMPLOYEE, "emp-doc4@deepclean.test");
    const conversation = await openDirect(accessToken, other.id);

    const res = await request(app)
      .post("/api/v1/messages")
      .set("Authorization", `Bearer ${accessToken}`)
      .field("conversationId", conversation.id)
      .attach("document", Buffer.from("MZ ceci est un exécutable"), {
        filename: "piege.pdf",
        contentType: "application/pdf",
      });

    expect(res.status).toBe(400);
  });

  it("refuse un message sans texte ni pièce jointe", async () => {
    const { accessToken } = await loginAs(Role.EMPLOYEE, "emp-msg-empty@deepclean.test");
    const { user: recipient } = await loginAs(Role.EMPLOYEE, "emp-msg-empty2@deepclean.test");
    const conversation = await openDirect(accessToken, recipient.id);

    const res = await request(app)
      .post("/api/v1/messages")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ conversationId: conversation.id });

    expect(res.status).toBe(400);
  });
});

describe("Messagerie interne — reprise des fils d'avant les groupes", () => {
  it("regroupe les anciens messages par couple, reconstitue l'état de lecture et redirige les notifications", async () => {
    const { user: a, accessToken: tokenA } = await loginAs(Role.EMPLOYEE, "legacy-a@deepclean.test");
    const { user: b, accessToken: tokenB } = await loginAs(Role.HR, "legacy-b@deepclean.test");

    // Messages écrits comme avant les conversations : un destinataire porté
    // par le message lui-même, aucun fil en base.
    const lu = await prisma.message.create({
      data: { senderId: b.id, recipientId: a.id, body: "Ancien message déjà lu", isRead: true, readAt: new Date() },
    });
    await prisma.message.create({
      data: { senderId: b.id, recipientId: a.id, body: "Ancien message non lu", isRead: false },
    });
    await prisma.message.create({ data: { senderId: a.id, recipientId: b.id, body: "Ma réponse d'alors" } });
    // Notification d'époque : elle pointait vers l'EXPÉDITEUR, pas vers un fil.
    await prisma.notification.create({
      data: {
        userId: a.id,
        type: "MESSAGE_RECEIVED",
        title: "Ancien",
        body: "Ancien message non lu",
        relatedEntityType: "Conversation",
        relatedEntityId: b.id,
      },
    });

    const result = await migrateMessagesToConversations(prisma);
    expect(result.conversationsCreated).toBe(1);
    expect(result.messagesLinked).toBe(3);

    const list = await request(app).get("/api/v1/messages/conversations").set("Authorization", `Bearer ${tokenA}`);
    expect(list.body.items).toHaveLength(1);
    const conversation = list.body.items[0];
    expect(conversation.isGroup).toBe(false);
    expect(conversation.otherUser.id).toBe(b.id);
    // Le message déjà lu reste lu, le non-lu reste non lu.
    expect(conversation.unreadCount).toBe(1);

    const thread = await request(app)
      .get(`/api/v1/messages/conversations/${conversation.id}/messages`)
      .set("Authorization", `Bearer ${tokenB}`);
    expect(thread.body.items).toHaveLength(3);

    const notifications = await request(app).get("/api/v1/notifications").set("Authorization", `Bearer ${tokenA}`);
    const migrated = notifications.body.items.find((n: { title: string }) => n.title === "Ancien");
    expect(migrated.relatedEntityId).toBe(conversation.id);

    // Idempotence : un second passage ne recrée rien et ne duplique rien.
    const second = await migrateMessagesToConversations(prisma);
    expect(second.conversationsCreated).toBe(0);
    expect(second.messagesLinked).toBe(0);
    void lu;
  });
});
