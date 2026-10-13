import request from "supertest";
import { Role } from "@prisma/client";
import { createApp } from "../src/app";
import { prisma } from "../src/db/prisma";
import { ingestInboundEmail, InboundEmail } from "../src/modules/quoteReplies/quoteReplies.service";
import { runQuoteReminders } from "../src/modules/automations/automations.service";
import { createTestUser, resetDatabase, TEST_PASSWORD } from "./helpers";

const app = createApp();

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

const CLIENT_EMAIL = "marie@boulangerie-martin.test";

async function loginAs(role: Role, email: string) {
  const user = await createTestUser({ role, email });
  const login = await request(app).post("/api/v1/auth/login").send({ username: user.username, password: TEST_PASSWORD });
  return { user, token: login.body.accessToken as string };
}

// Devis créé, validé puis envoyé au client par l'application (statut SENT).
async function sentQuote(token: string) {
  const client = await request(app)
    .post("/api/v1/clients")
    .set("Authorization", `Bearer ${token}`)
    .send({ companyName: "Boulangerie Martin", email: CLIENT_EMAIL });
  const created = await request(app)
    .post("/api/v1/quotes")
    .set("Authorization", `Bearer ${token}`)
    .send({ clientId: client.body.client.id, items: [{ description: "Nettoyage du magasin", quantity: 1, unit: "FLAT_RATE", unitPriceHt: 350 }] });
  const id = created.body.quote.id as string;
  await request(app).post(`/api/v1/quotes/${id}/validate`).set("Authorization", `Bearer ${token}`);
  const sent = await request(app).post(`/api/v1/quotes/${id}/send`).set("Authorization", `Bearer ${token}`).send({});
  expect(sent.body.quote.status).toBe("SENT");
  return { id, number: created.body.quote.quoteNumber as string };
}

function reply(overrides: Partial<InboundEmail> & { text: string }): InboundEmail {
  return {
    messageId: `<${Math.random().toString(36).slice(2)}@mail.test>`,
    fromEmail: CLIENT_EMAIL,
    fromName: "Marie Martin",
    subject: null,
    date: new Date(),
    ...overrides,
  };
}

describe("Réponses des clients aux devis — réception", () => {
  it("enregistre une réponse positive, prévient le commercial et la direction, sans toucher au statut du devis", async () => {
    const { user: hr, token } = await loginAs(Role.HR, "hr-reply1@deepclean.test");
    const director = await createTestUser({ role: Role.DIRECTOR, email: "dir-reply1@deepclean.test" });
    const quote = await sentQuote(token);

    const result = await ingestInboundEmail(
      reply({
        subject: `Re: Devis ${quote.number} — Boulangerie Martin`,
        text: `C'est bon pour moi !\n\nLe lun. 13 oct. 2026, Deep Clean a écrit :\n> Veuillez trouver ci-joint notre devis ${quote.number}.`,
      })
    );
    expect(result).toBe("recorded");

    const saved = await prisma.quoteReply.findFirstOrThrow({ where: { quoteId: quote.id } });
    expect(saved.intent).toBe("POSITIVE");
    expect(saved.status).toBe("PENDING");
    expect(saved.replyText).toBe("C'est bon pour moi !");
    expect(saved.senderMatchesContact).toBe(true);

    const stillSent = await prisma.quote.findUniqueOrThrow({ where: { id: quote.id } });
    expect(stillSent.status).toBe("SENT");

    for (const userId of [hr.id, director.id]) {
      const notif = await prisma.notification.findFirst({ where: { userId, title: `Devis ${quote.number} : réponse positive` } });
      expect(notif?.body).toContain("semble accepter");
      expect(notif?.relatedEntityId).toBe(quote.id);
    }
  });

  it("n'enregistre et ne notifie jamais deux fois le même email", async () => {
    const { user: hr, token } = await loginAs(Role.HR, "hr-reply2@deepclean.test");
    const quote = await sentQuote(token);
    const email = reply({ subject: `Re: Devis ${quote.number}`, text: "Non merci." });

    expect(await ingestInboundEmail(email)).toBe("recorded");
    expect(await ingestInboundEmail(email)).toBe("duplicate");
    expect(await prisma.quoteReply.count()).toBe(1);
    expect(await prisma.notification.count({ where: { userId: hr.id, title: { contains: "réponse négative" } } })).toBe(1);
  });

  it("retrouve le devis par l'adresse du client quand le numéro n'est pas cité", async () => {
    const { token } = await loginAs(Role.HR, "hr-reply3@deepclean.test");
    const quote = await sentQuote(token);
    expect(await ingestInboundEmail(reply({ subject: "Votre proposition", text: "Ok pour nous." }))).toBe("recorded");
    const saved = await prisma.quoteReply.findFirstOrThrow({ where: { quoteId: quote.id } });
    expect(saved.intent).toBe("POSITIVE");
  });

  it("signale un expéditeur qui n'est pas le contact du devis", async () => {
    const { token } = await loginAs(Role.HR, "hr-reply4@deepclean.test");
    const quote = await sentQuote(token);
    await ingestInboundEmail(reply({ fromEmail: "inconnu@ailleurs.test", subject: `Re: Devis ${quote.number}`, text: "Bon pour accord" }));
    const saved = await prisma.quoteReply.findFirstOrThrow({ where: { quoteId: quote.id } });
    expect(saved.senderMatchesContact).toBe(false);
  });

  it("ignore les réponses automatiques et les emails sans lien avec un devis", async () => {
    const { token } = await loginAs(Role.HR, "hr-reply5@deepclean.test");
    const quote = await sentQuote(token);
    expect(await ingestInboundEmail(reply({ subject: `Réponse automatique : Devis ${quote.number}`, text: "Je suis absente jusqu'au 20." }))).toBe("ignored");
    expect(await ingestInboundEmail(reply({ isAutoReply: true, subject: `Re: Devis ${quote.number}`, text: "Message reçu." }))).toBe("ignored");
    expect(await ingestInboundEmail(reply({ fromEmail: "pub@newsletter.test", subject: "Promotions d'octobre", text: "-50 % sur tout" }))).toBe("ignored");
    expect(await prisma.quoteReply.count()).toBe(0);
  });

  it("ignore une réponse sur un devis déjà accepté ou encore en brouillon", async () => {
    const { token } = await loginAs(Role.HR, "hr-reply6@deepclean.test");
    const quote = await sentQuote(token);
    await prisma.quote.update({ where: { id: quote.id }, data: { status: "ACCEPTED" } });
    expect(await ingestInboundEmail(reply({ subject: `Re: Devis ${quote.number}`, text: "Merci !" }))).toBe("ignored");
  });
});

describe("Réponses des clients aux devis — confirmation en un clic", () => {
  async function pendingReply(token: string, text: string) {
    const quote = await sentQuote(token);
    await ingestInboundEmail(reply({ subject: `Re: Devis ${quote.number}`, text }));
    const list = await request(app).get(`/api/v1/quotes/${quote.id}/replies`).set("Authorization", `Bearer ${token}`);
    expect(list.status).toBe(200);
    return { quote, replyId: list.body.items[0].id as string };
  }

  it("« Accepté » fait passer le devis en accepté, par email, et traite la réponse", async () => {
    const { user, token } = await loginAs(Role.HR, "hr-decide1@deepclean.test");
    const { quote, replyId } = await pendingReply(token, "Bon pour accord.");

    const res = await request(app).post(`/api/v1/quotes/replies/${replyId}/decision`).set("Authorization", `Bearer ${token}`).send({ decision: "ACCEPT" });
    expect(res.status).toBe(200);
    expect(res.body.quote.status).toBe("ACCEPTED");
    expect(res.body.quote.acceptedMethod).toBe("EMAIL");
    expect(res.body.quote.acceptedComment).toContain(CLIENT_EMAIL);

    const saved = await prisma.quoteReply.findUniqueOrThrow({ where: { id: replyId } });
    expect(saved.status).toBe("ACCEPTED");
    expect(saved.handledById).toBe(user.id);
    expect(await prisma.quote.findUniqueOrThrow({ where: { id: quote.id } })).toMatchObject({ status: "ACCEPTED" });
  });

  it("« Refusé » fait passer le devis en refusé", async () => {
    const { token } = await loginAs(Role.HR, "hr-decide2@deepclean.test");
    const { replyId } = await pendingReply(token, "Trop cher pour nous.");
    const res = await request(app).post(`/api/v1/quotes/replies/${replyId}/decision`).set("Authorization", `Bearer ${token}`).send({ decision: "REJECT" });
    expect(res.body.quote.status).toBe("REJECTED");
  });

  it("« Ignorer » ne change rien au devis, et une réponse ne se traite qu'une fois", async () => {
    const { token } = await loginAs(Role.HR, "hr-decide3@deepclean.test");
    const { quote, replyId } = await pendingReply(token, "J'ai une question sur la ligne 2.");
    const first = await request(app).post(`/api/v1/quotes/replies/${replyId}/decision`).set("Authorization", `Bearer ${token}`).send({ decision: "DISMISS" });
    expect(first.body.quote.status).toBe("SENT");
    const again = await request(app).post(`/api/v1/quotes/replies/${replyId}/decision`).set("Authorization", `Bearer ${token}`).send({ decision: "ACCEPT" });
    expect(again.status).toBe(409);
    expect(await prisma.quote.findUniqueOrThrow({ where: { id: quote.id } })).toMatchObject({ status: "SENT" });
  });

  it("refuse la décision à un employé, et à un superviseur sur le devis d'un autre", async () => {
    const { token } = await loginAs(Role.HR, "hr-decide4@deepclean.test");
    const { replyId } = await pendingReply(token, "Ok pour moi");
    const { token: employeeToken } = await loginAs(Role.EMPLOYEE, "emp-decide4@deepclean.test");
    const { token: supervisorToken } = await loginAs(Role.SUPERVISOR, "sup-decide4@deepclean.test");

    const byEmployee = await request(app).post(`/api/v1/quotes/replies/${replyId}/decision`).set("Authorization", `Bearer ${employeeToken}`).send({ decision: "ACCEPT" });
    expect(byEmployee.status).toBe(403);
    const bySupervisor = await request(app).post(`/api/v1/quotes/replies/${replyId}/decision`).set("Authorization", `Bearer ${supervisorToken}`).send({ decision: "ACCEPT" });
    expect(bySupervisor.status).toBe(404);
  });
});

describe("Relance prête à envoyer en un clic", () => {
  it("propose un mail de relance rédigé, puis l'envoie et passe le devis en « relance en cours »", async () => {
    const { token } = await loginAs(Role.HR, "hr-relance1@deepclean.test");
    const quote = await sentQuote(token);

    const draft = await request(app).get(`/api/v1/quotes/${quote.id}/follow-up-email`).set("Authorization", `Bearer ${token}`);
    expect(draft.status).toBe(200);
    expect(draft.body.draft.to).toBe(CLIENT_EMAIL);
    expect(draft.body.draft.subject).toContain(quote.number);
    expect(draft.body.draft.text).toContain(`notre devis ${quote.number}`);

    const sent = await request(app).post(`/api/v1/quotes/${quote.id}/follow-up-email`).set("Authorization", `Bearer ${token}`).send({ text: draft.body.draft.text });
    expect(sent.status).toBe(200);
    expect(sent.body.quote.status).toBe("FOLLOW_UP");
    const event = await prisma.quoteEvent.findFirst({ where: { quoteId: quote.id, action: "FOLLOW_UP" } });
    expect(event?.method).toBe("EMAIL");
  });

  it("refuse la relance d'un devis qui n'a pas encore été envoyé", async () => {
    const { token } = await loginAs(Role.HR, "hr-relance2@deepclean.test");
    const client = await request(app).post("/api/v1/clients").set("Authorization", `Bearer ${token}`).send({ companyName: "ABC", email: "abc@abc.test" });
    const created = await request(app)
      .post("/api/v1/quotes")
      .set("Authorization", `Bearer ${token}`)
      .send({ clientId: client.body.client.id, items: [{ description: "x", quantity: 1, unit: "FLAT_RATE", unitPriceHt: 10 }] });
    const res = await request(app).get(`/api/v1/quotes/${created.body.quote.id}/follow-up-email`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(409);
  });

  it("ne rappelle pas de relancer tant qu'une réponse du client attend une décision", async () => {
    const { user, token } = await loginAs(Role.HR, "hr-relance3@deepclean.test");
    const quote = await sentQuote(token);
    await ingestInboundEmail(reply({ subject: `Re: Devis ${quote.number}`, text: "Je reviens vers vous." }));
    const t0 = (await prisma.quote.findUniqueOrThrow({ where: { id: quote.id } })).updatedAt.getTime();

    await runQuoteReminders(new Date(t0 + 7.5 * 24 * 3600_000));
    expect(await prisma.notification.count({ where: { userId: user.id, title: "Devis sans réponse" } })).toBe(0);

    await prisma.quoteReply.updateMany({ data: { status: "DISMISSED" } });
    await runQuoteReminders(new Date(t0 + 7.5 * 24 * 3600_000));
    const reminder = await prisma.notification.findFirst({ where: { userId: user.id, title: "Devis sans réponse" } });
    expect(reminder?.body).toContain("le mail de relance est prêt");
  });
});

describe("Boîte mail — état", () => {
  it("indique que la lecture n'est pas configurée sans identifiants IMAP", async () => {
    const { token } = await loginAs(Role.HR, "hr-inbox1@deepclean.test");
    const res = await request(app).get("/api/v1/quotes/inbox/status").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.inbox.configured).toBe(false);
    const sync = await request(app).post("/api/v1/quotes/inbox/sync").set("Authorization", `Bearer ${token}`);
    expect(sync.status).toBe(400);
  });
});
