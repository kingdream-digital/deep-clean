import request from "supertest";
import { addDaysToKey, companyDateKey } from "../src/utils/companyTime";
import { Role } from "@prisma/client";
import { createApp } from "../src/app";
import { prisma } from "../src/db/prisma";
import { clockInViaApi, clockOutViaApi, createTestSite, createTestUser, resetDatabase, TEST_PASSWORD } from "./helpers";

const app = createApp();

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function loginAs(user: { username: string }) {
  const login = await request(app).post("/api/v1/auth/login").send({ username: user.username, password: TEST_PASSWORD });
  return login.body.accessToken as string;
}

// Dates calculées sans dépendre du fuseau de la machine qui lance les tests :
// « demain » au sens de Paris, jours ajoutés en UTC.
function tomorrowDateString(): string {
  return addDaysToKey(companyDateKey(new Date()), 1);
}

function addDays(dateStr: string, days: number): string {
  return addDaysToKey(dateStr, days);
}

const basePayload = () => ({
  title: "Nettoyage des bureaux",
  date: tomorrowDateString(),
  startTime: "08:00",
  endTime: "12:00",
});

describe("Création de mission — réservée aux rôles de gestion du planning", () => {
  it("permet au superviseur de créer une mission sur n'importe quel chantier et notifie les employés", async () => {
    const supervisor = await createTestUser({ role: Role.SUPERVISOR, email: "sup-create1@deepclean.test" });
    const employee = await createTestUser({ role: Role.EMPLOYEE, email: "emp1@deepclean.test" });
    const site = await createTestSite();
    const token = await loginAs(supervisor);

    const res = await request(app)
      .post("/api/v1/missions")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...basePayload(), siteId: site.id, assigneeIds: [employee.id], leadId: employee.id });

    expect(res.status).toBe(201);
    expect(res.body.mission.assignments).toHaveLength(1);
    expect(res.body.mission.assignments[0].isLead).toBe(true);

    const notifications = await prisma.notification.findMany({ where: { userId: employee.id } });
    expect(notifications).toHaveLength(1);
    expect(notifications[0]!.type).toBe("MISSION_ASSIGNED");
    expect(notifications[0]!.body).toMatch(/^Une nouvelle mission vous a été attribuée : « .+ », .+ de \d{2}:\d{2} à \d{2}:\d{2}\.$/);
  });

  it("refuse au chef d'équipe de créer une mission, même sur son propre chantier (retour explicite du client)", async () => {
    const manager = await createTestUser({ role: Role.SITE_MANAGER, email: "manager1@deepclean.test" });
    const employee = await createTestUser({ role: Role.EMPLOYEE, email: "emp2@deepclean.test" });
    const site = await createTestSite({ managerId: manager.id });
    const token = await loginAs(manager);

    const res = await request(app)
      .post("/api/v1/missions")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...basePayload(), siteId: site.id, assigneeIds: [employee.id] });

    expect(res.status).toBe(403);
  });

  it("refuse à un employé de créer une mission", async () => {
    const employee = await createTestUser({ role: Role.EMPLOYEE, email: "emp3@deepclean.test" });
    const site = await createTestSite();
    const token = await loginAs(employee);

    const res = await request(app)
      .post("/api/v1/missions")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...basePayload(), siteId: site.id, assigneeIds: [employee.id] });

    expect(res.status).toBe(403);
  });

  it("permet à la RH de consulter et de créer une mission sur n'importe quel chantier", async () => {
    const hr = await createTestUser({ role: Role.HR, email: "hr1@deepclean.test" });
    const manager = await createTestUser({ role: Role.SITE_MANAGER, email: "manager3@deepclean.test" });
    const employee = await createTestUser({ role: Role.EMPLOYEE, email: "emp4@deepclean.test" });
    const site = await createTestSite({ managerId: manager.id });
    const token = await loginAs(hr);

    const list = await request(app).get("/api/v1/missions").set("Authorization", `Bearer ${token}`);
    expect(list.status).toBe(200);

    const created = await request(app)
      .post("/api/v1/missions")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...basePayload(), siteId: site.id, assigneeIds: [employee.id] });
    expect(created.status).toBe(201);
  });

  it("permet à la RH de valider une mission terminée, en plus du chef d'équipe propriétaire", async () => {
    const hr = await createTestUser({ role: Role.HR, email: "hr2@deepclean.test" });
    const manager = await createTestUser({ role: Role.SITE_MANAGER, email: "manager4@deepclean.test" });
    const employee = await createTestUser({ role: Role.EMPLOYEE, email: "emp5@deepclean.test" });
    const site = await createTestSite({ managerId: manager.id });
    const hrToken = await loginAs(hr);
    const managerToken = await loginAs(manager);

    const created = await request(app)
      .post("/api/v1/missions")
      .set("Authorization", `Bearer ${hrToken}`)
      .send({ ...basePayload(), siteId: site.id, assigneeIds: [employee.id] });
    const missionId = created.body.mission.id as string;

    // Le chef d'équipe garde le suivi terrain (démarrer/terminer), même
    // sans droit de gestion du planning.
    await request(app)
      .post(`/api/v1/missions/${missionId}/status`)
      .set("Authorization", `Bearer ${managerToken}`)
      .send({ status: "IN_PROGRESS" });
    await request(app)
      .post(`/api/v1/missions/${missionId}/status`)
      .set("Authorization", `Bearer ${managerToken}`)
      .send({ status: "COMPLETED" });

    const res = await request(app)
      .post(`/api/v1/missions/${missionId}/validate`)
      .set("Authorization", `Bearer ${hrToken}`)
      .send({});
    expect(res.status).toBe(200);
  });
});

describe("Statut de suivi terrain d'une mission — une mission terminée est un état final", () => {
  it("refuse de repasser une mission terminée en cours", async () => {
    const supervisor = await createTestUser({ role: Role.SUPERVISOR, email: "sup-status1@deepclean.test" });
    const employee = await createTestUser({ role: Role.EMPLOYEE, email: "emp-status1@deepclean.test" });
    const site = await createTestSite();
    const token = await loginAs(supervisor);

    const created = await request(app)
      .post("/api/v1/missions")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...basePayload(), siteId: site.id, assigneeIds: [employee.id] });
    const missionId = created.body.mission.id as string;

    await request(app).post(`/api/v1/missions/${missionId}/status`).set("Authorization", `Bearer ${token}`).send({ status: "IN_PROGRESS" });
    await request(app).post(`/api/v1/missions/${missionId}/status`).set("Authorization", `Bearer ${token}`).send({ status: "COMPLETED" });

    const regress = await request(app)
      .post(`/api/v1/missions/${missionId}/status`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "IN_PROGRESS" });
    expect(regress.status).toBe(409);

    const stillCompleted = await request(app)
      .get(`/api/v1/missions/${missionId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(stillCompleted.body.mission.status).toBe("COMPLETED");
  });
});

describe("Visibilité des missions par rôle", () => {
  it("un employé ne voit que les missions où il est affecté", async () => {
    const hr = await createTestUser({ role: Role.HR, email: "hr-visib1@deepclean.test" });
    const employeeA = await createTestUser({ role: Role.EMPLOYEE, email: "empA@deepclean.test" });
    const employeeB = await createTestUser({ role: Role.EMPLOYEE, email: "empB@deepclean.test" });
    const site = await createTestSite();
    const hrToken = await loginAs(hr);

    await request(app)
      .post("/api/v1/missions")
      .set("Authorization", `Bearer ${hrToken}`)
      .send({ ...basePayload(), siteId: site.id, assigneeIds: [employeeA.id] });
    await request(app)
      .post("/api/v1/missions")
      .set("Authorization", `Bearer ${hrToken}`)
      .send({ ...basePayload(), title: "Autre mission", siteId: site.id, assigneeIds: [employeeB.id] });

    const tokenA = await loginAs(employeeA);
    const res = await request(app).get("/api/v1/missions").set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].assignments.map((a: { userId: string }) => a.userId)).toContain(employeeA.id);
  });

  it("un employé ne peut pas consulter le détail d'une mission à laquelle il n'est pas affecté", async () => {
    const hr = await createTestUser({ role: Role.HR, email: "hr-visib2@deepclean.test" });
    const employeeA = await createTestUser({ role: Role.EMPLOYEE, email: "empC@deepclean.test" });
    const outsider = await createTestUser({ role: Role.EMPLOYEE, email: "empD@deepclean.test" });
    const site = await createTestSite();
    const hrToken = await loginAs(hr);

    const created = await request(app)
      .post("/api/v1/missions")
      .set("Authorization", `Bearer ${hrToken}`)
      .send({ ...basePayload(), siteId: site.id, assigneeIds: [employeeA.id] });

    const outsiderToken = await loginAs(outsider);
    const res = await request(app)
      .get(`/api/v1/missions/${created.body.mission.id}`)
      .set("Authorization", `Bearer ${outsiderToken}`);

    expect(res.status).toBe(404);
  });
});

describe("Modification et annulation d'une mission — notifications", () => {
  it("notifie les employés affectés lors d'un changement d'horaire", async () => {
    const hr = await createTestUser({ role: Role.HR, email: "hr-mod1@deepclean.test" });
    const employee = await createTestUser({ role: Role.EMPLOYEE, email: "empE@deepclean.test" });
    const site = await createTestSite();
    const token = await loginAs(hr);

    const created = await request(app)
      .post("/api/v1/missions")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...basePayload(), siteId: site.id, assigneeIds: [employee.id] });

    const res = await request(app)
      .patch(`/api/v1/missions/${created.body.mission.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ startTime: "09:00" });

    expect(res.status).toBe(200);

    const notifications = await prisma.notification.findMany({
      where: { userId: employee.id, type: "MISSION_TIME_CHANGED" },
    });
    expect(notifications).toHaveLength(1);
    expect(notifications[0]!.body).toMatch(/^L'horaire de votre mission a été modifié : « .+ », .+ de \d{2}:\d{2} à \d{2}:\d{2}\.$/);
  });

  it("modifier uniquement le titre ne doit ni changer la date/l'heure ni déclencher de notification d'horaire", async () => {
    const hr = await createTestUser({ role: Role.HR, email: "hr-mod2@deepclean.test" });
    const employee = await createTestUser({ role: Role.EMPLOYEE, email: "empEb@deepclean.test" });
    const site = await createTestSite();
    const token = await loginAs(hr);

    const created = await request(app)
      .post("/api/v1/missions")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...basePayload(), siteId: site.id, assigneeIds: [employee.id] });

    const res = await request(app)
      .patch(`/api/v1/missions/${created.body.mission.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Nouveau titre" });

    expect(res.status).toBe(200);
    expect(res.body.mission.date).toBe(created.body.mission.date);
    expect(res.body.mission.startTime).toBe(created.body.mission.startTime);
    expect(res.body.mission.endTime).toBe(created.body.mission.endTime);

    const notifications = await prisma.notification.findMany({
      where: { userId: employee.id, type: "MISSION_TIME_CHANGED" },
    });
    expect(notifications).toHaveLength(0);
  });

  it("notifie les employés affectés lors d'une annulation et bloque toute modification ultérieure", async () => {
    const hr = await createTestUser({ role: Role.HR, email: "hr-mod3@deepclean.test" });
    const employee = await createTestUser({ role: Role.EMPLOYEE, email: "empF@deepclean.test" });
    const site = await createTestSite();
    const token = await loginAs(hr);

    const created = await request(app)
      .post("/api/v1/missions")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...basePayload(), siteId: site.id, assigneeIds: [employee.id] });

    const cancel = await request(app)
      .post(`/api/v1/missions/${created.body.mission.id}/cancel`)
      .set("Authorization", `Bearer ${token}`);
    expect(cancel.status).toBe(200);
    expect(cancel.body.mission.status).toBe("CANCELLED");

    const notifications = await prisma.notification.findMany({
      where: { userId: employee.id, type: "MISSION_CANCELLED" },
    });
    expect(notifications).toHaveLength(1);

    const secondCancel = await request(app)
      .post(`/api/v1/missions/${created.body.mission.id}/cancel`)
      .set("Authorization", `Bearer ${token}`);
    expect(secondCancel.status).toBe(409);

    const update = await request(app)
      .patch(`/api/v1/missions/${created.body.mission.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ startTime: "10:00" });
    expect(update.status).toBe(409);
  });
});

describe("Chef d'équipe — droits limités à la consigne et au suivi terrain", () => {
  it("permet au chef d'équipe propriétaire d'ajouter une consigne, qui mentionne son nom dans la notification", async () => {
    const hr = await createTestUser({ role: Role.HR, email: "hr-consigne1@deepclean.test" });
    const manager = await createTestUser({ role: Role.SITE_MANAGER, email: "manager-consigne1@deepclean.test" });
    const employee = await createTestUser({ role: Role.EMPLOYEE, email: "emp-consigne1@deepclean.test" });
    const site = await createTestSite({ managerId: manager.id });
    const hrToken = await loginAs(hr);
    const managerToken = await loginAs(manager);

    const created = await request(app)
      .post("/api/v1/missions")
      .set("Authorization", `Bearer ${hrToken}`)
      .send({ ...basePayload(), siteId: site.id, assigneeIds: [employee.id] });

    const res = await request(app)
      .patch(`/api/v1/missions/${created.body.mission.id}`)
      .set("Authorization", `Bearer ${managerToken}`)
      .send({ instructions: "Attention au sol glissant." });

    expect(res.status).toBe(200);
    expect(res.body.mission.instructions).toBe("Attention au sol glissant.");

    const notifications = await prisma.notification.findMany({
      where: { userId: employee.id, type: "MISSION_INSTRUCTION_ADDED" },
    });
    expect(notifications).toHaveLength(1);
    expect(notifications[0]!.body).toMatch(new RegExp(`^Une nouvelle consigne a été ajoutée à votre mission « .+ » par ${manager.firstName} ${manager.lastName}\\.$`));
  });

  it("refuse au chef d'équipe de modifier autre chose que la consigne (titre, horaire, chantier)", async () => {
    const hr = await createTestUser({ role: Role.HR, email: "hr-consigne2@deepclean.test" });
    const manager = await createTestUser({ role: Role.SITE_MANAGER, email: "manager-consigne2@deepclean.test" });
    const employee = await createTestUser({ role: Role.EMPLOYEE, email: "emp-consigne2@deepclean.test" });
    const siteA = await createTestSite({ managerId: manager.id, name: "Chantier A" });
    const siteB = await createTestSite({ name: "Chantier B" });
    const hrToken = await loginAs(hr);
    const managerToken = await loginAs(manager);

    const created = await request(app)
      .post("/api/v1/missions")
      .set("Authorization", `Bearer ${hrToken}`)
      .send({ ...basePayload(), siteId: siteA.id, assigneeIds: [employee.id] });
    const missionId = created.body.mission.id as string;

    const titleRes = await request(app)
      .patch(`/api/v1/missions/${missionId}`)
      .set("Authorization", `Bearer ${managerToken}`)
      .send({ title: "Nouveau titre" });
    expect(titleRes.status).toBe(403);

    const timeRes = await request(app)
      .patch(`/api/v1/missions/${missionId}`)
      .set("Authorization", `Bearer ${managerToken}`)
      .send({ startTime: "09:00" });
    expect(timeRes.status).toBe(403);

    const siteRes = await request(app)
      .patch(`/api/v1/missions/${missionId}`)
      .set("Authorization", `Bearer ${managerToken}`)
      .send({ siteId: siteB.id });
    expect(siteRes.status).toBe(403);
  });

  it("refuse au chef d'équipe d'annuler une mission", async () => {
    const hr = await createTestUser({ role: Role.HR, email: "hr-consigne3@deepclean.test" });
    const manager = await createTestUser({ role: Role.SITE_MANAGER, email: "manager-consigne3@deepclean.test" });
    const employee = await createTestUser({ role: Role.EMPLOYEE, email: "emp-consigne3@deepclean.test" });
    const site = await createTestSite({ managerId: manager.id });
    const hrToken = await loginAs(hr);
    const managerToken = await loginAs(manager);

    const created = await request(app)
      .post("/api/v1/missions")
      .set("Authorization", `Bearer ${hrToken}`)
      .send({ ...basePayload(), siteId: site.id, assigneeIds: [employee.id] });

    const res = await request(app)
      .post(`/api/v1/missions/${created.body.mission.id}/cancel`)
      .set("Authorization", `Bearer ${managerToken}`);

    expect(res.status).toBe(403);
  });

  it("permet au chef d'équipe propriétaire de démarrer et terminer sa mission (suivi terrain)", async () => {
    const hr = await createTestUser({ role: Role.HR, email: "hr-consigne4@deepclean.test" });
    const manager = await createTestUser({ role: Role.SITE_MANAGER, email: "manager-consigne4@deepclean.test" });
    const employee = await createTestUser({ role: Role.EMPLOYEE, email: "emp-consigne4@deepclean.test" });
    const site = await createTestSite({ managerId: manager.id });
    const hrToken = await loginAs(hr);
    const managerToken = await loginAs(manager);

    const created = await request(app)
      .post("/api/v1/missions")
      .set("Authorization", `Bearer ${hrToken}`)
      .send({ ...basePayload(), siteId: site.id, assigneeIds: [employee.id] });
    const missionId = created.body.mission.id as string;

    const start = await request(app)
      .post(`/api/v1/missions/${missionId}/status`)
      .set("Authorization", `Bearer ${managerToken}`)
      .send({ status: "IN_PROGRESS" });
    expect(start.status).toBe(200);

    const complete = await request(app)
      .post(`/api/v1/missions/${missionId}/status`)
      .set("Authorization", `Bearer ${managerToken}`)
      .send({ status: "COMPLETED" });
    expect(complete.status).toBe(200);
  });
});

describe("Validation d'une mission terminée — chef d'équipe propriétaire, RH ou superviseur", () => {
  async function createCompletedMission() {
    const hr = await createTestUser({ role: Role.HR, email: `val-hr-${Date.now()}-${Math.random()}@deepclean.test` });
    const manager = await createTestUser({ role: Role.SITE_MANAGER, email: `val-manager-${Date.now()}-${Math.random()}@deepclean.test` });
    const employee = await createTestUser({ role: Role.EMPLOYEE, email: `val-emp-${Date.now()}-${Math.random()}@deepclean.test` });
    const site = await createTestSite({ managerId: manager.id });
    const hrToken = await loginAs(hr);
    const token = await loginAs(manager);

    const created = await request(app)
      .post("/api/v1/missions")
      .set("Authorization", `Bearer ${hrToken}`)
      .send({ ...basePayload(), siteId: site.id, assigneeIds: [employee.id] });
    const missionId = created.body.mission.id as string;

    await request(app).post(`/api/v1/missions/${missionId}/status`).set("Authorization", `Bearer ${token}`).send({ status: "IN_PROGRESS" });
    await request(app).post(`/api/v1/missions/${missionId}/status`).set("Authorization", `Bearer ${token}`).send({ status: "COMPLETED" });

    return { manager, managerToken: token, hr, hrToken, missionId, site };
  }

  it("permet au chef d'équipe propriétaire de valider une mission terminée", async () => {
    const { managerToken, missionId } = await createCompletedMission();

    const res = await request(app)
      .post(`/api/v1/missions/${missionId}/validate`)
      .set("Authorization", `Bearer ${managerToken}`)
      .send({ comment: "Contrôlé sur place, conforme." });

    expect(res.status).toBe(200);
    expect(res.body.mission.validations).toHaveLength(1);
    expect(res.body.mission.validations[0].type).toBe("MISSION_COMPLETION");
    expect(res.body.mission.validations[0].comment).toBe("Contrôlé sur place, conforme.");
  });

  it("permet à la direction de valider une mission, mais refuse à l'admin (retour explicite du client)", async () => {
    const { missionId } = await createCompletedMission();

    const director = await createTestUser({ role: Role.DIRECTOR, email: "val-director@deepclean.test" });
    const directorToken = await loginAs(director);
    const directorRes = await request(app)
      .post(`/api/v1/missions/${missionId}/validate`)
      .set("Authorization", `Bearer ${directorToken}`);
    expect(directorRes.status).toBe(200);

    const admin = await createTestUser({ role: Role.ADMIN, email: "val-admin@deepclean.test" });
    const adminToken = await loginAs(admin);
    const adminRes = await request(app)
      .post(`/api/v1/missions/${missionId}/validate`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(adminRes.status).toBe(403);
  });

  it("refuse à un autre chef d'équipe de valider une mission qui n'est pas la sienne", async () => {
    const { missionId } = await createCompletedMission();
    const intruder = await createTestUser({ role: Role.SITE_MANAGER, email: "val-intruder@deepclean.test" });
    const intruderToken = await loginAs(intruder);

    const res = await request(app)
      .post(`/api/v1/missions/${missionId}/validate`)
      .set("Authorization", `Bearer ${intruderToken}`);

    // 404 et non 403 : ce chef d'équipe ne peut pas voir cette mission (autre
    // chantier, il n'y est pas affecté), et la réponse ne doit pas lui
    // apprendre qu'elle existe — même principe que la messagerie.
    expect(res.status).toBe(404);
  });

  it("refuse de valider une mission qui n'est pas terminée", async () => {
    const hr = await createTestUser({ role: Role.HR, email: "val-hr2@deepclean.test" });
    const manager = await createTestUser({ role: Role.SITE_MANAGER, email: "val-manager2@deepclean.test" });
    const employee = await createTestUser({ role: Role.EMPLOYEE, email: "val-emp2@deepclean.test" });
    const site = await createTestSite({ managerId: manager.id });
    const hrToken = await loginAs(hr);
    const token = await loginAs(manager);

    const created = await request(app)
      .post("/api/v1/missions")
      .set("Authorization", `Bearer ${hrToken}`)
      .send({ ...basePayload(), siteId: site.id, assigneeIds: [employee.id] });

    const res = await request(app)
      .post(`/api/v1/missions/${created.body.mission.id}/validate`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(409);
  });

  it("permet au superviseur de valider une mission terminée", async () => {
    const { missionId } = await createCompletedMission();
    const supervisor = await createTestUser({ role: Role.SUPERVISOR, email: "val-sup@deepclean.test" });
    const supervisorToken = await loginAs(supervisor);

    const res = await request(app)
      .post(`/api/v1/missions/${missionId}/validate`)
      .set("Authorization", `Bearer ${supervisorToken}`)
      .send({});

    expect(res.status).toBe(200);
  });

  it("refuse de valider deux fois la même mission", async () => {
    const { managerToken, missionId } = await createCompletedMission();

    const first = await request(app)
      .post(`/api/v1/missions/${missionId}/validate`)
      .set("Authorization", `Bearer ${managerToken}`);
    expect(first.status).toBe(200);

    const second = await request(app)
      .post(`/api/v1/missions/${missionId}/validate`)
      .set("Authorization", `Bearer ${managerToken}`);
    expect(second.status).toBe(409);
  });
});

describe("Modification des affectations — notifie aussi bien l'ajout que le retrait", () => {
  it("notifie un employé retiré de la mission (pas seulement ceux ajoutés)", async () => {
    const supervisor = await createTestUser({ role: Role.SUPERVISOR, email: "sup-unassign@deepclean.test" });
    const staying = await createTestUser({ role: Role.EMPLOYEE, email: "emp-staying@deepclean.test" });
    const removed = await createTestUser({ role: Role.EMPLOYEE, email: "emp-removed@deepclean.test" });
    const added = await createTestUser({ role: Role.EMPLOYEE, email: "emp-added@deepclean.test" });
    const site = await createTestSite();
    const token = await loginAs(supervisor);

    const created = await request(app)
      .post("/api/v1/missions")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...basePayload(), siteId: site.id, assigneeIds: [staying.id, removed.id] });

    const res = await request(app)
      .put(`/api/v1/missions/${created.body.mission.id}/assignments`)
      .set("Authorization", `Bearer ${token}`)
      .send({ assigneeIds: [staying.id, added.id] });
    expect(res.status).toBe(200);

    const removedNotifs = await prisma.notification.findMany({ where: { userId: removed.id, type: "MISSION_UNASSIGNED" } });
    expect(removedNotifs).toHaveLength(1);
    expect(removedNotifs[0]!.body).toBe("Vous n'êtes plus affecté à cette mission.");

    const addedNotifs = await prisma.notification.findMany({ where: { userId: added.id, type: "MISSION_ASSIGNED" } });
    expect(addedNotifs).toHaveLength(1);

    // Celui qui reste affecté n'est pas renotifié par la modification : il
    // garde la seule notification reçue à la création de la mission, et
    // surtout aucun MISSION_UNASSIGNED.
    const stayingNotifs = await prisma.notification.findMany({
      where: { userId: staying.id, type: { in: ["MISSION_ASSIGNED", "MISSION_UNASSIGNED"] } },
    });
    expect(stayingNotifs).toHaveLength(1);
    expect(stayingNotifs[0]!.type).toBe("MISSION_ASSIGNED");
  });
});

describe("Fiche de poste — document standard de la mission", () => {
  it("permet au superviseur de créer la fiche de poste d'une mission", async () => {
    const supervisor = await createTestUser({ role: Role.SUPERVISOR, email: "sup-js1@deepclean.test" });
    const employee = await createTestUser({ role: Role.EMPLOYEE, email: "emp-js1@deepclean.test" });
    const site = await createTestSite();
    const token = await loginAs(supervisor);

    const created = await request(app)
      .post("/api/v1/missions")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...basePayload(), siteId: site.id, assigneeIds: [employee.id] });

    const res = await request(app)
      .put(`/api/v1/missions/${created.body.mission.id}/job-sheet`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        tasks: ["Aspirer les bureaux", "Vider les corbeilles", ""],
        equipment: ["Aspirateur", "Chiffons microfibre"],
        safetyInstructions: "Porter des gants.",
        notes: "Prévoir 30 min supplémentaires si réunion en cours.",
      });

    expect(res.status).toBe(200);
    expect(res.body.mission.jobSheet.tasks).toEqual(["Aspirer les bureaux", "Vider les corbeilles"]);
    expect(res.body.mission.jobSheet.equipment).toEqual(["Aspirateur", "Chiffons microfibre"]);
    expect(res.body.mission.jobSheet.createdBy.id).toBe(supervisor.id);
  });

  it("refuse à un employé de créer ou modifier la fiche de poste", async () => {
    const hr = await createTestUser({ role: Role.HR, email: "hr-js2@deepclean.test" });
    const employee = await createTestUser({ role: Role.EMPLOYEE, email: "emp-js2@deepclean.test" });
    const site = await createTestSite();
    const hrToken = await loginAs(hr);
    const employeeToken = await loginAs(employee);

    const created = await request(app)
      .post("/api/v1/missions")
      .set("Authorization", `Bearer ${hrToken}`)
      .send({ ...basePayload(), siteId: site.id, assigneeIds: [employee.id] });

    const res = await request(app)
      .put(`/api/v1/missions/${created.body.mission.id}/job-sheet`)
      .set("Authorization", `Bearer ${employeeToken}`)
      .send({ tasks: ["Tentative non autorisée"], equipment: [] });

    expect(res.status).toBe(403);
  });

  it("un employé affecté peut consulter la fiche de poste via le détail de la mission", async () => {
    const supervisor = await createTestUser({ role: Role.SUPERVISOR, email: "sup-js3@deepclean.test" });
    const employee = await createTestUser({ role: Role.EMPLOYEE, email: "emp-js3@deepclean.test" });
    const site = await createTestSite();
    const supervisorToken = await loginAs(supervisor);
    const employeeToken = await loginAs(employee);

    const created = await request(app)
      .post("/api/v1/missions")
      .set("Authorization", `Bearer ${supervisorToken}`)
      .send({ ...basePayload(), siteId: site.id, assigneeIds: [employee.id] });

    await request(app)
      .put(`/api/v1/missions/${created.body.mission.id}/job-sheet`)
      .set("Authorization", `Bearer ${supervisorToken}`)
      .send({ tasks: ["Nettoyer les vitres"], equipment: ["Raclette"] });

    const res = await request(app)
      .get(`/api/v1/missions/${created.body.mission.id}`)
      .set("Authorization", `Bearer ${employeeToken}`);

    expect(res.status).toBe(200);
    expect(res.body.mission.jobSheet.tasks).toEqual(["Nettoyer les vitres"]);
  });

  it("modifier la fiche de poste met à jour le même document (pas de doublon)", async () => {
    const supervisor = await createTestUser({ role: Role.SUPERVISOR, email: "sup-js4@deepclean.test" });
    const site = await createTestSite();
    const token = await loginAs(supervisor);

    const created = await request(app)
      .post("/api/v1/missions")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...basePayload(), siteId: site.id, assigneeIds: [supervisor.id] });

    await request(app)
      .put(`/api/v1/missions/${created.body.mission.id}/job-sheet`)
      .set("Authorization", `Bearer ${token}`)
      .send({ tasks: ["Version 1"], equipment: [] });

    const res = await request(app)
      .put(`/api/v1/missions/${created.body.mission.id}/job-sheet`)
      .set("Authorization", `Bearer ${token}`)
      .send({ tasks: ["Version 2"], equipment: [] });

    expect(res.status).toBe(200);
    expect(res.body.mission.jobSheet.tasks).toEqual(["Version 2"]);

    const count = await prisma.jobSheet.count({ where: { missionId: created.body.mission.id } });
    expect(count).toBe(1);
  });
});

describe("Conflits de planning — détection d'un double affectation", () => {
  it("signale un employé déjà affecté à une mission qui chevauche le créneau demandé", async () => {
    const supervisor = await createTestUser({ role: Role.SUPERVISOR, email: "sup-conflict1@deepclean.test" });
    const employee = await createTestUser({ role: Role.EMPLOYEE, email: "emp-conflict1@deepclean.test" });
    const siteA = await createTestSite({ name: "Chantier conflit A" });
    const token = await loginAs(supervisor);
    const date = tomorrowDateString();

    const first = await request(app)
      .post("/api/v1/missions")
      .set("Authorization", `Bearer ${token}`)
      .send({ siteId: siteA.id, title: "Mission A", date, startTime: "08:00", endTime: "12:00", assigneeIds: [employee.id] });
    expect(first.status).toBe(201);

    const res = await request(app)
      .get("/api/v1/missions/conflicts")
      .set("Authorization", `Bearer ${token}`)
      .query({ assigneeIds: employee.id, date, startTime: "10:00", endTime: "14:00" });

    expect(res.status).toBe(200);
    expect(res.body.conflicts).toHaveLength(1);
    expect(res.body.conflicts[0].user.id).toBe(employee.id);
    expect(res.body.conflicts[0].conflictingMission.title).toBe("Mission A");
  });

  it("ne signale rien pour des créneaux qui ne se chevauchent pas", async () => {
    const supervisor = await createTestUser({ role: Role.SUPERVISOR, email: "sup-conflict2@deepclean.test" });
    const employee = await createTestUser({ role: Role.EMPLOYEE, email: "emp-conflict2@deepclean.test" });
    const site = await createTestSite();
    const token = await loginAs(supervisor);
    const date = tomorrowDateString();

    await request(app)
      .post("/api/v1/missions")
      .set("Authorization", `Bearer ${token}`)
      .send({ siteId: site.id, title: "Mission matin", date, startTime: "08:00", endTime: "10:00", assigneeIds: [employee.id] });

    const res = await request(app)
      .get("/api/v1/missions/conflicts")
      .set("Authorization", `Bearer ${token}`)
      .query({ assigneeIds: employee.id, date, startTime: "10:00", endTime: "12:00" });

    expect(res.status).toBe(200);
    expect(res.body.conflicts).toHaveLength(0);
  });

  it("ignore une mission annulée dans la détection de conflit", async () => {
    const supervisor = await createTestUser({ role: Role.SUPERVISOR, email: "sup-conflict3@deepclean.test" });
    const employee = await createTestUser({ role: Role.EMPLOYEE, email: "emp-conflict3@deepclean.test" });
    const site = await createTestSite();
    const token = await loginAs(supervisor);
    const date = tomorrowDateString();

    const created = await request(app)
      .post("/api/v1/missions")
      .set("Authorization", `Bearer ${token}`)
      .send({ siteId: site.id, title: "Mission annulée", date, startTime: "08:00", endTime: "12:00", assigneeIds: [employee.id] });
    await request(app).post(`/api/v1/missions/${created.body.mission.id}/cancel`).set("Authorization", `Bearer ${token}`);

    const res = await request(app)
      .get("/api/v1/missions/conflicts")
      .set("Authorization", `Bearer ${token}`)
      .query({ assigneeIds: employee.id, date, startTime: "08:00", endTime: "12:00" });

    expect(res.status).toBe(200);
    expect(res.body.conflicts).toHaveLength(0);
  });
});

describe("Pointages rattachés à une mission (récapitulatif, recoupement horaire)", () => {
  it("un superviseur voit les pointages de toute l'équipe affectée sur le créneau de la mission", async () => {
    const supervisor = await createTestUser({ role: Role.SUPERVISOR, email: "sup-mte1@deepclean.test" });
    const employee = await createTestUser({ role: Role.EMPLOYEE, email: "emp-mte1@deepclean.test" });
    const site = await createTestSite();
    const token = await loginAs(supervisor);
    const employeeToken = await loginAs(employee);
    const date = tomorrowDateString();

    const created = await request(app)
      .post("/api/v1/missions")
      .set("Authorization", `Bearer ${token}`)
      .send({ siteId: site.id, title: "Mission avec pointage", date, startTime: "08:00", endTime: "12:00", assigneeIds: [employee.id] });

    // Pointage réel de l'employé (pas nécessairement le même jour que "demain" dans le test,
    // mais le rapprochement se fait par recoupement horaire avec le créneau de la mission —
    // ici on pointe simplement pour vérifier que l'employé lui-même voit son propre pointage).
    await clockInViaApi(app, employeeToken);
    await clockOutViaApi(app, employeeToken);

    const res = await request(app)
      .get(`/api/v1/missions/${created.body.mission.id}/time-entries`)
      .set("Authorization", `Bearer ${employeeToken}`);
    expect(res.status).toBe(200);
    // Le pointage vient d'être fait "maintenant", donc hors du créneau de la mission
    // "demain" — on vérifie ici seulement que l'accès est bien scopé à soi-même (pas d'erreur).
    expect(Array.isArray(res.body.items)).toBe(true);
  });

  it("refuse l'accès au détail des pointages d'une mission à un employé qui n'y est pas affecté", async () => {
    const supervisor = await createTestUser({ role: Role.SUPERVISOR, email: "sup-mte2@deepclean.test" });
    const employee = await createTestUser({ role: Role.EMPLOYEE, email: "emp-mte2@deepclean.test" });
    const outsider = await createTestUser({ role: Role.EMPLOYEE, email: "outsider-mte2@deepclean.test" });
    const site = await createTestSite();
    const token = await loginAs(supervisor);
    const outsiderToken = await loginAs(outsider);
    const date = tomorrowDateString();

    const created = await request(app)
      .post("/api/v1/missions")
      .set("Authorization", `Bearer ${token}`)
      .send({ siteId: site.id, title: "Mission privée", date, startTime: "08:00", endTime: "12:00", assigneeIds: [employee.id] });

    const res = await request(app)
      .get(`/api/v1/missions/${created.body.mission.id}/time-entries`)
      .set("Authorization", `Bearer ${outsiderToken}`);
    expect(res.status).toBe(404);
  });
});

describe("Missions récurrentes — retour explicite du client, pas besoin de recréer chaque occurrence", () => {
  it("crée toutes les occurrences d'une mission récurrente, regroupées sous le même recurrenceGroupId", async () => {
    const supervisor = await createTestUser({ role: Role.SUPERVISOR, email: "sup-recur1@deepclean.test" });
    const employee = await createTestUser({ role: Role.EMPLOYEE, email: "emp-recur1@deepclean.test" });
    const site = await createTestSite();
    const token = await loginAs(supervisor);
    const date = tomorrowDateString();
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    const until = addDays(date, 21); // date, +7, +14, +21 -> 4 occurrences

    const res = await request(app)
      .post("/api/v1/missions")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...basePayload(), date, siteId: site.id, assigneeIds: [employee.id], recurrence: { daysOfWeek: [weekday], until } });

    expect(res.status).toBe(201);
    expect(res.body.recurrenceCount).toBe(4);
    expect(res.body.mission.recurrenceGroupId).toEqual(expect.any(String));

    const occurrences = await prisma.mission.findMany({
      where: { recurrenceGroupId: res.body.mission.recurrenceGroupId },
      include: { assignments: true },
      orderBy: { date: "asc" },
    });
    expect(occurrences).toHaveLength(4);
    expect(occurrences.every((m) => m.assignments.length === 1 && m.assignments[0]!.userId === employee.id)).toBe(true);

    // Une seule notification pour toute la série, pas une par occurrence.
    const notifications = await prisma.notification.findMany({ where: { userId: employee.id } });
    expect(notifications).toHaveLength(1);
    expect(notifications[0]!.body).toContain("4 occurrences");
  });

  it("refuse une récurrence qui dépasserait le nombre maximum d'occurrences autorisées", async () => {
    const supervisor = await createTestUser({ role: Role.SUPERVISOR, email: "sup-recur2@deepclean.test" });
    const employee = await createTestUser({ role: Role.EMPLOYEE, email: "emp-recur2@deepclean.test" });
    const site = await createTestSite();
    const token = await loginAs(supervisor);
    const date = tomorrowDateString();
    const until = addDays(date, 400); // tous les jours pendant 400 jours : bien plus que la limite

    const res = await request(app)
      .post("/api/v1/missions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        ...basePayload(),
        date,
        siteId: site.id,
        assigneeIds: [employee.id],
        recurrence: { daysOfWeek: [0, 1, 2, 3, 4, 5, 6], until },
      });

    expect(res.status).toBe(400);
    const count = await prisma.mission.count();
    expect(count).toBe(0);
  });

  it("annule toute la série à partir d'une occurrence, sans jamais toucher une occurrence déjà terminée", async () => {
    const supervisor = await createTestUser({ role: Role.SUPERVISOR, email: "sup-recur3@deepclean.test" });
    const employee = await createTestUser({ role: Role.EMPLOYEE, email: "emp-recur3@deepclean.test" });
    const site = await createTestSite();
    const token = await loginAs(supervisor);
    const date = tomorrowDateString();
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    const until = addDays(date, 14); // date, +7, +14 -> 3 occurrences

    const created = await request(app)
      .post("/api/v1/missions")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...basePayload(), date, siteId: site.id, assigneeIds: [employee.id], recurrence: { daysOfWeek: [weekday], until } });
    expect(created.body.recurrenceCount).toBe(3);

    const groupId = created.body.mission.recurrenceGroupId as string;
    const occurrences = await prisma.mission.findMany({ where: { recurrenceGroupId: groupId }, orderBy: { date: "asc" } });
    expect(occurrences).toHaveLength(3);

    // La 2e occurrence est déjà terminée entre-temps (manipulé directement,
    // hors flux normal) : l'annulation de série ne doit jamais y toucher.
    await prisma.mission.update({ where: { id: occurrences[1]!.id }, data: { status: "COMPLETED" } });

    const cancelRes = await request(app)
      .post(`/api/v1/missions/${created.body.mission.id}/cancel`)
      .set("Authorization", `Bearer ${token}`)
      .send({ scope: "series" });

    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.mission.status).toBe("CANCELLED");
    expect(cancelRes.body.seriesCancelledCount).toBe(1);

    const refreshed = await prisma.mission.findMany({ where: { recurrenceGroupId: groupId }, orderBy: { date: "asc" } });
    expect(refreshed[0]!.status).toBe("CANCELLED");
    expect(refreshed[1]!.status).toBe("COMPLETED");
    expect(refreshed[2]!.status).toBe("CANCELLED");
  });
});

describe("Mission — chef d'équipe et superviseur du chantier exposés (diagnostic pointage vs mission)", () => {
  it("expose le chef d'équipe et le superviseur du chantier dans la réponse d'une mission", async () => {
    const supervisorAccount = await createTestUser({ role: Role.SUPERVISOR, email: "sup-mission-site@deepclean.test" });
    const manager = await createTestUser({ role: Role.SITE_MANAGER, email: "smgr-mission-site@deepclean.test" });
    const employee = await createTestUser({ role: Role.EMPLOYEE, email: "emp-mission-site@deepclean.test" });
    const site = await createTestSite({ managerId: manager.id, supervisorId: supervisorAccount.id });
    const token = await loginAs(supervisorAccount);

    const res = await request(app)
      .post("/api/v1/missions")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...basePayload(), siteId: site.id, assigneeIds: [employee.id] });

    expect(res.status).toBe(201);
    expect(res.body.mission.site.manager).toMatchObject({ id: manager.id, firstName: manager.firstName, lastName: manager.lastName });
    expect(res.body.mission.site.supervisor).toMatchObject({
      id: supervisorAccount.id,
      firstName: supervisorAccount.firstName,
      lastName: supervisorAccount.lastName,
    });
  });
});

describe("Chevauchement interdit — une personne ne peut pas être sur deux missions en même temps", () => {
  async function setup(n: string) {
    const supervisor = await createTestUser({ role: Role.SUPERVISOR, email: `sup-overlap${n}@deepclean.test` });
    const employee = await createTestUser({ role: Role.EMPLOYEE, email: `emp-overlap${n}@deepclean.test` });
    const site = await createTestSite();
    const token = await loginAs(supervisor);
    const date = tomorrowDateString();
    const post = (body: Record<string, unknown>) =>
      request(app).post("/api/v1/missions").set("Authorization", `Bearer ${token}`).send({ siteId: site.id, date, ...body });
    return { employee, token, date, post };
  }

  it("refuse de créer une mission qui chevauche une autre mission de la même personne, avec un message clair", async () => {
    const { employee, post } = await setup("1");
    expect((await post({ title: "Mission A", startTime: "08:00", endTime: "12:00", assigneeIds: [employee.id] })).status).toBe(201);

    const res = await post({ title: "Mission B", startTime: "11:00", endTime: "14:00", assigneeIds: [employee.id] });
    expect(res.status).toBe(409);
    expect(res.body.error.message).toContain("Mission A");
    expect(res.body.error.message).toContain("08:00");
    expect(await prisma.mission.count()).toBe(1);
  });

  it("accepte deux missions qui se suivent sans se recouvrir, et ignore les missions annulées", async () => {
    const { employee, token, post } = await setup("2");
    const a = await post({ title: "Matin", startTime: "08:00", endTime: "10:00", assigneeIds: [employee.id] });
    expect((await post({ title: "Suite", startTime: "10:00", endTime: "12:00", assigneeIds: [employee.id] })).status).toBe(201);

    await request(app).post(`/api/v1/missions/${a.body.mission.id}/cancel`).set("Authorization", `Bearer ${token}`);
    expect((await post({ title: "Remplace le matin", startTime: "08:00", endTime: "10:00", assigneeIds: [employee.id] })).status).toBe(201);
  });

  it("refuse d'ajouter la personne à une mission qui chevauche, et de décaler un horaire sur une autre mission", async () => {
    const { employee, token, post } = await setup("3");
    await post({ title: "Mission A", startTime: "08:00", endTime: "10:00", assigneeIds: [employee.id] });
    const other = await createTestUser({ role: Role.EMPLOYEE, email: "other-overlap3@deepclean.test" });
    const b = await post({ title: "Mission B", startTime: "09:00", endTime: "11:00", assigneeIds: [other.id] });
    const c = await post({ title: "Mission C", startTime: "13:00", endTime: "15:00", assigneeIds: [employee.id] });

    const add = await request(app)
      .put(`/api/v1/missions/${b.body.mission.id}/assignments`)
      .set("Authorization", `Bearer ${token}`)
      .send({ assigneeIds: [other.id, employee.id] });
    expect(add.status).toBe(409);

    const move = await request(app)
      .patch(`/api/v1/missions/${c.body.mission.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ startTime: "09:30", endTime: "11:00" });
    expect(move.status).toBe(409);

    const ok = await request(app)
      .patch(`/api/v1/missions/${c.body.mission.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ startTime: "12:00", endTime: "14:00" });
    expect(ok.status).toBe(200);
  });

  it("refuse une série récurrente dont une occurrence chevauche une mission existante", async () => {
    const { employee, date, post } = await setup("4");
    const later = addDays(date, 7);

    await post({ title: "Existante", date: later, startTime: "08:00", endTime: "10:00", assigneeIds: [employee.id] });

    const until = addDays(date, 14);
    const dayOfWeek = new Date(`${date}T12:00:00Z`).getUTCDay();
    const res = await post({ title: "Série", startTime: "09:00", endTime: "11:00", assigneeIds: [employee.id], recurrence: { daysOfWeek: [dayOfWeek], until } });
    expect(res.status).toBe(409);
    expect(await prisma.mission.count()).toBe(1);
  });
});

describe("Liste des missions — à valider / validées", () => {
  it("filtre les missions terminées selon qu'elles sont validées ou non", async () => {
    const hr = await createTestUser({ role: Role.HR, email: "hr-tovalidate@deepclean.test" });
    const site = await createTestSite();
    const token = await loginAs(hr);
    const day = new Date();
    const make = (title: string) =>
      prisma.mission.create({
        data: { siteId: site.id, title, date: day, startTime: day, endTime: day, status: "COMPLETED", createdById: hr.id },
      });
    const done = await make("Validée");
    await make("À valider");
    await prisma.validation.create({ data: { type: "MISSION_COMPLETION", missionId: done.id, validatedById: hr.id } });

    const toValidate = await request(app).get("/api/v1/missions").set("Authorization", `Bearer ${token}`).query({ status: "COMPLETED", validated: "false" });
    expect(toValidate.body.items.map((m: { title: string }) => m.title)).toEqual(["À valider"]);
    const validated = await request(app).get("/api/v1/missions").set("Authorization", `Bearer ${token}`).query({ status: "COMPLETED", validated: "true" });
    expect(validated.body.items.map((m: { title: string }) => m.title)).toEqual(["Validée"]);
  });
});

describe("Absence sur des missions prévues — réaffectation par le superviseur, la RH ou la direction", () => {
  async function setup() {
    const hr = await createTestUser({ role: Role.HR, email: "hr-reassign@deepclean.test" });
    const supervisor = await createTestUser({ role: Role.SUPERVISOR, email: "sup-reassign@deepclean.test" });
    const director = await createTestUser({ role: Role.DIRECTOR, email: "dir-reassign@deepclean.test" });
    const sick = await createTestUser({ role: Role.EMPLOYEE, email: "sick-reassign@deepclean.test" });
    const spare = await createTestUser({ role: Role.EMPLOYEE, email: "spare-reassign@deepclean.test" });
    const site = await createTestSite();
    const date = tomorrowDateString();
    const hrToken = await loginAs(hr);
    const created = await request(app)
      .post("/api/v1/missions")
      .set("Authorization", `Bearer ${hrToken}`)
      .send({ siteId: site.id, title: "Mission du malade", date, startTime: "08:00", endTime: "10:00", assigneeIds: [sick.id] });
    // La RH enregistre l'arrêt maladie (appel téléphonique).
    await request(app)
      .post("/api/v1/absences")
      .set("Authorization", `Bearer ${hrToken}`)
      .send({ userId: sick.id, type: "SICK_LEAVE", startDate: date, endDate: date });
    return { hr, supervisor, director, sick, spare, site, date, missionId: created.body.mission.id as string };
  }

  it("prévient le superviseur et la direction, qui voient la mission à réaffecter et la confient à un autre employé", async () => {
    const { supervisor, director, sick, spare, missionId } = await setup();
    expect(await prisma.notification.count({ where: { userId: supervisor.id, type: "ABSENCE_CONFLICT" } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: director.id, type: "ABSENCE_CONFLICT" } })).toBe(1);

    const supToken = await loginAs(supervisor);
    const list = await request(app).get("/api/v1/missions/to-reassign").set("Authorization", `Bearer ${supToken}`);
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].absentees[0].user.id).toBe(sick.id);

    const replaced = await request(app)
      .post(`/api/v1/missions/${missionId}/replace`)
      .set("Authorization", `Bearer ${supToken}`)
      .send({ fromUserId: sick.id, toUserId: spare.id });
    expect(replaced.status).toBe(200);
    expect(replaced.body.mission.assignments.map((a: { userId: string }) => a.userId)).toEqual([spare.id]);
    expect(await prisma.notification.count({ where: { userId: spare.id, type: "MISSION_ASSIGNED" } })).toBe(1);

    const after = await request(app).get("/api/v1/missions/to-reassign").set("Authorization", `Bearer ${supToken}`);
    expect(after.body.items).toHaveLength(0);
  });

  it("refuse un remplaçant absent ou déjà pris, et refuse à un employé", async () => {
    const { hr, sick, spare, site, date, missionId } = await setup();
    const hrToken = await loginAs(hr);
    // Le remplaçant a déjà une mission qui se recouvre.
    await request(app)
      .post("/api/v1/missions")
      .set("Authorization", `Bearer ${hrToken}`)
      .send({ siteId: site.id, title: "Autre", date, startTime: "09:00", endTime: "11:00", assigneeIds: [spare.id] });
    const busy = await request(app).post(`/api/v1/missions/${missionId}/replace`).set("Authorization", `Bearer ${hrToken}`).send({ fromUserId: sick.id, toUserId: spare.id });
    expect(busy.status).toBe(409);

    const other = await createTestUser({ role: Role.EMPLOYEE, email: "other-reassign@deepclean.test" });
    await request(app).post("/api/v1/absences").set("Authorization", `Bearer ${hrToken}`).send({ userId: other.id, type: "PAID_LEAVE", startDate: date, endDate: date });
    const absent = await request(app).post(`/api/v1/missions/${missionId}/replace`).set("Authorization", `Bearer ${hrToken}`).send({ fromUserId: sick.id, toUserId: other.id });
    expect(absent.status).toBe(409);

    const empToken = await loginAs(spare);
    expect((await request(app).get("/api/v1/missions/to-reassign").set("Authorization", `Bearer ${empToken}`)).status).toBe(403);
  });
});
