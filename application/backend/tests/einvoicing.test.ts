import http from "node:http";
import type { AddressInfo } from "node:net";
import request from "supertest";
import { Role } from "@prisma/client";
import { createApp } from "../src/app";
import { env } from "../src/config/env";
import { prisma } from "../src/db/prisma";
import { buildEnInvoice, einvoiceBlockers } from "../src/modules/einvoicing/enInvoice";
import type { EinvoiceSource } from "../src/modules/einvoicing/enInvoice";
import { getCompanyProfile } from "../src/modules/einvoicing/companyProfile";
import { resetSuperPdpToken } from "../src/modules/einvoicing/superpdp.client";
import { createTestUser, resetDatabase, TEST_PASSWORD } from "./helpers";

const app = createApp();
const mutableEnv = env as unknown as Record<string, unknown>;

const COMPANY = {
  COMPANY_LEGAL_NAME: "Deep Clean",
  COMPANY_LEGAL_FORM: "SAS",
  COMPANY_ADDRESS: "5 rue des Lilas",
  COMPANY_POSTAL_CODE: "93100",
  COMPANY_CITY: "Montreuil",
  COMPANY_SIRET: "81234567800012",
  COMPANY_VAT_NUMBER: "FR32812345678",
  COMPANY_IBAN: "FR7630006000011234567890189",
};

// Faux serveur Super PDP : enregistre ce qu'il reçoit, répond comme l'API.
const received: { path: string; contentType?: string; body: Buffer }[] = [];
let nextEvents: { id: number; invoice_id: number; status_code: string; status_text: string; created_at: string }[] = [];
const server = http.createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const body = Buffer.concat(chunks);
    received.push({ path: req.url ?? "", contentType: req.headers["content-type"], body });
    const json = (code: number, data: unknown) => {
      res.writeHead(code, { "content-type": "application/json" });
      res.end(JSON.stringify(data));
    };
    if (req.url === "/oauth2/token") return json(200, { access_token: "jeton-test", expires_in: 3600 });
    if (req.headers.authorization !== "Bearer jeton-test") return json(401, { error: "unauthorized" });
    if (req.url?.startsWith("/v1.beta/invoices/convert")) {
      res.writeHead(200, { "content-type": "application/pdf" });
      return res.end("%PDF-1.7 factur-x");
    }
    if (req.url?.startsWith("/v1.beta/invoices?")) {
      return json(200, { id: 42, company_id: 1, created_at: new Date().toISOString(), direction: "out", events: [{ id: 1, invoice_id: 42, status_code: "api:uploaded", status_text: "", created_at: new Date().toISOString() }] });
    }
    if (req.url?.startsWith("/v1.beta/invoice_events")) return json(200, { data: nextEvents, has_after: false });
    return json(404, { error: "not found" });
  });
});

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, resolve));
  mutableEnv.SUPERPDP_API_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

beforeEach(async () => {
  await resetDatabase();
  received.length = 0;
  nextEvents = [];
  resetSuperPdpToken();
  Object.assign(mutableEnv, COMPANY, { SUPERPDP_CLIENT_ID: "id-test", SUPERPDP_CLIENT_SECRET: "secret-test" });
});

afterAll(async () => {
  for (const key of [...Object.keys(COMPANY), "SUPERPDP_CLIENT_ID", "SUPERPDP_CLIENT_SECRET"]) delete mutableEnv[key];
  mutableEnv.COMPANY_LEGAL_NAME = "Deep Clean";
  server.close();
  await prisma.$disconnect();
});

const source: EinvoiceSource = {
  invoiceNumber: "FAC-2026-0001",
  issueDate: new Date("2026-10-01T08:00:00Z"),
  dueDate: null,
  period: "2026-10",
  paymentTerms: null,
  contactName: "Paul Marchand",
  contactEmail: "paul@client.fr",
  contactPhone: null,
  billingAddress: "8 avenue Foch, 75116 Paris",
  siret: null,
  vatRate: 20,
  subtotalHt: 1110,
  vatAmount: 222,
  totalTtc: 1332,
  client: { companyName: "Hôtel Belle Vue", email: null, billingAddress: null, postalCode: null, city: null, siret: "73282932000074", siren: null },
  quote: { quoteNumber: "DEV-2026-0009" },
  site: { name: "Hôtel Belle Vue", address: "12 rue de Rivoli, 75004 Paris" },
  items: [
    { description: "Forfait mensuel", quantity: 1, unit: "MONTH", unitPriceHt: 990, totalHt: 990 },
    { description: "Remise en état", quantity: 1, unit: "INTERVENTION", unitPriceHt: 120, totalHt: 120 },
  ],
};

describe("Facture électronique — format EN 16931", () => {
  it("porte les mentions de la réforme : SIREN, adresse d'intervention, services, échéance, pénalités", () => {
    const e = buildEnInvoice(source, getCompanyProfile());
    expect(e.process_control).toEqual({ specification_identifier: "urn:cen.eu:en16931:2017", business_process_type: "S1" });
    expect(e.seller.legal_registration_identifier).toEqual({ scheme: "0002", value: "812345678" });
    expect(e.seller.electronic_address).toEqual({ scheme: "0225", value: "812345678" });
    expect(e.buyer.legal_registration_identifier).toEqual({ scheme: "0002", value: "732829320" });
    expect(e.buyer.postal_address).toEqual({ address_line1: "8 avenue Foch", post_code: "75116", city: "Paris", country_code: "FR" });
    expect(e.deliver_to_address).toEqual({ address_line1: "12 rue de Rivoli", post_code: "75004", city: "Paris", country_code: "FR" });
    expect(e.invoicing_period).toEqual({ start_date: "2026-10-01", end_date: "2026-10-31" });
    expect(e.payment_due_date).toBe("2026-10-31");
    expect(e.totals).toEqual({
      sum_invoice_lines_amount: "1110.00",
      total_without_vat: "1110.00",
      total_vat_amount: { value: "222.00", currency_code: "EUR" },
      total_with_vat: "1332.00",
      amount_due_for_payment: "1332.00",
    });
    expect(e.lines.map((l) => l.invoiced_quantity_code)).toEqual(["MON", "C62"]);
    expect(e.notes.map((n) => n.subject_code)).toEqual(["PMT", "PMD", "AAB"]);
  });

  it("liste en français ce qui manque avant l'envoi", () => {
    mutableEnv.COMPANY_SIRET = "";
    const blockers = einvoiceBlockers({ ...source, client: { ...source.client, siret: null } }, getCompanyProfile());
    expect(blockers).toEqual(expect.arrayContaining([expect.stringContaining("SIREN de l'entreprise"), expect.stringContaining("SIREN ou SIRET du client")]));
  });
});

async function validatedInvoice() {
  const hr = await createTestUser({ role: Role.HR, email: "rh-fe@deepclean.test" });
  const director = await createTestUser({ role: Role.DIRECTOR, email: "dir-fe@deepclean.test" });
  const token = (await request(app).post("/api/v1/auth/login").send({ username: hr.username, password: TEST_PASSWORD })).body.accessToken as string;
  const client = await request(app)
    .post("/api/v1/clients")
    .set("Authorization", `Bearer ${token}`)
    .send({ companyName: "Hôtel Belle Vue", email: "compta@bellevue.fr", billingAddress: "8 avenue Foch", postalCode: "75116", city: "Paris", siret: "73282932000074" });
  const invoice = await request(app)
    .post("/api/v1/invoices")
    .set("Authorization", `Bearer ${token}`)
    .send({ clientId: client.body.client.id, items: [{ description: "Nettoyage", quantity: 2, unit: "HOUR", unitPriceHt: 30 }] });
  await request(app).post(`/api/v1/invoices/${invoice.body.invoice.id}/validate`).set("Authorization", `Bearer ${token}`);
  return { token, invoiceId: invoice.body.invoice.id as string, hr, director };
}

describe("Facture électronique — envoi via Super PDP", () => {
  it("convertit en Factur-X, dépose la facture et suit son statut", async () => {
    const { token, invoiceId } = await validatedInvoice();

    const ready = await request(app).get(`/api/v1/invoices/${invoiceId}/einvoice`).set("Authorization", `Bearer ${token}`);
    expect(ready.body).toEqual({ configured: true, blockers: [] });

    const sent = await request(app).post(`/api/v1/invoices/${invoiceId}/einvoice`).set("Authorization", `Bearer ${token}`);
    expect(sent.status).toBe(200);
    expect(sent.body.invoice).toMatchObject({ pdpInvoiceId: "42", pdpStatus: "api:uploaded", pdpStatusLabel: "Déposée sur la plateforme", status: "SENT" });

    const convert = received.find((r) => r.path.startsWith("/v1.beta/invoices/convert"))!;
    expect(convert.path).toBe("/v1.beta/invoices/convert?from=en16931&to=factur-x");
    expect(convert.contentType).toContain("multipart/form-data");
    expect(convert.body.toString("latin1")).toContain('"business_process_type":"S1"');
    const upload = received.find((r) => r.path.startsWith("/v1.beta/invoices?"))!;
    expect(upload.contentType).toBe("application/pdf");
    expect(upload.path).toContain("external_id=FAC-");

    // Une seconde fois : refusé, la facture est déjà partie.
    expect((await request(app).post(`/api/v1/invoices/${invoiceId}/einvoice`).set("Authorization", `Bearer ${token}`)).status).toBe(409);

    nextEvents = [
      { id: 1, invoice_id: 42, status_code: "api:uploaded", status_text: "", created_at: new Date().toISOString() },
      { id: 2, invoice_id: 42, status_code: "fr:202", status_text: "", created_at: new Date().toISOString() },
      { id: 3, invoice_id: 42, status_code: "ppf:f1-ack", status_text: "", created_at: new Date().toISOString() },
    ];
    const refreshed = await request(app).post(`/api/v1/invoices/${invoiceId}/einvoice/refresh`).set("Authorization", `Bearer ${token}`);
    expect(refreshed.body.invoice).toMatchObject({ pdpStatus: "fr:202", pdpStatusLabel: "Reçue par la plateforme du client" });
  });

  it("prévient la direction et la RH quand le client refuse la facture", async () => {
    const { token, invoiceId, hr, director } = await validatedInvoice();
    await request(app).post(`/api/v1/invoices/${invoiceId}/einvoice`).set("Authorization", `Bearer ${token}`);
    nextEvents = [{ id: 5, invoice_id: 42, status_code: "fr:210", status_text: "Montant contesté", created_at: new Date().toISOString() }];
    const refreshed = await request(app).post(`/api/v1/invoices/${invoiceId}/einvoice/refresh`).set("Authorization", `Bearer ${token}`);
    expect(refreshed.body.invoice).toMatchObject({ pdpStatus: "fr:210", pdpError: "Montant contesté" });
    const notified = await prisma.notification.findMany({ where: { relatedEntityId: invoiceId, title: "Facture électronique à vérifier" } });
    expect(notified.map((n) => n.userId).sort()).toEqual([hr.id, director.id].sort());
  });

  it("explique clairement quand la facture électronique n'est pas configurée", async () => {
    const { token, invoiceId } = await validatedInvoice();
    mutableEnv.SUPERPDP_CLIENT_ID = "";
    const res = await request(app).post(`/api/v1/invoices/${invoiceId}/einvoice`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain("pas encore activée");
    expect(received).toHaveLength(0);
  });

  it("refuse l'envoi tant qu'il manque le SIREN du client", async () => {
    const { token, invoiceId } = await validatedInvoice();
    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    await prisma.client.update({ where: { id: invoice.clientId }, data: { siret: null } });
    await prisma.invoice.update({ where: { id: invoiceId }, data: { siret: null } });
    const res = await request(app).post(`/api/v1/invoices/${invoiceId}/einvoice`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain("SIREN ou SIRET du client");
  });

  it("reste réservé à la facturation (RH, direction, admin)", async () => {
    const { invoiceId } = await validatedInvoice();
    const sup = await createTestUser({ role: Role.SUPERVISOR, email: "sup-fe@deepclean.test" });
    const supToken = (await request(app).post("/api/v1/auth/login").send({ username: sup.username, password: TEST_PASSWORD })).body.accessToken as string;
    expect((await request(app).post(`/api/v1/invoices/${invoiceId}/einvoice`).set("Authorization", `Bearer ${supToken}`)).status).toBe(403);
  });
});
