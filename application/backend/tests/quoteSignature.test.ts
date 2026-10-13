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

// Tracé de signature réaliste : deux traits dans une zone de 300 × 150.
const SIGNATURE = {
  width: 300,
  height: 150,
  strokes: [
    [20, 100, 40, 60, 60, 110, 80, 50, 100, 105],
    [130, 80, 180, 82, 230, 78],
  ],
};

async function createQuote(token: string, opts: { validate?: boolean; email?: string | null } = {}) {
  const client = await request(app)
    .post("/api/v1/clients")
    .set("Authorization", `Bearer ${token}`)
    .send({ companyName: "Entreprise ABC", ...(opts.email === null ? {} : { email: opts.email ?? "contact@abc.test" }) });
  const quote = await request(app)
    .post("/api/v1/quotes")
    .set("Authorization", `Bearer ${token}`)
    .send({ clientId: client.body.client.id, items: [{ description: "Nettoyage bureaux", quantity: 1, unit: "FLAT_RATE", unitPriceHt: 200 }] });
  const id = quote.body.quote.id as string;
  if (opts.validate !== false) {
    const validated = await request(app).post(`/api/v1/quotes/${id}/validate`).set("Authorization", `Bearer ${token}`);
    expect(validated.status).toBe(200);
  }
  return id;
}

describe("Devis — signature du client sur place", () => {
  it("fait passer un devis validé en « Accepté » et conserve qui, quand et comment", async () => {
    const { user, accessToken } = await loginAs(Role.HR, "hr-sign1@deepclean.test");
    const quoteId = await createQuote(accessToken);

    const res = await request(app)
      .post(`/api/v1/quotes/${quoteId}/sign`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ signerName: "Marie Dupont", signature: SIGNATURE, consent: true });

    expect(res.status).toBe(200);
    expect(res.body.quote.status).toBe("ACCEPTED");
    expect(res.body.quote.signedByName).toBe("Marie Dupont");
    expect(res.body.quote.signedAt).toBeTruthy();
    expect(res.body.quote.acceptedMethod).toBe("MEETING");
    expect(res.body.quote.acceptedBy.id).toBe(user.id);
    expect(res.body.copySentTo).toBeNull();

    const events = await prisma.quoteEvent.findMany({ where: { quoteId, action: "ACCEPTED" } });
    expect(events).toHaveLength(1);
    expect(events[0]!.comment).toBe("Signé sur place par Marie Dupont");

    const log = await prisma.activityLog.findFirst({ where: { action: "QUOTE_SIGNED", entityId: quoteId } });
    expect(log).not.toBeNull();
  });

  it("refuse de signer sans la case « J'accepte la signature électronique », puis conserve le texte accepté et l'empreinte", async () => {
    const { accessToken } = await loginAs(Role.HR, "hr-sign-consent@deepclean.test");
    const quoteId = await createQuote(accessToken);

    for (const consent of [undefined, false, "true"]) {
      const refused = await request(app)
        .post(`/api/v1/quotes/${quoteId}/sign`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ signerName: "Marie Dupont", signature: SIGNATURE, ...(consent === undefined ? {} : { consent }) });
      expect(refused.status).toBe(400);
    }
    expect((await prisma.quote.findUniqueOrThrow({ where: { id: quoteId } })).status).toBe("VALIDATED");

    const res = await request(app)
      .post(`/api/v1/quotes/${quoteId}/sign`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ signerName: "Marie Dupont", signature: SIGNATURE, consent: true });
    expect(res.status).toBe(200);
    const stored = await prisma.quote.findUniqueOrThrow({ where: { id: quoteId } });
    expect(stored.signatureConsentText).toContain("J'accepte de signer électroniquement le devis");
    expect(stored.signatureConsentText).toContain(stored.quoteNumber);
    expect(stored.signatureFingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  it("appose la signature dans le PDF du devis", async () => {
    const { accessToken } = await loginAs(Role.HR, "hr-sign2@deepclean.test");
    const quoteId = await createQuote(accessToken);
    const before = await request(app).get(`/api/v1/quotes/${quoteId}/pdf`).set("Authorization", `Bearer ${accessToken}`).buffer(true);

    await request(app)
      .post(`/api/v1/quotes/${quoteId}/sign`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ signerName: "Marie Dupont", signature: SIGNATURE, consent: true });

    const after = await request(app).get(`/api/v1/quotes/${quoteId}/pdf`).set("Authorization", `Bearer ${accessToken}`).buffer(true);
    expect(after.status).toBe(200);
    expect((after.body as Buffer).subarray(0, 5).toString()).toBe("%PDF-");
    expect((after.body as Buffer).equals(before.body as Buffer)).toBe(false);
  });

  it("permet de signer un devis déjà envoyé par email", async () => {
    const { accessToken } = await loginAs(Role.HR, "hr-sign3@deepclean.test");
    const quoteId = await createQuote(accessToken);
    const sent = await request(app).post(`/api/v1/quotes/${quoteId}/send`).set("Authorization", `Bearer ${accessToken}`).send({});
    expect(sent.status).toBe(200);

    const res = await request(app)
      .post(`/api/v1/quotes/${quoteId}/sign`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ signerName: "Marie Dupont", signature: SIGNATURE, consent: true });
    expect(res.status).toBe(200);
    expect(res.body.quote.status).toBe("ACCEPTED");
  });

  it("envoie au client une copie du devis signé quand c'est demandé", async () => {
    const { accessToken } = await loginAs(Role.HR, "hr-sign4@deepclean.test");
    const quoteId = await createQuote(accessToken);

    const res = await request(app)
      .post(`/api/v1/quotes/${quoteId}/sign`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ signerName: "Marie Dupont", signature: SIGNATURE, consent: true, sendCopy: true });

    expect(res.status).toBe(200);
    expect(res.body.copySentTo).toBe("contact@abc.test");
    expect(res.body.copyError).toBeNull();
  });

  it("garde la signature mais le signale si le client n'a pas d'email pour la copie", async () => {
    const { accessToken } = await loginAs(Role.HR, "hr-sign5@deepclean.test");
    const quoteId = await createQuote(accessToken, { email: null });

    const res = await request(app)
      .post(`/api/v1/quotes/${quoteId}/sign`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ signerName: "Marie Dupont", signature: SIGNATURE, consent: true, sendCopy: true });

    expect(res.status).toBe(200);
    expect(res.body.quote.status).toBe("ACCEPTED");
    expect(res.body.copySentTo).toBeNull();
    expect(res.body.copyError).toMatch(/Aucune adresse email/);
  });

  it("refuse de faire signer un devis encore en brouillon", async () => {
    const { accessToken } = await loginAs(Role.HR, "hr-sign6@deepclean.test");
    const quoteId = await createQuote(accessToken, { validate: false });

    const res = await request(app)
      .post(`/api/v1/quotes/${quoteId}/sign`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ signerName: "Marie Dupont", signature: SIGNATURE, consent: true });
    expect(res.status).toBe(409);
  });

  it("refuse de signer deux fois le même devis", async () => {
    const { accessToken } = await loginAs(Role.HR, "hr-sign7@deepclean.test");
    const quoteId = await createQuote(accessToken);
    const payload = { signerName: "Marie Dupont", signature: SIGNATURE, consent: true };

    await request(app).post(`/api/v1/quotes/${quoteId}/sign`).set("Authorization", `Bearer ${accessToken}`).send(payload);
    const second = await request(app).post(`/api/v1/quotes/${quoteId}/sign`).set("Authorization", `Bearer ${accessToken}`).send(payload);
    expect(second.status).toBe(409);
  });

  it("refuse une signature vide ou sans nom de signataire", async () => {
    const { accessToken } = await loginAs(Role.HR, "hr-sign8@deepclean.test");
    const quoteId = await createQuote(accessToken);

    const empty = await request(app)
      .post(`/api/v1/quotes/${quoteId}/sign`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ signerName: "Marie Dupont", signature: { width: 300, height: 150, strokes: [] }, consent: true });
    expect(empty.status).toBe(400);

    const noName = await request(app)
      .post(`/api/v1/quotes/${quoteId}/sign`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ signerName: "  ", signature: SIGNATURE, consent: true });
    expect(noName.status).toBe(400);

    const quote = await prisma.quote.findUniqueOrThrow({ where: { id: quoteId } });
    expect(quote.status).toBe("VALIDATED");
  });

  it("refuse à un employé de faire signer un devis", async () => {
    const { accessToken: hrToken } = await loginAs(Role.HR, "hr-sign9@deepclean.test");
    const quoteId = await createQuote(hrToken);
    const { accessToken } = await loginAs(Role.EMPLOYEE, "emp-sign9@deepclean.test");

    const res = await request(app)
      .post(`/api/v1/quotes/${quoteId}/sign`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ signerName: "Marie Dupont", signature: SIGNATURE, consent: true });
    expect(res.status).toBe(403);
  });

  it("une nouvelle version d'un devis signé repart sans signature", async () => {
    const { accessToken } = await loginAs(Role.HR, "hr-sign10@deepclean.test");
    const quoteId = await createQuote(accessToken);
    await request(app)
      .post(`/api/v1/quotes/${quoteId}/sign`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ signerName: "Marie Dupont", signature: SIGNATURE, consent: true });

    const version = await request(app).post(`/api/v1/quotes/${quoteId}/versions`).set("Authorization", `Bearer ${accessToken}`);
    expect(version.status).toBe(201);
    expect(version.body.quote.status).toBe("DRAFT");
    expect(version.body.quote.signedAt).toBeNull();
    expect(version.body.quote.signatureStrokes).toBeNull();
  });
});
