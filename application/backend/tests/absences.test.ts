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

describe("Congés — le chef d'équipe peut valider les demandes de sa propre équipe", () => {
  it("permet à un chef d'équipe de valider le congé d'un membre de son équipe (bug corrigé)", async () => {
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

    expect(decided.status).toBe(200);
    expect(decided.body.absence.status).toBe("APPROVED");
  });

  it("refuse à un chef d'équipe de valider le congé d'un employé hors de son équipe", async () => {
    const manager = await createTestUser({ role: Role.SITE_MANAGER, email: "smgr-abs2@deepclean.test" });
    const outsider = await createTestUser({ role: Role.EMPLOYEE, email: "abs-emp2@deepclean.test" });
    const managerToken = await loginAs(manager);
    const outsiderToken = await loginAs(outsider);

    const { startDate, endDate } = futureRange(10, 11);
    const created = await request(app)
      .post("/api/v1/absences")
      .set("Authorization", `Bearer ${outsiderToken}`)
      .send({ type: "PAID_LEAVE", startDate, endDate });

    const decided = await request(app)
      .post(`/api/v1/absences/${created.body.absence.id}/decide`)
      .set("Authorization", `Bearer ${managerToken}`)
      .send({ status: "APPROVED" });

    expect(decided.status).toBe(403);
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
