import request from "supertest";
import { MissionStatus, ProblemStatus, Role } from "@prisma/client";
import { createApp } from "../src/app";
import { prisma } from "../src/db/prisma";
import { getSupervision } from "../src/modules/sites/supervision.service";
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

function mission(siteId: string, createdById: string, day: string, status: MissionStatus) {
  return prisma.mission.create({
    data: { siteId, createdById, title: "Ménage", status, date: new Date(`${day}T00:00:00Z`), startTime: new Date(`${day}T06:00:00Z`), endTime: new Date(`${day}T08:00:00Z`) },
  });
}

// Retour explicite du client : le superviseur voit d'un coup d'œil tous ses
// chantiers, ce qui a été fait, et ce qui pose problème en premier.
describe("Suivi des chantiers du superviseur", () => {
  it("met en tête le chantier à problème, avec des alertes claires, et compte le réalisé", async () => {
    const sup = await createTestUser({ role: Role.SUPERVISOR, email: "sup-suivi@deepclean.test" });
    const emp = await createTestUser({ role: Role.EMPLOYEE, email: "emp-suivi@deepclean.test" });
    const calme = await prisma.site.create({ data: { name: "A — Bureaux calmes", address: "1 rue A", supervisorId: sup.id } });
    const souci = await prisma.site.create({ data: { name: "B — Clinique", address: "2 rue B", supervisorId: sup.id } });
    await prisma.siteTarget.createMany({
      data: [
        { siteId: calme.id, period: "2027-03", plannedVisits: 2, createdById: sup.id },
        { siteId: souci.id, period: "2027-03", plannedVisits: 4, createdById: sup.id },
      ],
    });
    const done = await mission(calme.id, sup.id, "2027-03-02", MissionStatus.COMPLETED);
    await prisma.validation.create({ data: { type: "MISSION_COMPLETION", missionId: done.id, validatedById: sup.id } });
    const done2 = await mission(calme.id, sup.id, "2027-03-03", MissionStatus.COMPLETED);
    await prisma.validation.create({ data: { type: "MISSION_COMPLETION", missionId: done2.id, validatedById: sup.id } });
    await mission(souci.id, sup.id, "2027-03-04", MissionStatus.SCHEDULED); // jamais démarrée
    await mission(souci.id, sup.id, "2027-03-05", MissionStatus.COMPLETED); // pas validée
    await prisma.problem.create({ data: { siteId: souci.id, reportedById: emp.id, description: "Fuite d'eau", status: ProblemStatus.NEW, createdAt: new Date("2027-03-05T10:00:00Z") } });
    await mission(calme.id, sup.id, "2027-02-05", MissionStatus.COMPLETED); // mois précédent, avant le 10
    await mission(calme.id, sup.id, "2027-02-20", MissionStatus.COMPLETED); // après le 10 : hors comparaison

    const s = await getSupervision({ userId: sup.id, role: Role.SUPERVISOR }, "2027-03", new Date("2027-03-10T12:00:00Z"));
    expect(s.sites.map((x) => x.name)).toEqual(["B — Clinique", "A — Bureaux calmes"]);
    const [b, a] = s.sites;
    expect(b).toMatchObject({ health: "alert", missed: 1, toValidate: 1, openProblems: 1, oldestProblemDays: 5, toSchedule: 2, completed: 1, completionRate: 25 });
    expect(b!.alerts.map((x) => x.label)).toEqual([
      "1 intervention prévue non réalisée",
      "1 problème ouvert (depuis 5 j)",
      "1 mission terminée à valider",
      "2 interventions à programmer",
    ]);
    expect(a).toMatchObject({ health: "ok", completed: 2, completionRate: 100, alerts: [] });
    expect(s.totals).toMatchObject({ sites: 2, sitesOk: 1, sitesWithAlert: 1, target: 6, completed: 3, completionRate: 50, previousCompleted: 1, missed: 1, openProblems: 1 });
  });

  it("chaque superviseur ne voit que ses chantiers ; la direction voit tout ; l'employé et le chef d'équipe sont refusés", async () => {
    const supA = await createTestUser({ role: Role.SUPERVISOR, email: "sup-a-suivi@deepclean.test" });
    const supB = await createTestUser({ role: Role.SUPERVISOR, email: "sup-b-suivi@deepclean.test" });
    const dir = await createTestUser({ role: Role.DIRECTOR, email: "dir-suivi@deepclean.test" });
    await prisma.site.create({ data: { name: "Chantier A", address: "1", supervisorId: supA.id } });
    await prisma.site.create({ data: { name: "Chantier B", address: "2", supervisorId: supB.id } });

    const resA = await request(app).get("/api/v1/sites/supervision?period=2027-03").set("Authorization", `Bearer ${await login(supA.username)}`);
    expect(resA.status).toBe(200);
    expect(resA.body.supervision.sites.map((s: { name: string }) => s.name)).toEqual(["Chantier A"]);

    const resDir = await request(app).get("/api/v1/sites/supervision?period=2027-03").set("Authorization", `Bearer ${await login(dir.username)}`);
    expect(resDir.body.supervision.sites).toHaveLength(2);

    for (const role of [Role.EMPLOYEE, Role.SITE_MANAGER]) {
      const u = await createTestUser({ role, email: `${role}-suivi@deepclean.test` });
      const res = await request(app).get("/api/v1/sites/supervision?period=2027-03").set("Authorization", `Bearer ${await login(u.username)}`);
      expect(res.status).toBe(403);
    }
  });
});
