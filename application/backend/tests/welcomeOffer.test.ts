import request from "supertest";
import { Role } from "@prisma/client";
import { createApp } from "../src/app";
import { prisma } from "../src/db/prisma";
import { createTestUser, resetDatabase, TEST_PASSWORD } from "./helpers";

// Offre de bienvenue de l'espace public : réglée par la Direction, visible du
// public seulement si active et dans ses dates, rattachée aux demandes de devis.

const app = createApp();

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function tokenFor(role: Role, email: string) {
  const user = await createTestUser({ role, email });
  const login = await request(app).post("/api/v1/auth/login").send({ username: user.username, password: TEST_PASSWORD });
  return login.body.accessToken as string;
}

const DAY = 24 * 60 * 60 * 1000;
function offer(overrides: Record<string, unknown> = {}) {
  return {
    isActive: true,
    rate: 10,
    title: "Offre de bienvenue",
    summary: "-10 % sur votre première prestation demandée depuis l'application.",
    conditions: "Offre réservée aux nouveaux clients, pour une première prestation demandée depuis l'application. Non cumulable.",
    startsAt: new Date(Date.now() - DAY).toISOString(),
    endsAt: new Date(Date.now() + 30 * DAY).toISOString(),
    ...overrides,
  };
}

const quote = {
  customerType: "INDIVIDUAL",
  firstName: "Claire",
  lastName: "Martin",
  phone: "06 12 34 56 78",
  service: "Matelas",
  message: "Deux matelas à traiter en profondeur.",
  consent: true,
};

describe("Offre de bienvenue", () => {
  it("n'existe pas tant que la Direction ne l'a pas créée", async () => {
    const res = await request(app).get("/api/v1/public/welcome-offer");
    expect(res.status).toBe(200);
    expect(res.body.offer).toBeNull();
  });

  it("est réservée à la Direction et à l'admin technique", async () => {
    for (const role of [Role.EMPLOYEE, Role.SITE_MANAGER, Role.SUPERVISOR, Role.HR, Role.ACCOUNTANT]) {
      const token = await tokenFor(role, `${role.toLowerCase()}-offer@deepclean.test`);
      const res = await request(app).put("/api/v1/welcome-offer").set("Authorization", `Bearer ${token}`).send(offer());
      expect(res.status).toBe(403);
    }
    expect((await request(app).put("/api/v1/welcome-offer").send(offer())).status).toBe(401);
    expect(await prisma.welcomeOffer.count()).toBe(0);
  });

  it("s'affiche au public une fois active, et disparaît désactivée ou hors dates", async () => {
    const token = await tokenFor(Role.DIRECTOR, "director-offer@deepclean.test");
    const saved = await request(app).put("/api/v1/welcome-offer").set("Authorization", `Bearer ${token}`).send(offer());
    expect(saved.status).toBe(200);
    const visible = await request(app).get("/api/v1/public/welcome-offer");
    expect(visible.body.offer).toMatchObject({ rate: 10, title: "Offre de bienvenue" });
    expect(visible.body.offer.isActive).toBeUndefined();

    await request(app).put("/api/v1/welcome-offer").set("Authorization", `Bearer ${token}`).send(offer({ isActive: false }));
    expect((await request(app).get("/api/v1/public/welcome-offer")).body.offer).toBeNull();

    await request(app)
      .put("/api/v1/welcome-offer")
      .set("Authorization", `Bearer ${token}`)
      .send(offer({ startsAt: new Date(Date.now() - 10 * DAY).toISOString(), endsAt: new Date(Date.now() - DAY).toISOString() }));
    expect((await request(app).get("/api/v1/public/welcome-offer")).body.offer).toBeNull();
    // Toujours une seule offre, mise à jour en place.
    expect(await prisma.welcomeOffer.count()).toBe(1);
    expect(await prisma.activityLog.count({ where: { action: "WELCOME_OFFER_UPDATED" } })).toBe(3);
  });

  it("refuse une remise ou des dates incohérentes", async () => {
    const token = await tokenFor(Role.ADMIN, "admin-offer@deepclean.test");
    const tooHigh = await request(app).put("/api/v1/welcome-offer").set("Authorization", `Bearer ${token}`).send(offer({ rate: 80 }));
    expect(tooHigh.status).toBe(400);
    const reversed = await request(app)
      .put("/api/v1/welcome-offer")
      .set("Authorization", `Bearer ${token}`)
      .send(offer({ startsAt: new Date(Date.now() + DAY).toISOString(), endsAt: new Date(Date.now() - DAY).toISOString() }));
    expect(reversed.status).toBe(400);
  });

  it("est rattachée à la demande de devis envoyée pendant l'offre", async () => {
    await request(app).post("/api/v1/public/quote-requests").send(quote);
    const before = await prisma.prospect.findFirstOrThrow();
    expect(before.welcomeOfferId).toBeNull();

    const token = await tokenFor(Role.DIRECTOR, "director-offer2@deepclean.test");
    await request(app).put("/api/v1/welcome-offer").set("Authorization", `Bearer ${token}`).send(offer());
    await prisma.notification.deleteMany();
    expect((await request(app).post("/api/v1/public/quote-requests").send({ ...quote, firstName: "Paul" })).status).toBe(201);

    const after = await prisma.prospect.findFirstOrThrow({ where: { contactFirstName: "Paul" } });
    const current = await prisma.welcomeOffer.findFirstOrThrow();
    expect(after.welcomeOfferId).toBe(current.id);
    expect(after.notes).toContain("-10 % sur la première prestation");
    const notified = await prisma.notification.findFirstOrThrow({ where: { title: "Nouvelle demande de devis" } });
    expect(notified.body).toContain("Offre de bienvenue -10 % à appliquer.");
  });
});
