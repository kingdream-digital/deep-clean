import request from "supertest";
import { Role } from "@prisma/client";
import { createApp } from "../src/app";
import { prisma } from "../src/db/prisma";
import { ingestInboundEmail } from "../src/modules/quoteReplies/quoteReplies.service";
import { createTestSite, createTestUser, resetDatabase, TEST_PASSWORD } from "./helpers";

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

function inDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

const SIGNATURE = { width: 300, height: 150, strokes: [[10, 10, 60, 80, 120, 30]] };

async function validatedQuote(token: string, email = "client@client.test") {
  const client = await request(app).post("/api/v1/clients").set("Authorization", `Bearer ${token}`).send({ companyName: "Client", email });
  const quote = await request(app)
    .post("/api/v1/quotes")
    .set("Authorization", `Bearer ${token}`)
    .send({ clientId: client.body.client.id, items: [{ description: "x", quantity: 1, unit: "FLAT_RATE", unitPriceHt: 100 }] });
  await request(app).post(`/api/v1/quotes/${quote.body.quote.id}/validate`).set("Authorization", `Bearer ${token}`);
  return quote.body.quote as { id: string; quoteNumber: string };
}

// Cas trouvés par le test de charge « deux actions à la même seconde ».
describe("Actions simultanées — une seule doit gagner", () => {
  it("deux superviseurs n'affectent jamais le même employé sur deux missions qui se chevauchent", async () => {
    const { token: t1 } = await loginAs(Role.SUPERVISOR, "sup-a@deepclean.test");
    const { token: t2 } = await loginAs(Role.SUPERVISOR, "sup-b@deepclean.test");
    const employee = await createTestUser({ role: Role.EMPLOYEE, email: "emp-race@deepclean.test" });
    const site = await createTestSite();
    const body = (title: string) => ({ siteId: site.id, title, date: inDays(2), startTime: "14:00", endTime: "16:00", assigneeIds: [employee.id] });

    // Six créations simultanées (deux superviseurs, trois clics chacun).
    const results = await Promise.all(
      ["A", "B", "C", "D", "E", "F"].map((k, i) =>
        request(app).post("/api/v1/missions").set("Authorization", `Bearer ${i % 2 ? t2 : t1}`).send(body(`Mission ${k}`))
      )
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(5);
    expect(await prisma.missionAssignment.count({ where: { userId: employee.id } })).toBe(1);
  });

  it("deux RH qui tranchent la même absence en sens contraire : une seule décision est retenue", async () => {
    const { token: hr1 } = await loginAs(Role.HR, "rh-a@deepclean.test");
    const { token: hr2 } = await loginAs(Role.HR, "rh-b@deepclean.test");
    const { token: emp } = await loginAs(Role.EMPLOYEE, "emp-abs@deepclean.test");
    const absence = await request(app).post("/api/v1/absences").set("Authorization", `Bearer ${emp}`).send({ type: "UNPAID_LEAVE", startDate: inDays(40), endDate: inDays(41) });
    const id = absence.body.absence.id as string;

    const results = await Promise.all([
      request(app).post(`/api/v1/absences/${id}/decide`).set("Authorization", `Bearer ${hr1}`).send({ status: "APPROVED" }),
      request(app).post(`/api/v1/absences/${id}/decide`).set("Authorization", `Bearer ${hr2}`).send({ status: "REJECTED" }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const winner = results.find((r) => r.status === 200)!.body.absence.status;
    expect((await prisma.absence.findUniqueOrThrow({ where: { id } })).status).toBe(winner);
  });

  it("un double appui sur « Valider la signature » ne signe le devis qu'une fois", async () => {
    const { token } = await loginAs(Role.HR, "rh-sign@deepclean.test");
    const quote = await validatedQuote(token);
    const results = await Promise.all(
      ["Signataire A", "Signataire B"].map((signerName) =>
        request(app).post(`/api/v1/quotes/${quote.id}/sign`).set("Authorization", `Bearer ${token}`).send({ signerName, signature: SIGNATURE })
      )
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await prisma.quoteEvent.count({ where: { quoteId: quote.id, action: "ACCEPTED" } })).toBe(1);
    const winner = results.find((r) => r.status === 200)!.body.quote.signedByName;
    expect((await prisma.quote.findUniqueOrThrow({ where: { id: quote.id } })).signedByName).toBe(winner);
  });

  it("« Accepté » et « Refusé » cliqués en même temps sur une réponse client : une seule décision, cohérente", async () => {
    const { token: hr } = await loginAs(Role.HR, "rh-rep@deepclean.test");
    const { token: dir } = await loginAs(Role.DIRECTOR, "dir-rep@deepclean.test");
    const quote = await validatedQuote(hr, "rep@client.test");
    await request(app).post(`/api/v1/quotes/${quote.id}/send`).set("Authorization", `Bearer ${hr}`).send({});
    await ingestInboundEmail({ messageId: "<course@client.test>", fromEmail: "rep@client.test", fromName: null, subject: `Re: Devis ${quote.quoteNumber}`, text: "Ok pour nous", date: new Date() });
    const reply = await prisma.quoteReply.findFirstOrThrow({ where: { quoteId: quote.id } });

    const results = await Promise.all([
      request(app).post(`/api/v1/quotes/replies/${reply.id}/decision`).set("Authorization", `Bearer ${dir}`).send({ decision: "ACCEPT" }),
      request(app).post(`/api/v1/quotes/replies/${reply.id}/decision`).set("Authorization", `Bearer ${hr}`).send({ decision: "REJECT" }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const finalQuote = await prisma.quote.findUniqueOrThrow({ where: { id: quote.id } });
    const finalReply = await prisma.quoteReply.findUniqueOrThrow({ where: { id: reply.id } });
    expect(finalReply.status).toBe(finalQuote.status);
    expect(await prisma.quoteEvent.count({ where: { quoteId: quote.id, action: { in: ["ACCEPTED", "REJECTED"] } } })).toBe(1);
  });

  it("un double appui sur « Envoyer par email » n'envoie le devis qu'une fois", async () => {
    const { token } = await loginAs(Role.HR, "rh-send@deepclean.test");
    const quote = await validatedQuote(token);
    const results = await Promise.all([1, 2].map(() => request(app).post(`/api/v1/quotes/${quote.id}/send`).set("Authorization", `Bearer ${token}`).send({})));
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await prisma.quoteEvent.count({ where: { quoteId: quote.id, action: "SENT" } })).toBe(1);
  });
});
