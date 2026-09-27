import request from "supertest";
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

describe("Pointage — arrivée / sortie", () => {
  it("permet à un employé de pointer son arrivée puis sa sortie", async () => {
    const employee = await createTestUser({ role: Role.EMPLOYEE, email: "emp-clock1@deepclean.test" });
    const token = await loginAs(employee);

    const in1 = await clockInViaApi(app, token);
    expect(in1.status).toBe(201);
    expect(in1.body.entry.clockOut).toBeNull();
    expect(in1.body.entry.status).toBe("PENDING");

    const status = await request(app).get("/api/v1/time-entries/me/status").set("Authorization", `Bearer ${token}`);
    expect(status.body.clockedIn).toBe(true);

    const out1 = await clockOutViaApi(app, token);
    expect(out1.status).toBe(200);
    expect(out1.body.entry.clockOut).not.toBeNull();
  });

  it("refuse un second pointage d'arrivée tant que le premier n'est pas clôturé", async () => {
    const employee = await createTestUser({ role: Role.EMPLOYEE, email: "emp-clock2@deepclean.test" });
    const token = await loginAs(employee);

    await clockInViaApi(app, token);
    const second = await clockInViaApi(app, token);
    expect(second.status).toBe(409);
  });

  it("refuse de clôturer un pointage inexistant", async () => {
    const employee = await createTestUser({ role: Role.EMPLOYEE, email: "emp-clock3@deepclean.test" });
    const token = await loginAs(employee);

    const out = await clockOutViaApi(app, token);
    expect(out.status).toBe(409);
  });

  it("un double-tap (deux clock-in simultanés) ne crée jamais deux pointages ouverts (condition de course corrigée)", async () => {
    const employee = await createTestUser({ role: Role.EMPLOYEE, email: "emp-race@deepclean.test" });
    const token = await loginAs(employee);

    const [res1, res2] = await Promise.all([
      clockInViaApi(app, token),
      clockInViaApi(app, token),
    ]);

    const statuses = [res1.status, res2.status].sort();
    expect(statuses).toEqual([201, 409]);

    const openEntries = await prisma.timeEntry.count({ where: { userId: employee.id, clockOut: null } });
    expect(openEntries).toBe(1);
  });
});

describe("Pointage — visibilité et validation", () => {
  it("un employé ne voit que ses propres pointages", async () => {
    const employeeA = await createTestUser({ role: Role.EMPLOYEE, email: "empA-ts@deepclean.test" });
    const employeeB = await createTestUser({ role: Role.EMPLOYEE, email: "empB-ts@deepclean.test" });
    const tokenA = await loginAs(employeeA);
    const tokenB = await loginAs(employeeB);

    await clockInViaApi(app, tokenA);
    await clockInViaApi(app, tokenB);

    const list = await request(app).get("/api/v1/time-entries").set("Authorization", `Bearer ${tokenA}`);
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].userId).toBe(employeeA.id);
  });

  it("un chef d'équipe peut valider le pointage d'un employé de son chantier, pas celui d'un employé hors équipe", async () => {
    const manager = await createTestUser({ role: Role.SITE_MANAGER, email: "mgr-ts@deepclean.test" });
    const teamEmployee = await createTestUser({ role: Role.EMPLOYEE, email: "team-ts@deepclean.test" });
    const outsideEmployee = await createTestUser({ role: Role.EMPLOYEE, email: "outside-ts@deepclean.test" });
    const site = await createTestSite({ managerId: manager.id });
    await prisma.siteMember.create({ data: { siteId: site.id, userId: teamEmployee.id } });

    const managerToken = await loginAs(manager);
    const teamToken = await loginAs(teamEmployee);
    const outsideToken = await loginAs(outsideEmployee);

    const teamIn = await clockInViaApi(app, teamToken);
    await clockOutViaApi(app, teamToken);
    const outsideIn = await clockInViaApi(app, outsideToken);
    await clockOutViaApi(app, outsideToken);

    const validateTeam = await request(app)
      .post(`/api/v1/time-entries/${teamIn.body.entry.id}/validate`)
      .set("Authorization", `Bearer ${managerToken}`)
      .send({});
    expect(validateTeam.status).toBe(200);
    expect(validateTeam.body.entry.status).toBe("VALIDATED");

    const validateOutside = await request(app)
      .post(`/api/v1/time-entries/${outsideIn.body.entry.id}/validate`)
      .set("Authorization", `Bearer ${managerToken}`)
      .send({});
    expect(validateOutside.status).toBe(403);
  });

  it("refuse à quiconque de valider ses propres heures, y compris la RH", async () => {
    const hr = await createTestUser({ role: Role.HR, email: "hr-ts@deepclean.test" });
    const hrToken = await loginAs(hr);

    const entry = await clockInViaApi(app, hrToken);
    await clockOutViaApi(app, hrToken);

    const res = await request(app)
      .post(`/api/v1/time-entries/${entry.body.entry.id}/validate`)
      .set("Authorization", `Bearer ${hrToken}`)
      .send({});
    expect(res.status).toBe(403);
  });

  it("refuse de valider un pointage encore ouvert (pas de sortie pointée)", async () => {
    const hr = await createTestUser({ role: Role.HR, email: "hr-ts2@deepclean.test" });
    const employee = await createTestUser({ role: Role.EMPLOYEE, email: "emp-ts-open@deepclean.test" });
    const hrToken = await loginAs(hr);
    const employeeToken = await loginAs(employee);

    const entry = await clockInViaApi(app, employeeToken);

    const res = await request(app)
      .post(`/api/v1/time-entries/${entry.body.entry.id}/validate`)
      .set("Authorization", `Bearer ${hrToken}`)
      .send({});
    expect(res.status).toBe(409);
  });

  it("le superviseur peut valider le pointage de n'importe quel employé, mais pas les siens", async () => {
    const supervisor = await createTestUser({ role: Role.SUPERVISOR, email: "sup-ts@deepclean.test" });
    const employee = await createTestUser({ role: Role.EMPLOYEE, email: "emp-ts-sup@deepclean.test" });
    const supervisorToken = await loginAs(supervisor);
    const employeeToken = await loginAs(employee);

    const entry = await clockInViaApi(app, employeeToken);
    await clockOutViaApi(app, employeeToken);

    const validate = await request(app)
      .post(`/api/v1/time-entries/${entry.body.entry.id}/validate`)
      .set("Authorization", `Bearer ${supervisorToken}`)
      .send({});
    expect(validate.status).toBe(200);

    const ownEntry = await clockInViaApi(app, supervisorToken);
    await clockOutViaApi(app, supervisorToken);
    const selfValidate = await request(app)
      .post(`/api/v1/time-entries/${ownEntry.body.entry.id}/validate`)
      .set("Authorization", `Bearer ${supervisorToken}`)
      .send({});
    expect(selfValidate.status).toBe(403);
  });

  it("la direction peut rejeter un pointage avec un motif, ce qui notifie l'employé", async () => {
    const director = await createTestUser({ role: Role.DIRECTOR, email: "dir-ts@deepclean.test" });
    const employee = await createTestUser({ role: Role.EMPLOYEE, email: "emp-ts-reject@deepclean.test" });
    const directorToken = await loginAs(director);
    const employeeToken = await loginAs(employee);

    const entry = await clockInViaApi(app, employeeToken);
    await clockOutViaApi(app, employeeToken);

    const res = await request(app)
      .post(`/api/v1/time-entries/${entry.body.entry.id}/reject`)
      .set("Authorization", `Bearer ${directorToken}`)
      .send({ comment: "Horaire incohérent avec le planning." });
    expect(res.status).toBe(200);
    expect(res.body.entry.status).toBe("REJECTED");

    const notifications = await prisma.notification.findMany({ where: { userId: employee.id } });
    expect(notifications).toHaveLength(1);
    expect(notifications[0]!.type).toBe("TIMESHEET_VALIDATED");
  });

  it("la notification de validation mentionne le validateur et précise la transmission à la RH", async () => {
    const hr = await createTestUser({ role: Role.HR, email: "hr-notif@deepclean.test" });
    const employee = await createTestUser({ role: Role.EMPLOYEE, email: "emp-ts-notif@deepclean.test" });
    const hrToken = await loginAs(hr);
    const employeeToken = await loginAs(employee);

    const entry = await clockInViaApi(app, employeeToken);
    await clockOutViaApi(app, employeeToken);

    await request(app)
      .post(`/api/v1/time-entries/${entry.body.entry.id}/validate`)
      .set("Authorization", `Bearer ${hrToken}`)
      .send({});

    const notifications = await prisma.notification.findMany({ where: { userId: employee.id } });
    expect(notifications).toHaveLength(1);
    expect(notifications[0]!.body).toContain(`${hr.firstName} ${hr.lastName}`);
    expect(notifications[0]!.body).toContain("transmises à la RH");
    expect(notifications[0]!.relatedEntityType).toBe("TimeEntry");
    expect(notifications[0]!.relatedEntityId).toBe(entry.body.entry.id);
  });
});

describe("Consultation d'un pointage précis (GET /time-entries/:id)", () => {
  it("un employé peut consulter son propre pointage", async () => {
    const employee = await createTestUser({ role: Role.EMPLOYEE, email: "emp-get1@deepclean.test" });
    const token = await loginAs(employee);
    const entry = await clockInViaApi(app, token);

    const res = await request(app)
      .get(`/api/v1/time-entries/${entry.body.entry.id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.entry.id).toBe(entry.body.entry.id);
  });

  it("refuse à un employé de consulter le pointage d'un autre employé (404, pas 403)", async () => {
    const employeeA = await createTestUser({ role: Role.EMPLOYEE, email: "emp-get2@deepclean.test" });
    const employeeB = await createTestUser({ role: Role.EMPLOYEE, email: "emp-get3@deepclean.test" });
    const tokenA = await loginAs(employeeA);
    const tokenB = await loginAs(employeeB);
    const entry = await clockInViaApi(app, tokenA);

    const res = await request(app)
      .get(`/api/v1/time-entries/${entry.body.entry.id}`)
      .set("Authorization", `Bearer ${tokenB}`);
    expect(res.status).toBe(404);
  });

  it("permet au superviseur de consulter le pointage de n'importe quel employé", async () => {
    const supervisor = await createTestUser({ role: Role.SUPERVISOR, email: "sup-get1@deepclean.test" });
    const employee = await createTestUser({ role: Role.EMPLOYEE, email: "emp-get4@deepclean.test" });
    const supervisorToken = await loginAs(supervisor);
    const employeeToken = await loginAs(employee);
    const entry = await clockInViaApi(app, employeeToken);

    const res = await request(app)
      .get(`/api/v1/time-entries/${entry.body.entry.id}`)
      .set("Authorization", `Bearer ${supervisorToken}`);
    expect(res.status).toBe(200);
  });
});

describe("Pointage différé (oubli de pointer)", () => {
  it("permet de saisir une session déjà terminée, marquée comme différée", async () => {
    const employee = await createTestUser({ role: Role.EMPLOYEE, email: "emp-retro1@deepclean.test" });
    const token = await loginAs(employee);

    const clockIn = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    const clockOut = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();

    const res = await request(app)
      .post("/api/v1/time-entries/retroactive")
      .set("Authorization", `Bearer ${token}`)
      .send({ clockIn, clockOut, comment: "Oubli de pointer ce matin." });

    expect(res.status).toBe(201);
    expect(res.body.entry.isRetroactive).toBe(true);
    expect(res.body.entry.status).toBe("PENDING");
  });

  it("refuse une sortie postérieure à l'heure d'entrée", async () => {
    const employee = await createTestUser({ role: Role.EMPLOYEE, email: "emp-retro2@deepclean.test" });
    const token = await loginAs(employee);

    const clockIn = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
    const clockOut = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

    const res = await request(app)
      .post("/api/v1/time-entries/retroactive")
      .set("Authorization", `Bearer ${token}`)
      .send({ clockIn, clockOut });
    expect(res.status).toBe(400);
  });

  it("refuse une période future", async () => {
    const employee = await createTestUser({ role: Role.EMPLOYEE, email: "emp-retro3@deepclean.test" });
    const token = await loginAs(employee);

    const clockIn = new Date(Date.now() + 1 * 60 * 60 * 1000).toISOString();
    const clockOut = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

    const res = await request(app)
      .post("/api/v1/time-entries/retroactive")
      .set("Authorization", `Bearer ${token}`)
      .send({ clockIn, clockOut });
    expect(res.status).toBe(400);
  });

  it("refuse une période qui chevauche un pointage déjà enregistré", async () => {
    const employee = await createTestUser({ role: Role.EMPLOYEE, email: "emp-retro4@deepclean.test" });
    const token = await loginAs(employee);

    const clockIn = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    const clockOut = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
    await request(app)
      .post("/api/v1/time-entries/retroactive")
      .set("Authorization", `Bearer ${token}`)
      .send({ clockIn, clockOut });

    const overlapIn = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const overlapOut = new Date(Date.now() - 0.5 * 60 * 60 * 1000).toISOString();
    const res = await request(app)
      .post("/api/v1/time-entries/retroactive")
      .set("Authorization", `Bearer ${token}`)
      .send({ clockIn: overlapIn, clockOut: overlapOut });
    expect(res.status).toBe(409);
  });

  it("refuse une période remontant à plus de 7 jours", async () => {
    const employee = await createTestUser({ role: Role.EMPLOYEE, email: "emp-retro5@deepclean.test" });
    const token = await loginAs(employee);

    const clockIn = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const clockOut = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000).toISOString();

    const res = await request(app)
      .post("/api/v1/time-entries/retroactive")
      .set("Authorization", `Bearer ${token}`)
      .send({ clockIn, clockOut });
    expect(res.status).toBe(400);
  });
});

describe("Portée du filtre ?userId= — jamais un contournement de la restriction d'équipe", () => {
  it("refuse à un chef d'équipe de consulter les pointages d'un employé hors de son équipe via ?userId=", async () => {
    const manager = await createTestUser({ role: Role.SITE_MANAGER, email: "mgr-scope-ts@deepclean.test" });
    const outsider = await createTestUser({ role: Role.EMPLOYEE, email: "outsider-scope-ts@deepclean.test" });
    const managerToken = await loginAs(manager);
    const outsiderToken = await loginAs(outsider);

    await clockInViaApi(app, outsiderToken);

    const res = await request(app)
      .get(`/api/v1/time-entries?userId=${outsider.id}`)
      .set("Authorization", `Bearer ${managerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(0);
  });

  it("permet à un chef d'équipe de consulter les pointages d'un membre de son équipe via ?userId=", async () => {
    const manager = await createTestUser({ role: Role.SITE_MANAGER, email: "mgr-scope-ts2@deepclean.test" });
    const teamMember = await createTestUser({ role: Role.EMPLOYEE, email: "team-scope-ts2@deepclean.test" });
    const site = await createTestSite({ managerId: manager.id });
    await prisma.siteMember.create({ data: { siteId: site.id, userId: teamMember.id } });
    const managerToken = await loginAs(manager);
    const teamToken = await loginAs(teamMember);

    await clockInViaApi(app, teamToken);

    const res = await request(app)
      .get(`/api/v1/time-entries?userId=${teamMember.id}`)
      .set("Authorization", `Bearer ${managerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
  });
});

describe("Export CSV des pointages (dossier RH pour la paie)", () => {
  it("exporte un CSV avec le bon en-tête et les bonnes lignes, dans la même portée que la consultation", async () => {
    const hr = await createTestUser({ role: Role.HR, email: "hr-export1@deepclean.test" });
    const employee = await createTestUser({ role: Role.EMPLOYEE, email: "emp-export1@deepclean.test" });
    const hrToken = await loginAs(hr);
    const employeeToken = await loginAs(employee);

    await clockInViaApi(app, employeeToken);
    await clockOutViaApi(app, employeeToken);

    const res = await request(app)
      .get(`/api/v1/time-entries/export?userId=${employee.id}`)
      .set("Authorization", `Bearer ${hrToken}`);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    const text = res.text.replace(/^﻿/, "");
    const lines = text.split("\r\n");
    expect(lines[0]).toBe("Employé;Date;Arrivée;Départ;Durée (h);Statut;Différé;Commentaire");
    expect(lines[1]).toContain("Test User");
    expect(lines[1]).toContain("En attente");
  });

  it("un employé ne peut exporter que ses propres heures", async () => {
    const employeeA = await createTestUser({ role: Role.EMPLOYEE, email: "emp-export2@deepclean.test" });
    const employeeB = await createTestUser({ role: Role.EMPLOYEE, email: "emp-export3@deepclean.test" });
    const tokenA = await loginAs(employeeA);
    const tokenB = await loginAs(employeeB);

    await clockInViaApi(app, tokenB);

    const res = await request(app)
      .get(`/api/v1/time-entries/export?userId=${employeeB.id}`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    const text = res.text.replace(/^﻿/, "");
    const lines = text.split("\r\n").filter(Boolean);
    expect(lines).toHaveLength(1); // en-tête seul, aucune ligne de données
  });

  it("neutralise l'injection de formule CSV et échappe le point-virgule dans un commentaire", async () => {
    const hr = await createTestUser({ role: Role.HR, email: "hr-export4@deepclean.test" });
    const employee = await createTestUser({ role: Role.EMPLOYEE, email: "emp-export4@deepclean.test" });
    const hrToken = await loginAs(hr);
    const employeeToken = await loginAs(employee);

    const clockIn = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    const clockOut = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
    await request(app)
      .post("/api/v1/time-entries/retroactive")
      .set("Authorization", `Bearer ${employeeToken}`)
      .send({ clockIn, clockOut, comment: '=HYPERLINK("http://attaquant.example");Retard ; embouteillage' });

    const res = await request(app)
      .get(`/api/v1/time-entries/export?userId=${employee.id}`)
      .set("Authorization", `Bearer ${hrToken}`);

    expect(res.status).toBe(200);
    const text = res.text.replace(/^﻿/, "");
    // Le commentaire commence par "=" : préfixé d'une apostrophe pour qu'Excel/LibreOffice
    // ne l'interprète jamais comme une formule, et entièrement entre guillemets
    // puisqu'il contient des ";" (le vrai délimiteur de ce fichier).
    expect(text).toContain('"\'=HYPERLINK(""http://attaquant.example"");Retard ; embouteillage"');
    expect(text).not.toMatch(/;=HYPERLINK/); // jamais interprétable comme une nouvelle colonne démarrant par "="
  });
});

describe("Rapprochement pointage <-> mission (menu RH — qui a un écart à examiner)", () => {
  function tomorrowDateString(): string {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  }

  function dateAt(dateStr: string, hour: number, minute = 0): Date {
    return new Date(`${dateStr}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`);
  }

  async function createMission(
    token: string,
    siteId: string,
    employeeId: string,
    date: string,
    startTime: string,
    endTime: string
  ) {
    return request(app)
      .post("/api/v1/missions")
      .set("Authorization", `Bearer ${token}`)
      .send({ siteId, title: "Mission recon", date, startTime, endTime, assigneeIds: [employeeId] });
  }

  it("statut OK quand les heures pointées correspondent à la mission planifiée et sont validées", async () => {
    const hr = await createTestUser({ role: Role.HR, email: "hr-recon1@deepclean.test" });
    const employee = await createTestUser({ role: Role.EMPLOYEE, email: "emp-recon1@deepclean.test" });
    const site = await createTestSite();
    const hrToken = await loginAs(hr);
    const date = tomorrowDateString();

    await createMission(hrToken, site.id, employee.id, date, "08:00", "16:00");
    await prisma.timeEntry.create({
      data: {
        userId: employee.id,
        clockIn: dateAt(date, 8),
        clockOut: dateAt(date, 16),
        status: "VALIDATED",
        validatedById: hr.id,
        validatedAt: new Date(),
      },
    });

    const res = await request(app)
      .get(`/api/v1/time-entries/reconciliation?from=${date}&to=${date}`)
      .set("Authorization", `Bearer ${hrToken}`);
    expect(res.status).toBe(200);
    const row = res.body.items.find((r: { user: { id: string } }) => r.user.id === employee.id);
    expect(row).toBeDefined();
    expect(row.status).toBe("OK");
  });

  it("statut ANOMALY quand un pointage de la période est encore en attente de validation", async () => {
    const hr = await createTestUser({ role: Role.HR, email: "hr-recon2@deepclean.test" });
    const employee = await createTestUser({ role: Role.EMPLOYEE, email: "emp-recon2@deepclean.test" });
    const site = await createTestSite();
    const hrToken = await loginAs(hr);
    const date = tomorrowDateString();

    await createMission(hrToken, site.id, employee.id, date, "08:00", "16:00");
    await prisma.timeEntry.create({
      data: { userId: employee.id, clockIn: dateAt(date, 8), clockOut: dateAt(date, 16) }, // PENDING par défaut
    });

    const res = await request(app)
      .get(`/api/v1/time-entries/reconciliation?from=${date}&to=${date}`)
      .set("Authorization", `Bearer ${hrToken}`);
    const row = res.body.items.find((r: { user: { id: string } }) => r.user.id === employee.id);
    expect(row.status).toBe("ANOMALY");
    expect(row.pendingCount).toBe(1);
  });

  it("statut ANOMALY quand les heures pointées sont nettement inférieures à la mission planifiée (un trou), même validées", async () => {
    const hr = await createTestUser({ role: Role.HR, email: "hr-recon3@deepclean.test" });
    const employee = await createTestUser({ role: Role.EMPLOYEE, email: "emp-recon3@deepclean.test" });
    const site = await createTestSite();
    const hrToken = await loginAs(hr);
    const date = tomorrowDateString();

    await createMission(hrToken, site.id, employee.id, date, "08:00", "16:00");
    await prisma.timeEntry.create({
      data: {
        userId: employee.id,
        clockIn: dateAt(date, 8),
        clockOut: dateAt(date, 10), // 2h pointées sur 8h prévues
        status: "VALIDATED",
        validatedById: hr.id,
        validatedAt: new Date(),
      },
    });

    const res = await request(app)
      .get(`/api/v1/time-entries/reconciliation?from=${date}&to=${date}`)
      .set("Authorization", `Bearer ${hrToken}`);
    const row = res.body.items.find((r: { user: { id: string } }) => r.user.id === employee.id);
    expect(row.status).toBe("ANOMALY");
  });

  it("des heures en plus mais validées restent OK au global, et affichent les heures supplémentaires sur le pointage", async () => {
    const hr = await createTestUser({ role: Role.HR, email: "hr-recon4@deepclean.test" });
    const employee = await createTestUser({ role: Role.EMPLOYEE, email: "emp-recon4@deepclean.test" });
    const site = await createTestSite();
    const hrToken = await loginAs(hr);
    const date = tomorrowDateString();

    await createMission(hrToken, site.id, employee.id, date, "08:00", "16:00");
    const entry = await prisma.timeEntry.create({
      data: {
        userId: employee.id,
        clockIn: dateAt(date, 8),
        clockOut: dateAt(date, 18), // 2h de plus que prévu
        status: "VALIDATED",
        validatedById: hr.id,
        validatedAt: new Date(),
      },
    });

    const reconRes = await request(app)
      .get(`/api/v1/time-entries/reconciliation?from=${date}&to=${date}`)
      .set("Authorization", `Bearer ${hrToken}`);
    const row = reconRes.body.items.find((r: { user: { id: string } }) => r.user.id === employee.id);
    expect(row.status).toBe("OK");

    const listRes = await request(app)
      .get(`/api/v1/time-entries?userId=${employee.id}&from=${date}&to=${date}`)
      .set("Authorization", `Bearer ${hrToken}`);
    const found = listRes.body.items.find((e: { id: string }) => e.id === entry.id);
    expect(found.overtimeMinutes).toBeGreaterThanOrEqual(100);
    expect(found.overtimeMinutes).toBeLessThanOrEqual(140);
  });

  it("n'affiche pas d'heures supplémentaires tant que le pointage n'est pas validé", async () => {
    const hr = await createTestUser({ role: Role.HR, email: "hr-recon5@deepclean.test" });
    const employee = await createTestUser({ role: Role.EMPLOYEE, email: "emp-recon5@deepclean.test" });
    const site = await createTestSite();
    const hrToken = await loginAs(hr);
    const date = tomorrowDateString();

    await createMission(hrToken, site.id, employee.id, date, "08:00", "16:00");
    const entry = await prisma.timeEntry.create({
      data: { userId: employee.id, clockIn: dateAt(date, 8), clockOut: dateAt(date, 18) }, // PENDING
    });

    const listRes = await request(app)
      .get(`/api/v1/time-entries?userId=${employee.id}&from=${date}&to=${date}`)
      .set("Authorization", `Bearer ${hrToken}`);
    const found = listRes.body.items.find((e: { id: string }) => e.id === entry.id);
    expect(found.overtimeMinutes).toBeNull();
  });

  it("le détail par employé rattache les pointages à la bonne mission et isole ceux sans mission correspondante", async () => {
    const hr = await createTestUser({ role: Role.HR, email: "hr-recon6@deepclean.test" });
    const employee = await createTestUser({ role: Role.EMPLOYEE, email: "emp-recon6@deepclean.test" });
    const site = await createTestSite();
    const hrToken = await loginAs(hr);
    const date = tomorrowDateString();

    await createMission(hrToken, site.id, employee.id, date, "08:00", "16:00");
    await prisma.timeEntry.create({
      data: { userId: employee.id, clockIn: dateAt(date, 8), clockOut: dateAt(date, 16), status: "VALIDATED", validatedById: hr.id, validatedAt: new Date() },
    });
    // Pointage isolé, loin du créneau de la mission (hors marge de 3h) : ne doit pas s'y rattacher.
    await prisma.timeEntry.create({
      data: { userId: employee.id, clockIn: dateAt(date, 22), clockOut: dateAt(date, 23) },
    });

    const res = await request(app)
      .get(`/api/v1/time-entries/reconciliation/${employee.id}?from=${date}&to=${date}`)
      .set("Authorization", `Bearer ${hrToken}`);
    expect(res.status).toBe(200);
    expect(res.body.missions).toHaveLength(1);
    expect(res.body.missions[0].matchedEntries).toHaveLength(1);
    expect(res.body.missions[0].gapMinutes).toBe(0);
    expect(res.body.unmatchedEntries).toHaveLength(1);
  });

  it("refuse la vue d'ensemble à un employé, mais lui laisse consulter son propre détail (pas celui d'un collègue)", async () => {
    const employeeA = await createTestUser({ role: Role.EMPLOYEE, email: "emp-recon7@deepclean.test" });
    const employeeB = await createTestUser({ role: Role.EMPLOYEE, email: "emp-recon8@deepclean.test" });
    const tokenA = await loginAs(employeeA);
    const date = tomorrowDateString();

    const list = await request(app)
      .get(`/api/v1/time-entries/reconciliation?from=${date}&to=${date}`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect(list.status).toBe(403);

    const ownDetail = await request(app)
      .get(`/api/v1/time-entries/reconciliation/${employeeA.id}?from=${date}&to=${date}`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect(ownDetail.status).toBe(200);

    const otherDetail = await request(app)
      .get(`/api/v1/time-entries/reconciliation/${employeeB.id}?from=${date}&to=${date}`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect(otherDetail.status).toBe(404);
  });

  it("un chef d'équipe ne voit dans le rapprochement que les membres de son équipe", async () => {
    const manager = await createTestUser({ role: Role.SITE_MANAGER, email: "mgr-recon1@deepclean.test" });
    const teamEmployee = await createTestUser({ role: Role.EMPLOYEE, email: "team-recon1@deepclean.test" });
    const outsider = await createTestUser({ role: Role.EMPLOYEE, email: "outsider-recon1@deepclean.test" });
    const managedSite = await createTestSite({ managerId: manager.id });
    const otherSite = await createTestSite();
    await prisma.siteMember.create({ data: { siteId: managedSite.id, userId: teamEmployee.id } });
    const managerToken = await loginAs(manager);
    const hr = await createTestUser({ role: Role.HR, email: "hr-recon9@deepclean.test" });
    const hrToken = await loginAs(hr);
    const date = tomorrowDateString();

    await createMission(hrToken, managedSite.id, teamEmployee.id, date, "08:00", "16:00");
    await createMission(hrToken, otherSite.id, outsider.id, date, "08:00", "16:00");
    await prisma.timeEntry.create({
      data: { userId: teamEmployee.id, clockIn: dateAt(date, 8), clockOut: dateAt(date, 16), status: "VALIDATED", validatedById: hr.id, validatedAt: new Date() },
    });
    await prisma.timeEntry.create({
      data: { userId: outsider.id, clockIn: dateAt(date, 8), clockOut: dateAt(date, 16), status: "VALIDATED", validatedById: hr.id, validatedAt: new Date() },
    });

    const res = await request(app)
      .get(`/api/v1/time-entries/reconciliation?from=${date}&to=${date}`)
      .set("Authorization", `Bearer ${managerToken}`);
    expect(res.status).toBe(200);
    const ids = res.body.items.map((r: { user: { id: string } }) => r.user.id);
    expect(ids).toContain(teamEmployee.id);
    expect(ids).not.toContain(outsider.id);

    const detail = await request(app)
      .get(`/api/v1/time-entries/reconciliation/${outsider.id}?from=${date}&to=${date}`)
      .set("Authorization", `Bearer ${managerToken}`);
    expect(detail.status).toBe(404);
  });

  it("un pointage refusé ne compte jamais comme du temps travaillé, ni dans la liste ni dans le détail", async () => {
    const hr = await createTestUser({ role: Role.HR, email: "hr-recon10@deepclean.test" });
    const employee = await createTestUser({ role: Role.EMPLOYEE, email: "emp-recon10@deepclean.test" });
    const site = await createTestSite();
    const hrToken = await loginAs(hr);
    const date = tomorrowDateString();

    await createMission(hrToken, site.id, employee.id, date, "08:00", "16:00");
    // Un pointage validé de 2h (bien en-deçà des 8h prévues) + un pointage
    // refusé de 6h : avant le correctif, le refusé aurait fait croire que les
    // 8h étaient couvertes.
    await prisma.timeEntry.create({
      data: {
        userId: employee.id,
        clockIn: dateAt(date, 8),
        clockOut: dateAt(date, 10),
        status: "VALIDATED",
        validatedById: hr.id,
        validatedAt: new Date(),
      },
    });
    await prisma.timeEntry.create({
      data: {
        userId: employee.id,
        clockIn: dateAt(date, 10),
        clockOut: dateAt(date, 16),
        status: "REJECTED",
        validatedById: hr.id,
        validatedAt: new Date(),
        comment: "Horaire incohérent",
      },
    });

    const list = await request(app)
      .get(`/api/v1/time-entries/reconciliation?from=${date}&to=${date}`)
      .set("Authorization", `Bearer ${hrToken}`);
    const row = list.body.items.find((r: { user: { id: string } }) => r.user.id === employee.id);
    expect(row.workedMinutes).toBe(120); // seulement les 2h validées
    expect(row.status).toBe("ANOMALY"); // rejectedCount > 0 ET trou de 6h non couvert

    const detail = await request(app)
      .get(`/api/v1/time-entries/reconciliation/${employee.id}?from=${date}&to=${date}`)
      .set("Authorization", `Bearer ${hrToken}`);
    expect(detail.body.totals.workedMinutes).toBe(120);
    expect(detail.body.missions[0].workedMinutes).toBe(120);
    // Le pointage refusé reste visible dans le détail (contexte pour la RH),
    // juste exclu du total d'heures.
    expect(detail.body.missions[0].matchedEntries).toHaveLength(2);
  });
});
