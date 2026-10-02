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

function futureRange(startInDays: number, endInDays: number): { startDate: string; endDate: string } {
  const start = new Date();
  start.setDate(start.getDate() + startInDays);
  const end = new Date();
  end.setDate(end.getDate() + endInDays);
  return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) };
}

describe("Congés — le chef d'équipe n'en décide jamais (simple référent de chantier)", () => {
  it("refuse à un chef d'équipe de valider le congé d'un membre de sa propre équipe (retour explicite du client, correction)", async () => {
    const manager = await createTestUser({ role: Role.SITE_MANAGER, email: "smgr-abs1@deepclean.test" });
    const employee = await createTestUser({ role: Role.EMPLOYEE, email: "abs-emp1@deepclean.test", leaveAccrualRate: 10 });
    const site = await createTestSite({ managerId: manager.id });
    await prisma.siteMember.create({ data: { siteId: site.id, userId: employee.id } });

    const employeeToken = await loginAs(employee);
    const managerToken = await loginAs(manager);

    const { startDate, endDate } = futureRange(10, 12);
    const created = await request(app)
      .post("/api/v1/absences")
      .set("Authorization", `Bearer ${employeeToken}`)
      .send({ type: "PAID_LEAVE", startDate, endDate });
    expect(created.status).toBe(201);
    expect(created.body.absence.status).toBe("PENDING");

    const decided = await request(app)
      .post(`/api/v1/absences/${created.body.absence.id}/decide`)
      .set("Authorization", `Bearer ${managerToken}`)
      .send({ status: "APPROVED" });

    expect(decided.status).toBe(403);
  });

  it("refuse aussi à un chef d'équipe d'annuler le congé d'un membre de son équipe", async () => {
    const hr = await createTestUser({ role: Role.HR, email: "hr-abs-cancel@deepclean.test" });
    const manager = await createTestUser({ role: Role.SITE_MANAGER, email: "smgr-abs3@deepclean.test" });
    const employee = await createTestUser({ role: Role.EMPLOYEE, email: "abs-emp10@deepclean.test" });
    const site = await createTestSite({ managerId: manager.id });
    await prisma.siteMember.create({ data: { siteId: site.id, userId: employee.id } });

    const hrToken = await loginAs(hr);
    const managerToken = await loginAs(manager);
    const employeeToken = await loginAs(employee);

    const { startDate, endDate } = futureRange(10, 12);
    const created = await request(app)
      .post("/api/v1/absences")
      .set("Authorization", `Bearer ${employeeToken}`)
      .send({ type: "PAID_LEAVE", startDate, endDate });

    await request(app)
      .post(`/api/v1/absences/${created.body.absence.id}/decide`)
      .set("Authorization", `Bearer ${hrToken}`)
      .send({ status: "APPROVED" });

    const cancelled = await request(app)
      .post(`/api/v1/absences/${created.body.absence.id}/cancel`)
      .set("Authorization", `Bearer ${managerToken}`);

    expect(cancelled.status).toBe(403);
  });
});

describe("Congés — déduction et recrédit automatiques du solde", () => {
  it("déduit le nombre de jours ouvrés du solde à la validation d'un congé payé", async () => {
    const hr = await createTestUser({ role: Role.HR, email: "hr-abs1@deepclean.test" });
    const employee = await createTestUser({ role: Role.EMPLOYEE, email: "abs-emp3@deepclean.test", leaveAccrualRate: 10 });
    const hrToken = await loginAs(hr);
    const employeeToken = await loginAs(employee);

    // Lundi -> vendredi de la semaine prochaine = 5 jours ouvrés (peu importe
    // le jour d'exécution du test, on part d'un lundi calculé dynamiquement).
    const nextMonday = new Date();
    nextMonday.setDate(nextMonday.getDate() + ((8 - nextMonday.getDay()) % 7 || 7));
    const nextFriday = new Date(nextMonday);
    nextFriday.setDate(nextMonday.getDate() + 4);
    const startDate = nextMonday.toISOString().slice(0, 10);
    const endDate = nextFriday.toISOString().slice(0, 10);

    const created = await request(app)
      .post("/api/v1/absences")
      .set("Authorization", `Bearer ${employeeToken}`)
      .send({ type: "PAID_LEAVE", startDate, endDate });
    expect(created.body.absence.daysCount).toBe(5);

    const before = await request(app).get(`/api/v1/leave/${employee.id}/balance`).set("Authorization", `Bearer ${employeeToken}`);
    expect(before.body.balance.pending).toBe(5);

    await request(app)
      .post(`/api/v1/absences/${created.body.absence.id}/decide`)
      .set("Authorization", `Bearer ${hrToken}`)
      .send({ status: "APPROVED" });

    const after = await request(app).get(`/api/v1/leave/${employee.id}/balance`).set("Authorization", `Bearer ${employeeToken}`);
    expect(after.body.balance.taken).toBe(5);
    expect(after.body.balance.pending).toBe(0);
    // "before" comptait déjà les 5 jours en "en attente" (donc déjà déduits
    // du restant) ; l'approbation les fait juste basculer vers "pris", le
    // restant ne bouge pas une seconde fois.
    expect(after.body.balance.remaining).toBeCloseTo(before.body.balance.remaining, 5);
  });

  it("ne déduit rien pour un arrêt maladie (chaque type garde sa propre logique)", async () => {
    const hr = await createTestUser({ role: Role.HR, email: "hr-abs2@deepclean.test" });
    const employee = await createTestUser({ role: Role.EMPLOYEE, email: "abs-emp4@deepclean.test", leaveAccrualRate: 10 });
    const hrToken = await loginAs(hr);
    const employeeToken = await loginAs(employee);
    const { startDate, endDate } = futureRange(5, 6);

    const created = await request(app)
      .post("/api/v1/absences")
      .set("Authorization", `Bearer ${employeeToken}`)
      .send({ type: "SICK_LEAVE", startDate, endDate });

    const before = await request(app).get(`/api/v1/leave/${employee.id}/balance`).set("Authorization", `Bearer ${employeeToken}`);

    await request(app)
      .post(`/api/v1/absences/${created.body.absence.id}/decide`)
      .set("Authorization", `Bearer ${hrToken}`)
      .send({ status: "APPROVED" });

    const after = await request(app).get(`/api/v1/leave/${employee.id}/balance`).set("Authorization", `Bearer ${employeeToken}`);
    expect(after.body.balance.taken).toBe(0);
    expect(after.body.balance.remaining).toBe(before.body.balance.remaining);
  });

  it("recrédite le solde quand un congé payé approuvé est annulé", async () => {
    const hr = await createTestUser({ role: Role.HR, email: "hr-abs3@deepclean.test" });
    const employee = await createTestUser({ role: Role.EMPLOYEE, email: "abs-emp5@deepclean.test", leaveAccrualRate: 10 });
    const hrToken = await loginAs(hr);
    const employeeToken = await loginAs(employee);
    const { startDate, endDate } = futureRange(20, 21);

    const created = await request(app)
      .post("/api/v1/absences")
      .set("Authorization", `Bearer ${employeeToken}`)
      .send({ type: "PAID_LEAVE", startDate, endDate });

    await request(app)
      .post(`/api/v1/absences/${created.body.absence.id}/decide`)
      .set("Authorization", `Bearer ${hrToken}`)
      .send({ status: "APPROVED" });

    const afterApproval = await request(app).get(`/api/v1/leave/${employee.id}/balance`).set("Authorization", `Bearer ${employeeToken}`);
    expect(afterApproval.body.balance.taken).toBeGreaterThan(0);

    const cancelled = await request(app)
      .post(`/api/v1/absences/${created.body.absence.id}/cancel`)
      .set("Authorization", `Bearer ${hrToken}`);
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.absence.status).toBe("CANCELLED");

    const afterCancel = await request(app).get(`/api/v1/leave/${employee.id}/balance`).set("Authorization", `Bearer ${employeeToken}`);
    expect(afterCancel.body.balance.taken).toBe(0);
    expect(afterCancel.body.balance.remaining).toBeCloseTo(
      afterApproval.body.balance.remaining + afterApproval.body.balance.taken,
      5
    );

    const history = await request(app).get(`/api/v1/leave/${employee.id}/transactions`).set("Authorization", `Bearer ${employeeToken}`);
    expect(history.body.items.some((t: { type: string }) => t.type === "LEAVE_TAKEN")).toBe(true);
    expect(history.body.items.some((t: { type: string }) => t.type === "LEAVE_CANCELLED")).toBe(true);
  });

  it("permet à un employé d'annuler sa propre demande tant qu'elle n'a pas commencé", async () => {
    const employee = await createTestUser({ role: Role.EMPLOYEE, email: "abs-emp6@deepclean.test" });
    const token = await loginAs(employee);
    const { startDate, endDate } = futureRange(15, 16);

    const created = await request(app)
      .post("/api/v1/absences")
      .set("Authorization", `Bearer ${token}`)
      .send({ type: "PAID_LEAVE", startDate, endDate });

    const cancelled = await request(app).post(`/api/v1/absences/${created.body.absence.id}/cancel`).set("Authorization", `Bearer ${token}`);
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.absence.status).toBe("CANCELLED");
  });

  it("refuse à un employé d'annuler la demande d'un collègue", async () => {
    const employee = await createTestUser({ role: Role.EMPLOYEE, email: "abs-emp7@deepclean.test" });
    const outsider = await createTestUser({ role: Role.EMPLOYEE, email: "abs-emp8@deepclean.test" });
    const employeeToken = await loginAs(employee);
    const outsiderToken = await loginAs(outsider);
    const { startDate, endDate } = futureRange(15, 16);

    const created = await request(app)
      .post("/api/v1/absences")
      .set("Authorization", `Bearer ${employeeToken}`)
      .send({ type: "PAID_LEAVE", startDate, endDate });

    const cancelled = await request(app)
      .post(`/api/v1/absences/${created.body.absence.id}/cancel`)
      .set("Authorization", `Bearer ${outsiderToken}`);
    expect(cancelled.status).toBe(403);
  });
});

describe("Congés — photo de la personne qui demande", () => {
  it("expose `hasAvatar`, jamais la clé de stockage de la photo", async () => {
    const employee = await createTestUser({ role: Role.EMPLOYEE, email: "abs-photo@deepclean.test", leaveAccrualRate: 10 });
    const hr = await createTestUser({ role: Role.HR, email: "hr-abs-photo@deepclean.test" });
    await prisma.user.update({ where: { id: employee.id }, data: { avatarKey: "avatars/employe.webp" } });

    const employeeToken = await loginAs(employee);
    const { startDate, endDate } = futureRange(20, 21);
    const created = await request(app)
      .post("/api/v1/absences")
      .set("Authorization", `Bearer ${employeeToken}`)
      .send({ type: "UNPAID_LEAVE", startDate, endDate });
    expect(created.status).toBe(201);
    expect(created.body.absence.user.hasAvatar).toBe(true);

    const hrToken = await loginAs(hr);
    const list = await request(app).get("/api/v1/absences").set("Authorization", `Bearer ${hrToken}`);
    expect(list.status).toBe(200);
    const mine = list.body.items.find((a: { userId: string }) => a.userId === employee.id);
    expect(mine.user.hasAvatar).toBe(true);
    expect(JSON.stringify(list.body)).not.toContain("avatarKey");
    expect(JSON.stringify(list.body)).not.toContain("avatars/employe.webp");
  });
});

describe("Liste des absences — le superviseur voit celles de l'équipe", () => {
  it("le superviseur voit les absences de tous (planning, validation des congés), l'employé seulement les siennes", async () => {
    const supervisor = await createTestUser({ role: Role.SUPERVISOR, email: "sup-abs-list@deepclean.test" });
    const employee = await createTestUser({ role: Role.EMPLOYEE, email: "emp-abs-list@deepclean.test" });
    const other = await createTestUser({ role: Role.EMPLOYEE, email: "oth-abs-list@deepclean.test" });
    const day = new Date("2030-03-04T00:00:00.000Z");
    await prisma.absence.createMany({
      data: [
        { userId: employee.id, type: "PAID_LEAVE", startDate: day, endDate: day, status: "PENDING" },
        { userId: other.id, type: "SICK_LEAVE", startDate: day, endDate: day, status: "APPROVED" },
      ],
    });
    const login = async (u: { username: string }) =>
      (await request(app).post("/api/v1/auth/login").send({ username: u.username, password: TEST_PASSWORD })).body.accessToken as string;

    const sup = await request(app).get("/api/v1/absences").set("Authorization", `Bearer ${await login(supervisor)}`);
    expect(sup.status).toBe(200);
    expect(sup.body.items.map((a: { userId: string }) => a.userId).sort()).toEqual([employee.id, other.id].sort());

    const emp = await request(app).get("/api/v1/absences").set("Authorization", `Bearer ${await login(employee)}`);
    expect(emp.body.items.map((a: { userId: string }) => a.userId)).toEqual([employee.id]);
  });
});

describe("Absence enregistrée par un responsable pour quelqu'un", () => {
  const login = async (u: { username: string }) =>
    (await request(app).post("/api/v1/auth/login").send({ username: u.username, password: TEST_PASSWORD })).body.accessToken as string;

  it("est approuvée d'office et la personne est prévenue, avec les bonnes dates", async () => {
    const hr = await createTestUser({ role: Role.HR, email: "hr-declare@deepclean.test" });
    const employee = await createTestUser({ role: Role.EMPLOYEE, email: "emp-declare@deepclean.test" });
    const res = await request(app)
      .post("/api/v1/absences")
      .set("Authorization", `Bearer ${await login(hr)}`)
      .send({ userId: employee.id, type: "SICK_LEAVE", startDate: "2030-03-04", endDate: "2030-03-08" });
    expect(res.status).toBe(201);
    expect(res.body.absence.status).toBe("APPROVED");
    const notif = await prisma.notification.findFirst({ where: { userId: employee.id, title: "Absence enregistrée" } });
    expect(notif?.body).toContain("arrêt maladie du 04/03/2030 au 08/03/2030");
  });

  it("un responsable ne s'approuve jamais sa propre absence", async () => {
    const supervisor = await createTestUser({ role: Role.SUPERVISOR, email: "sup-self@deepclean.test" });
    const res = await request(app)
      .post("/api/v1/absences")
      .set("Authorization", `Bearer ${await login(supervisor)}`)
      .send({ type: "PAID_LEAVE", startDate: "2030-03-04", endDate: "2030-03-05" });
    expect(res.status).toBe(201);
    expect(res.body.absence.status).toBe("PENDING");
  });
});
