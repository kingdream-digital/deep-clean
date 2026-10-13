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

async function hrToken() {
  const user = await createTestUser({ role: Role.HR, email: "rh-numero@deepclean.test" });
  const login = await request(app).post("/api/v1/auth/login").send({ username: user.username, password: TEST_PASSWORD });
  return login.body.accessToken as string;
}

// Trouvé en test de charge : plusieurs commerciaux créant un devis au même
// moment obtenaient le même numéro, et l'un d'eux perdait son devis.
describe("Numérotation continue sous création simultanée", () => {
  it("12 devis créés en même temps ont tous un numéro unique et sans trou", async () => {
    const token = await hrToken();
    const client = await request(app).post("/api/v1/clients").set("Authorization", `Bearer ${token}`).send({ companyName: "ABC", email: "abc@abc.test" });
    const results = await Promise.all(
      Array.from({ length: 12 }, () =>
        request(app)
          .post("/api/v1/quotes")
          .set("Authorization", `Bearer ${token}`)
          .send({ clientId: client.body.client.id, items: [{ description: "Prestation", quantity: 1, unit: "FLAT_RATE", unitPriceHt: 100 }] })
      )
    );
    expect(results.map((r) => r.status)).toEqual(Array(12).fill(201));
    const numbers = results.map((r) => r.body.quote.quoteNumber as string).sort();
    const year = new Date().getFullYear();
    expect(numbers).toEqual(Array.from({ length: 12 }, (_, i) => `DEV-${year}-${String(i + 1).padStart(4, "0")}`));
  });

  it("12 factures créées en même temps ont tous un numéro unique et sans trou", async () => {
    const token = await hrToken();
    const client = await request(app).post("/api/v1/clients").set("Authorization", `Bearer ${token}`).send({ companyName: "ABC", email: "abc@abc.test" });
    const results = await Promise.all(
      Array.from({ length: 12 }, () =>
        request(app)
          .post("/api/v1/invoices")
          .set("Authorization", `Bearer ${token}`)
          .send({ clientId: client.body.client.id, items: [{ description: "Prestation", quantity: 1, unit: "FLAT_RATE", unitPriceHt: 100 }] })
      )
    );
    expect(results.map((r) => r.status)).toEqual(Array(12).fill(201));
    const numbers = results.map((r) => r.body.invoice.invoiceNumber as string).sort();
    const year = new Date().getFullYear();
    expect(numbers).toEqual(Array.from({ length: 12 }, (_, i) => `FAC-${year}-${String(i + 1).padStart(4, "0")}`));
  });

  it("continue après le n°9999 (le tri alphabétique placerait 10000 avant 9999)", async () => {
    const token = await hrToken();
    const client = await request(app).post("/api/v1/clients").set("Authorization", `Bearer ${token}`).send({ companyName: "ABC", email: "abc@abc.test" });
    const first = await request(app)
      .post("/api/v1/quotes")
      .set("Authorization", `Bearer ${token}`)
      .send({ clientId: client.body.client.id, items: [{ description: "x", quantity: 1, unit: "FLAT_RATE", unitPriceHt: 1 }] });
    const year = new Date().getFullYear();
    await prisma.quote.update({ where: { id: first.body.quote.id }, data: { quoteNumber: `DEV-${year}-9999` } });
    const next = await request(app)
      .post("/api/v1/quotes")
      .set("Authorization", `Bearer ${token}`)
      .send({ clientId: client.body.client.id, items: [{ description: "x", quantity: 1, unit: "FLAT_RATE", unitPriceHt: 1 }] });
    expect(next.body.quote.quoteNumber).toBe(`DEV-${year}-10000`);
  });
});
