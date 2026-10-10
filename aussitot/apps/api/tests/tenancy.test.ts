import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { api, createClient, createTestOrg, sampleLines, testApp, type TestOrg } from "./helpers.ts";
import { prisma, withTenant } from "../src/lib/db.ts";

/**
 * Isolation des entreprises clientes : la propriété la plus importante d'un
 * logiciel vendu à plusieurs entreprises. Vérifiée par l'API ET directement
 * au niveau de la base (le rôle applicatif ne peut pas la contourner).
 */
let app: FastifyInstance;
let a: TestOrg;
let b: TestOrg;
let clientA: { id: string };
let quoteA: { id: string };

beforeAll(async () => {
  app = await testApp();
  a = await createTestOrg(app, "iso-a");
  b = await createTestOrg(app, "iso-b");
  clientA = await createClient(app, a.admin.token, "Client secret de A");
  quoteA = (await api(app, a.admin.token).post("/v1/quotes", { clientId: clientA.id, lines: sampleLines })).json();
});
afterAll(async () => app.close());

describe("isolation par l'API", () => {
  it("B ne voit pas les clients de A, ni par liste, ni par recherche, ni par identifiant", async () => {
    const list = await api(app, b.admin.token).get("/v1/clients");
    expect(list.json().items.map((c: { name: string }) => c.name)).not.toContain("Client secret de A");
    const search = await api(app, b.admin.token).get("/v1/clients?q=secret");
    expect(search.json().items).toHaveLength(0);
    // 404 (et non 403) : on ne révèle même pas que l'élément existe.
    expect((await api(app, b.admin.token).get(`/v1/clients/${clientA.id}`)).statusCode).toBe(404);
    expect((await api(app, b.admin.token).get(`/v1/quotes/${quoteA.id}`)).statusCode).toBe(404);
    expect((await api(app, b.admin.token).get(`/v1/quotes/${quoteA.id}/pdf`)).statusCode).toBe(404);
  });

  it("B ne peut ni modifier ni référencer un élément de A", async () => {
    expect((await api(app, b.admin.token).patch(`/v1/clients/${clientA.id}`, { name: "piraté" })).statusCode).toBe(404);
    const res = await api(app, b.admin.token).post("/v1/quotes", { clientId: clientA.id, lines: sampleLines });
    expect(res.statusCode).toBe(400);
    expect((await api(app, b.admin.token).post(`/v1/quotes/${quoteA.id}/send`)).statusCode).toBe(404);
    expect((await api(app, b.admin.token).post(`/v1/invoices/from-quote/${quoteA.id}`)).statusCode).toBe(404);
  });

  it("les numéros de documents sont propres à chaque entreprise", async () => {
    const clientB = await createClient(app, b.admin.token, "Client de B");
    const quoteB = (await api(app, b.admin.token).post("/v1/quotes", { clientId: clientB.id, lines: sampleLines })).json();
    expect(quoteB.number).toMatch(/^D-\d{4}-0001$/);
  });
});

describe("isolation au niveau de la base (RLS)", () => {
  it("une requête sans entreprise positionnée ne voit rien et ne peut rien écrire", async () => {
    expect(await prisma.client.count()).toBe(0);
    expect(await prisma.quote.count()).toBe(0);
    await expect(prisma.client.create({ data: { name: "sans entreprise" } as never })).rejects.toThrow();
  });

  it("même une requête SANS filtre ne renvoie que les lignes de l'entreprise courante", async () => {
    const seenByB = await withTenant(b.orgId, (tx) => tx.client.findMany());
    expect(seenByB.every((c) => c.organizationId === b.orgId)).toBe(true);
    expect(seenByB.some((c) => c.id === clientA.id)).toBe(false);
  });

  it("refuse d'écrire une ligne rattachée à une autre entreprise", async () => {
    await expect(
      withTenant(b.orgId, (tx) => tx.client.create({ data: { name: "intrus", organizationId: a.orgId } as never })),
    ).rejects.toThrow();
    await expect(withTenant(b.orgId, (tx) => tx.client.update({ where: { id: clientA.id }, data: { name: "x" } }))).rejects.toThrow();
  });
});
