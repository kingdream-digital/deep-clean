import request from "supertest";
import { Role } from "@prisma/client";
import { createApp } from "../src/app";
import { prisma } from "../src/db/prisma";
import { createTestUser, resetDatabase } from "./helpers";

// Espace public (sans compte) : demande de devis envoyée depuis l'application.

const app = createApp();

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

const VALID = {
  customerType: "INDIVIDUAL",
  firstName: "Claire",
  lastName: "Martin",
  phone: "06 12 34 56 78",
  postalCode: "04100",
  city: "Manosque",
  service: "Nettoyage en profondeur",
  message: "Remise en état d'un appartement de 60 m² avant un état des lieux.",
  consent: true,
};

// Chaque test utilise sa propre adresse IP : la limite (5 par heure et par
// IP) est volontairement stricte.
function post(body: object, ip: string) {
  return request(app).post("/api/v1/public/quote-requests").set("X-Forwarded-For", ip).send(body);
}

describe("Demande de devis depuis l'espace public", () => {
  it("crée un prospect « Nouveau », non assigné, et prévient direction et RH", async () => {
    const director = await createTestUser({ role: Role.DIRECTOR, email: "dir-pub@deepclean.test" });
    const hr = await createTestUser({ role: Role.HR, email: "hr-pub@deepclean.test" });
    await createTestUser({ role: Role.EMPLOYEE, email: "emp-pub@deepclean.test" });

    const res = await post(VALID, "10.0.0.1");
    expect(res.status).toBe(201);
    // Rien n'est renvoyé au demandeur hormis la confirmation.
    expect(Object.keys(res.body)).toEqual(["message"]);

    const prospects = await prisma.prospect.findMany();
    expect(prospects).toHaveLength(1);
    expect(prospects[0]).toMatchObject({
      companyName: "Claire Martin (particulier)",
      status: "NEW",
      createdById: null,
      assignedUserId: null,
      serviceType: "Nettoyage en profondeur",
      source: "Application (demande en ligne)",
    });

    const notified = await prisma.notification.findMany({ where: { title: "Nouvelle demande de devis" } });
    expect(notified.map((n) => n.userId).sort()).toEqual([director.id, hr.id].sort());
    expect(notified[0]).toMatchObject({ relatedEntityType: "Prospect", relatedEntityId: prospects[0]!.id });
  });

  it("un propriétaire (conciergerie) est enregistré comme tel", async () => {
    expect((await post({ ...VALID, customerType: "OWNER", service: "Conciergerie" }, "10.0.0.6")).status).toBe(201);
    const prospect = await prisma.prospect.findFirstOrThrow();
    expect(prospect.companyName).toBe("Claire Martin (propriétaire, conciergerie)");
    expect(prospect.serviceType).toBe("Conciergerie");
  });

  it("exige le consentement et un moyen de contact ; la description est facultative", async () => {
    expect((await post({ ...VALID, consent: false }, "10.0.0.2")).status).toBe(400);
    expect((await post({ ...VALID, phone: undefined, email: undefined }, "10.0.0.2")).status).toBe(400);
    expect((await post({ ...VALID, customerType: "BUSINESS" }, "10.0.0.2")).status).toBe(400);
    expect((await post({ ...VALID, service: "Ménage de printemps" }, "10.0.0.2")).status).toBe(400);
    expect(await prisma.prospect.count()).toBe(0);
  });

  it("accepte une demande sans description : le service suffit", async () => {
    expect((await post({ ...VALID, message: undefined }, "10.0.0.7")).status).toBe(201);
    const prospect = await prisma.prospect.findFirstOrThrow();
    expect(prospect.serviceType).toBe(VALID.service);
    expect(prospect.need).toBeNull();
  });

  it("répond normalement à un robot (champ piège rempli) sans rien enregistrer", async () => {
    const res = await post({ ...VALID, website: "https://spam.example" }, "10.0.0.3");
    expect(res.status).toBe(201);
    expect(await prisma.prospect.count()).toBe(0);
    expect(await prisma.notification.count()).toBe(0);
  });

  it("limite les envois répétés depuis une même adresse", async () => {
    for (let i = 0; i < 5; i++) expect((await post(VALID, "10.0.0.4")).status).toBe(201);
    const sixth = await post(VALID, "10.0.0.4");
    expect(sixth.status).toBe(429);
  });

  it("le prospect public reste invisible pour un superviseur tant qu'il n'est pas assigné", async () => {
    await post(VALID, "10.0.0.5");
    const sup = await createTestUser({ role: Role.SUPERVISOR, email: "sup-pub@deepclean.test" });
    const login = await request(app).post("/api/v1/auth/login").send({ username: sup.username, password: "CorrectHorse9!Battery" });
    const list = await request(app).get("/api/v1/prospects").set("Authorization", `Bearer ${login.body.accessToken}`);
    expect(list.status).toBe(200);
    expect(list.body.items ?? list.body).toHaveLength(0);
  });
});
