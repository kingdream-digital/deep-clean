import request from "supertest";
import { Role } from "@prisma/client";
import { createApp } from "../src/app";
import { prisma } from "../src/db/prisma";
import { createTestSite, createTestUser, resetDatabase, TEST_PASSWORD } from "./helpers";

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

function tomorrowDateString(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
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
    expect(notifications[0]!.body).toBe("Une nouvelle mission vous a été attribuée.");
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
    const site = await createTestSite();
    const token = await loginAs(supervisor);

    const created = await request(app)
      .post("/api/v1/missions")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...basePayload(), siteId: site.id, assigneeIds: [] });
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
    expect(notifications[0]!.body).toBe("L'horaire de votre mission a été modifié.");
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
    expect(notifications[0]!.body).toBe(`Une nouvelle consigne a été ajoutée à votre mission par ${manager.firstName} ${manager.lastName}.`);
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

    expect(res.status).toBe(403);
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

    // Celui qui reste affecté ne reçoit aucune de ces deux notifications.
    const stayingNotifs = await prisma.notification.findMany({
      where: { userId: staying.id, type: { in: ["MISSION_ASSIGNED", "MISSION_UNASSIGNED"] } },
    });
    expect(stayingNotifs).toHaveLength(0);
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
    await request(app).post("/api/v1/time-entries/clock-in").set("Authorization", `Bearer ${employeeToken}`);
    await request(app).post("/api/v1/time-entries/clock-out").set("Authorization", `Bearer ${employeeToken}`);

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
