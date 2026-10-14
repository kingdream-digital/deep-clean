import request from "supertest";
import { Role } from "@prisma/client";
import { createApp } from "../src/app";
import { prisma } from "../src/db/prisma";
import { runMonthlySchedulingReminder } from "../src/modules/automations/automations.service";
import { createTestUser, resetDatabase, TEST_PASSWORD } from "./helpers";

const app = createApp();

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function login(username: string) {
  return (await request(app).post("/api/v1/auth/login").send({ username, password: TEST_PASSWORD })).body.accessToken as string;
}

// Retour explicite du client : chef d'équipe et superviseur choisis dès la
// création du chantier, objectifs prévus sur l'année puis ajustés mois par
// mois, et rappel en début de mois pour programmer les interventions.
describe("Chantier : chef d'équipe et superviseur dès la création", () => {
  it("enregistre les deux et prévient chacun (notification qui ouvre le chantier)", async () => {
    const hr = await createTestUser({ role: Role.HR, email: "rh-site@deepclean.test" });
    const chef = await createTestUser({ role: Role.SITE_MANAGER, email: "chef-site@deepclean.test" });
    const sup = await createTestUser({ role: Role.SUPERVISOR, email: "sup-site@deepclean.test" });
    const token = await login(hr.username);

    const res = await request(app)
      .post("/api/v1/sites")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Résidence Les Pins", address: "3 rue des Pins", managerId: chef.id, supervisorId: sup.id });
    expect(res.status).toBe(201);
    const siteId = res.body.site.id as string;
    expect(res.body.site.managerId).toBe(chef.id);
    expect(res.body.site.supervisorId).toBe(sup.id);

    for (const userId of [chef.id, sup.id]) {
      const notes = await prisma.notification.findMany({ where: { userId, relatedEntityType: "Site", relatedEntityId: siteId } });
      expect(notes).toHaveLength(1);
      expect(notes[0]!.body).toContain("Résidence Les Pins");
    }

    // Modification sans changement de personne : pas de seconde notification.
    await request(app).patch(`/api/v1/sites/${siteId}`).set("Authorization", `Bearer ${token}`).send({ name: "Résidence Les Pins", managerId: chef.id });
    expect(await prisma.notification.count({ where: { userId: chef.id, relatedEntityType: "Site" } })).toBe(1);
  });
});

describe("Chantier : objectifs sur plusieurs mois", () => {
  async function setup() {
    const sup = await createTestUser({ role: Role.SUPERVISOR, email: "sup-plan@deepclean.test" });
    const token = await login(sup.username);
    const site = await request(app).post("/api/v1/sites").set("Authorization", `Bearer ${token}`).send({ name: "Bureaux Horizon", address: "8 avenue Foch" });
    return { sup, token, siteId: site.body.site.id as string };
  }

  it("prévoit toute l'année en une fois, sans écraser un mois ajusté à la main", async () => {
    const { token, siteId } = await setup();
    const auth = { Authorization: `Bearer ${token}` };

    const first = await request(app).post(`/api/v1/sites/${siteId}/targets/plan`).set(auth).send({ period: "2027-01", months: 6, plannedVisits: 8, plannedHours: 16 });
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ created: 6, updated: 0, kept: 0, from: "2027-01", to: "2027-06" });

    // Ajustement à la main de février.
    await request(app).post(`/api/v1/sites/${siteId}/targets`).set(auth).send({ period: "2027-02", plannedVisits: 4 });

    const year = await request(app).post(`/api/v1/sites/${siteId}/targets/plan`).set(auth).send({ period: "2027-01", months: 12, plannedVisits: 10 });
    expect(year.body).toMatchObject({ created: 6, updated: 0, kept: 6, to: "2027-12" });
    const feb = await prisma.siteTarget.findUnique({ where: { siteId_period: { siteId, period: "2027-02" } } });
    expect(feb!.plannedVisits).toBe(4);
    expect(await prisma.siteTarget.count({ where: { siteId } })).toBe(12);

    const replaced = await request(app).post(`/api/v1/sites/${siteId}/targets/plan`).set(auth).send({ period: "2027-01", months: 12, plannedVisits: 10, overwrite: true });
    expect(replaced.body).toMatchObject({ created: 0, updated: 12, kept: 0 });
    expect((await prisma.siteTarget.findUnique({ where: { siteId_period: { siteId, period: "2027-02" } } }))!.plannedVisits).toBe(10);
  });

  it("passe d'une année à l'autre (novembre → avril)", async () => {
    const { token, siteId } = await setup();
    const res = await request(app).post(`/api/v1/sites/${siteId}/targets/plan`).set("Authorization", `Bearer ${token}`).send({ period: "2026-11", months: 6, plannedVisits: 2 });
    expect(res.body).toMatchObject({ from: "2026-11", to: "2027-04" });
  });

  it("refusé à un employé et à un chef d'équipe, et refuse plus de 24 mois", async () => {
    const { token, siteId } = await setup();
    for (const [role, email] of [
      [Role.EMPLOYEE, "emp-plan@deepclean.test"],
      [Role.SITE_MANAGER, "chef-plan@deepclean.test"],
    ] as const) {
      const u = await createTestUser({ role, email });
      const res = await request(app).post(`/api/v1/sites/${siteId}/targets/plan`).set("Authorization", `Bearer ${await login(u.username)}`).send({ period: "2027-01", months: 12, plannedVisits: 3 });
      expect(res.status).toBe(403);
    }
    const tooLong = await request(app).post(`/api/v1/sites/${siteId}/targets/plan`).set("Authorization", `Bearer ${token}`).send({ period: "2027-01", months: 36, plannedVisits: 3 });
    expect(tooLong.status).toBe(400);
  });
});

describe("Rappel du 1er du mois : interventions à programmer", () => {
  it("prévient le superviseur du chantier du nombre d'interventions restant à programmer, une seule fois", async () => {
    const sup = await createTestUser({ role: Role.SUPERVISOR, email: "sup-rappel@deepclean.test" });
    const other = await createTestUser({ role: Role.SUPERVISOR, email: "sup-autre@deepclean.test" });
    const site = await prisma.site.create({ data: { name: "Clinique du Parc", address: "1 rue du Parc", supervisorId: sup.id } });
    await prisma.siteTarget.create({ data: { siteId: site.id, period: "2027-03", plannedVisits: 4, createdById: sup.id } });
    await prisma.mission.create({
      data: { siteId: site.id, title: "Ménage", date: new Date("2027-03-02T00:00:00Z"), startTime: new Date("2027-03-02T07:00:00Z"), endTime: new Date("2027-03-02T09:00:00Z"), createdById: sup.id },
    });

    const now = new Date("2027-03-01T07:05:00Z");
    expect(await runMonthlySchedulingReminder(now)).toBe(1);
    const note = await prisma.notification.findFirstOrThrow({ where: { userId: sup.id } });
    expect(note.body).toBe("Clinique du Parc : 3 interventions à programmer en mars (objectif 4).");
    expect(note.relatedEntityType).toBe("Site");
    expect(await prisma.notification.count({ where: { userId: other.id } })).toBe(0);

    expect(await runMonthlySchedulingReminder(now)).toBe(0);
  });

  it("chantier sans superviseur : tous les superviseurs ; rien si tout est déjà programmé", async () => {
    const a = await createTestUser({ role: Role.SUPERVISOR, email: "sup-a@deepclean.test" });
    const b = await createTestUser({ role: Role.SUPERVISOR, email: "sup-b@deepclean.test" });
    const site = await prisma.site.create({ data: { name: "Agence Sud", address: "2 rue Sud" } });
    const done = await prisma.site.create({ data: { name: "Agence Nord", address: "2 rue Nord", supervisorId: a.id } });
    await prisma.siteTarget.createMany({
      data: [
        { siteId: site.id, period: "2027-03", plannedVisits: 2, createdById: a.id },
        { siteId: done.id, period: "2027-03", plannedVisits: 1, createdById: a.id },
      ],
    });
    await prisma.mission.create({
      data: { siteId: done.id, title: "Ménage", date: new Date("2027-03-10T00:00:00Z"), startTime: new Date("2027-03-10T07:00:00Z"), endTime: new Date("2027-03-10T09:00:00Z"), createdById: a.id },
    });

    expect(await runMonthlySchedulingReminder(new Date("2027-03-01T07:05:00Z"))).toBe(2);
    for (const userId of [a.id, b.id]) {
      const notes = await prisma.notification.findMany({ where: { userId } });
      expect(notes.map((n) => n.relatedEntityId)).toEqual([site.id]);
    }
  });
});
