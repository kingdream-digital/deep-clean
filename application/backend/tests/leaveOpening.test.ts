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

async function login(username: string, password = TEST_PASSWORD) {
  const res = await request(app).post("/api/v1/auth/login").send({ username, password });
  return res.body.accessToken as string;
}

function inDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

// Retour explicite du client : à la création du compte, la RH saisit la date
// d'arrivée et le solde de congés du dernier bulletin de paie — le salarié
// déjà présent dans l'entreprise ne perd rien.
describe("Reprise du solde de congés à la création du compte", () => {
  it("crédite les congés N-1 et N du bulletin, chacun dans sa période, et le salarié peut poser un congé dès le premier jour", async () => {
    const hr = await createTestUser({ role: Role.HR, email: "rh-reprise@deepclean.test" });
    const hrToken = await login(hr.username);

    const created = await request(app)
      .post("/api/v1/users")
      .set("Authorization", `Bearer ${hrToken}`)
      .send({ firstName: "Awa", lastName: "Traoré", role: "EMPLOYEE", hireDate: "2023-03-01", openingLeave: { previousYear: 12.5, currentYear: 10 } });
    expect(created.status).toBe(201);
    const userId = created.body.user.id as string;

    const balance = await request(app).get(`/api/v1/leave/${userId}/balance`).set("Authorization", `Bearer ${hrToken}`);
    expect(balance.status).toBe(200);
    expect(balance.body.balance?.previousYear?.acquired ?? balance.body.previousYear?.acquired).toBe(12.5);
    const body = balance.body.balance ?? balance.body;
    expect(body.currentYear.acquired).toBe(10);
    expect(body.remaining).toBe(22.5);

    // Première connexion du salarié, puis demande de congé payé : acceptée (solde suffisant).
    const firstLogin = await request(app).post("/api/v1/auth/login").send({ username: created.body.user.username, password: created.body.temporaryPassword });
    await request(app)
      .post("/api/v1/auth/change-password")
      .set("Authorization", `Bearer ${firstLogin.body.accessToken}`)
      .send({ currentPassword: created.body.temporaryPassword, newPassword: "Awa-Traore-2026!" });
    const empToken = await login(created.body.user.username, "Awa-Traore-2026!");
    const absence = await request(app).post("/api/v1/absences").set("Authorization", `Bearer ${empToken}`).send({ type: "PAID_LEAVE", startDate: inDays(30), endDate: inDays(32) });
    expect(absence.status).toBe(201);
  });

  it("la RH peut corriger la reprise plus tard : elle remplace la précédente, sans s'additionner", async () => {
    const hr = await createTestUser({ role: Role.HR, email: "rh-reprise2@deepclean.test" });
    const employee = await createTestUser({ role: Role.EMPLOYEE, email: "emp-reprise2@deepclean.test" });
    const hrToken = await login(hr.username);

    await request(app).put(`/api/v1/leave/${employee.id}/opening-balance`).set("Authorization", `Bearer ${hrToken}`).send({ previousYear: 20, currentYear: 5 });
    const fixed = await request(app).put(`/api/v1/leave/${employee.id}/opening-balance`).set("Authorization", `Bearer ${hrToken}`).send({ previousYear: 8, currentYear: 5 });
    expect(fixed.status).toBe(200);

    const balance = await request(app).get(`/api/v1/leave/${employee.id}/balance`).set("Authorization", `Bearer ${hrToken}`);
    const body = balance.body.balance ?? balance.body;
    expect(body.remaining).toBe(13);
    expect(await prisma.leaveTransaction.count({ where: { userId: employee.id, type: "OPENING_BALANCE" } })).toBe(2);
  });

  it("refuse à un employé de saisir un solde, et refuse un solde négatif ou démesuré", async () => {
    const hr = await createTestUser({ role: Role.HR, email: "rh-reprise3@deepclean.test" });
    const employee = await createTestUser({ role: Role.EMPLOYEE, email: "emp-reprise3@deepclean.test" });
    const empToken = await login(employee.username);
    const hrToken = await login(hr.username);

    const self = await request(app).put(`/api/v1/leave/${employee.id}/opening-balance`).set("Authorization", `Bearer ${empToken}`).send({ previousYear: 50 });
    expect(self.status).toBe(403);
    const negative = await request(app).put(`/api/v1/leave/${employee.id}/opening-balance`).set("Authorization", `Bearer ${hrToken}`).send({ previousYear: -3 });
    expect(negative.status).toBe(400);
    const huge = await request(app).put(`/api/v1/leave/${employee.id}/opening-balance`).set("Authorization", `Bearer ${hrToken}`).send({ currentYear: 90 });
    expect(huge.status).toBe(400);
  });
});
