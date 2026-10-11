import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { api, createClient, createMember, createTestOrg, sampleLines, testApp, type TestOrg } from "./helpers.ts";
import { testOutbox } from "../src/lib/mailer.ts";
import { deliverQueuedEmail } from "../src/modules/email/email.service.ts";
import { withTenant } from "../src/lib/db.ts";

/**
 * Identité visuelle propre à chaque entreprise cliente : son logo et sa
 * couleur sur ses devis, factures, PDF et emails — et seulement les siens.
 */
let app: FastifyInstance;
let org: TestOrg;
let other: TestOrg;
let client: { id: string };

beforeAll(async () => {
  app = await testApp();
  org = await createTestOrg(app, "marque");
  other = await createTestOrg(app, "marque-autre");
  client = await createClient(app, org.admin.token);
});
afterAll(async () => app.close());

const png = (color: string) =>
  sharp({ create: { width: 240, height: 90, channels: 3, background: color } })
    .png()
    .toBuffer();

async function uploadLogo(token: string, file: Buffer, filename = "logo.png", type = "image/png") {
  const boundary = `----aussitot${Date.now()}`;
  const payload = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${type}\r\n\r\n`),
    file,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return app.inject({
    method: "PUT",
    url: "/v1/organization/logo",
    payload,
    headers: { authorization: `Bearer ${token}`, "content-type": `multipart/form-data; boundary=${boundary}` },
  });
}

/** Le PDF contient-il une image (le logo) ? */
const hasImage = (pdf: Buffer) => pdf.includes("/Subtype /Image");

async function flushEmails(orgId: string): Promise<void> {
  const queued = await withTenant(orgId, (tx) => tx.emailOutbox.findMany({ where: { status: "QUEUED" } }));
  for (const email of queued) await deliverQueuedEmail(orgId, email.id, 1, 6);
}

describe("identité visuelle de chaque entreprise", () => {
  it("met le logo de l'entreprise sur ses PDF et ses emails, et le conserve sur les factures déjà émises", async () => {
    const admin = api(app, org.admin.token);
    const first = await uploadLogo(org.admin.token, await png("#0E7490"));
    expect(first.statusCode).toBe(200);
    expect(first.json().hasLogo).toBe(true);
    const firstVersion = first.json().logoVersion as string;
    expect(firstVersion).toBeTruthy();
    // Sa couleur est proposée pour les documents.
    expect(first.json().logoColor).toBe("#0E7490");

    // Facture émise avec ce logo.
    const invoice = (await admin.post("/v1/invoices", { clientId: client.id, lines: sampleLines })).json();
    expect((await admin.post(`/v1/invoices/${invoice.id}/issue`)).statusCode).toBe(200);
    const issuedPdf = await admin.get(`/v1/invoices/${invoice.id}/pdf`);
    expect(issuedPdf.statusCode).toBe(200);
    expect(hasImage(issuedPdf.rawPayload)).toBe(true);

    // L'email au client porte le logo, intégré (pas de lien vers un fichier public).
    const quote = (await admin.post("/v1/quotes", { clientId: client.id, lines: sampleLines })).json();
    expect((await admin.post(`/v1/quotes/${quote.id}/send`, {})).statusCode).toBe(200);
    testOutbox.length = 0;
    await flushEmails(org.orgId);
    const mail = testOutbox.at(-1)!;
    expect(mail.html).toContain("cid:logo@aussitot");
    expect(mail.attachments?.some((a) => a.cid === "logo@aussitot" && a.contentType === "image/png")).toBe(true);

    // Nouveau logo, puis plus de logo du tout.
    const second = await uploadLogo(org.admin.token, await png("#B91C1C"));
    expect(second.json().logoVersion).not.toBe(firstVersion);
    const removed = await admin.delete("/v1/organization/logo");
    expect(removed.statusCode).toBe(200);
    expect(removed.json().hasLogo).toBe(false);
    expect(removed.json().logoColor).toBeNull();

    // La facture émise reste identique à ce qu'a reçu le client : toujours avec son logo.
    expect(hasImage((await admin.get(`/v1/invoices/${invoice.id}/pdf`)).rawPayload)).toBe(true);
    // Un nouveau document n'a plus de logo, et l'email non plus.
    const draft = (await admin.post("/v1/quotes", { clientId: client.id, lines: sampleLines })).json();
    expect(hasImage((await admin.get(`/v1/quotes/${draft.id}/pdf`)).rawPayload)).toBe(false);
    expect((await admin.post(`/v1/quotes/${draft.id}/send`, {})).statusCode).toBe(200);
    testOutbox.length = 0;
    await flushEmails(org.orgId);
    expect(testOutbox.at(-1)!.html).not.toContain("cid:");
  });

  it("n'affiche jamais le logo d'une autre entreprise", async () => {
    await uploadLogo(other.admin.token, await png("#15803D"));
    // L'entreprise principale n'a plus de logo : rien ne doit venir de sa voisine.
    expect((await api(app, org.admin.token).get("/v1/organization/logo")).statusCode).toBe(404);
    expect((await api(app, other.admin.token).get("/v1/organization/logo")).headers["content-type"]).toContain("image/png");
  });

  it("retire les marges vides du logo pour l'aligner au bord du document", async () => {
    const mark = await sharp({ create: { width: 120, height: 60, channels: 4, background: "#4338CA" } })
      .png()
      .toBuffer();
    const padded = await sharp({ create: { width: 600, height: 300, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: mark, left: 240, top: 120 }])
      .png()
      .toBuffer();
    expect((await uploadLogo(other.admin.token, padded)).statusCode).toBe(200);
    const stored = await sharp((await api(app, other.admin.token).get("/v1/organization/logo")).rawPayload).metadata();
    expect([stored.width, stored.height]).toEqual([120, 60]);
  });

  it("refuse un fichier qui n'est pas une image", async () => {
    const res = await uploadLogo(org.admin.token, Buffer.from("<svg onload=alert(1)>"), "logo.svg", "image/svg+xml");
    expect(res.statusCode).toBe(400);
  });

  it("produit un aperçu PDF de mise en page, réservé à l'administrateur du compte", async () => {
    // Couleur très claire : le document doit rester lisible (textes ajustés), et l'aperçu se générer.
    const admin = api(app, org.admin.token);
    const current = (await admin.get("/v1/organization")).json() as Record<string, unknown>;
    const saved = await admin.put("/v1/organization", { ...current, brandColor: "#FACC15" });
    expect(saved.statusCode).toBe(200);
    expect(saved.json().brandColor).toBe("#FACC15");
    for (const kind of ["invoice", "quote"]) {
      const res = await admin.get(`/v1/organization/document-preview?kind=${kind}`);
      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toContain("application/pdf");
      expect(res.rawPayload.subarray(0, 5).toString()).toBe("%PDF-");
    }
    for (const role of ["HR", "EMPLOYEE"] as const) {
      const member = await createMember(app, org, role);
      expect((await api(app, member.token).get("/v1/organization/document-preview")).statusCode).toBe(403);
      expect((await api(app, member.token).delete("/v1/organization/logo")).statusCode).toBe(403);
    }
  });
});
