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

function monthsAgo(n: number): Date {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d;
}

describe("Moteur de congés — solde (acquis / pris / en attente / restant)", () => {
  it("calcule l'acquis au prorata depuis la date d'embauche, avec le taux par défaut", async () => {
    const employee = await createTestUser({ role: Role.EMPLOYEE, email: "leave-emp1@deepclean.test", hireDate: monthsAgo(4) });
    const token = await loginAs(employee);

    const res = await request(app)
      .get(`/api/v1/leave/${employee.id}/balance`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    // ~4 mois * 2,5 j/mois par défaut = ~10 jours, avec une marge pour le
    // prorata en jours (pas en mois civils exacts).
    expect(res.body.balance.acquired).toBeGreaterThan(8);
    expect(res.body.balance.acquired).toBeLessThan(12);
    expect(res.body.balance.taken).toBe(0);
    expect(res.body.balance.pending).toBe(0);
    expect(res.body.balance.remaining).toBe(res.body.balance.acquired);
  });

  it("respecte un taux d'acquisition et un plafond configurés par salarié (temps partiel)", async () => {
    const employee = await createTestUser({
      role: Role.EMPLOYEE,
      email: "leave-emp2@deepclean.test",
      hireDate: monthsAgo(12),
      leaveAccrualRate: 1,
      leaveAccrualCap: 5,
    });
    const token = await loginAs(employee);

    const res = await request(app)
      .get(`/api/v1/leave/${employee.id}/balance`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    // 1 j/mois pendant ~12 mois dépasserait le plafond de 5 : doit être capé.
    expect(res.body.balance.acquired).toBe(5);
  });

  it("refuse à un employé de consulter le solde d'un collègue", async () => {
    const employee = await createTestUser({ role: Role.EMPLOYEE, email: "leave-emp3@deepclean.test" });
    const colleague = await createTestUser({ role: Role.EMPLOYEE, email: "leave-emp4@deepclean.test" });
    const token = await loginAs(employee);

    const res = await request(app)
      .get(`/api/v1/leave/${colleague.id}/balance`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  it("permet à la RH de consulter le solde de n'importe quel salarié", async () => {
    const hr = await createTestUser({ role: Role.HR, email: "hr-leave1@deepclean.test" });
    const employee = await createTestUser({ role: Role.EMPLOYEE, email: "leave-emp5@deepclean.test" });
    const token = await loginAs(hr);

    const res = await request(app)
      .get(`/api/v1/leave/${employee.id}/balance`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
  });

  it("permet à un chef d'équipe de consulter le solde de son équipe, mais pas d'un employé hors équipe", async () => {
    const manager = await createTestUser({ role: Role.SITE_MANAGER, email: "smgr-leave1@deepclean.test" });
    const teamMember = await createTestUser({ role: Role.EMPLOYEE, email: "leave-emp6@deepclean.test" });
    const outsider = await createTestUser({ role: Role.EMPLOYEE, email: "leave-emp7@deepclean.test" });
    const site = await createTestSite({ managerId: manager.id });
    await prisma.siteMember.create({ data: { siteId: site.id, userId: teamMember.id } });
    const token = await loginAs(manager);

    const inTeam = await request(app).get(`/api/v1/leave/${teamMember.id}/balance`).set("Authorization", `Bearer ${token}`);
    expect(inTeam.status).toBe(200);

    const outOfTeam = await request(app).get(`/api/v1/leave/${outsider.id}/balance`).set("Authorization", `Bearer ${token}`);
    expect(outOfTeam.status).toBe(404);
  });
});

describe("Moteur de congés — correction manuelle RH", () => {
  it("permet à la RH de créditer/débiter manuellement le solde, journalisé et notifié", async () => {
    const { accessToken: hrToken } = await (async () => {
      const hr = await createTestUser({ role: Role.HR, email: "hr-leave2@deepclean.test" });
      return { accessToken: await loginAs(hr) };
    })();
    // Taux d'acquisition à 0 : isole l'effet de la correction manuelle, sans
    // interférence avec l'acquis du jour même (accessoire ici).
    const employee = await createTestUser({
      role: Role.EMPLOYEE,
      email: "leave-emp8@deepclean.test",
      hireDate: new Date(),
      leaveAccrualRate: 0,
    });

    const res = await request(app)
      .post(`/api/v1/leave/${employee.id}/adjustments`)
      .set("Authorization", `Bearer ${hrToken}`)
      .send({ days: 2.5, note: "Report de l'année précédente" });

    expect(res.status).toBe(201);
    expect(res.body.transaction.type).toBe("ADJUSTMENT");
    expect(res.body.transaction.days).toBe(2.5);

    const notif = await prisma.notification.findFirst({ where: { userId: employee.id } });
    expect(notif).not.toBeNull();

    const employeeToken = await loginAs(employee);
    const balance = await request(app).get(`/api/v1/leave/${employee.id}/balance`).set("Authorization", `Bearer ${employeeToken}`);
    expect(balance.body.balance.acquired).toBeCloseTo(2.5, 1);
  });

  it("refuse à un employé de corriger son propre solde", async () => {
    const employee = await createTestUser({ role: Role.EMPLOYEE, email: "leave-emp9@deepclean.test" });
    const token = await loginAs(employee);

    const res = await request(app)
      .post(`/api/v1/leave/${employee.id}/adjustments`)
      .set("Authorization", `Bearer ${token}`)
      .send({ days: 5 });

    expect(res.status).toBe(403);
  });
});

describe("Date d'entrée dans l'entreprise (base des congés acquis)", () => {
  it("la RH la renseigne à la création et peut la corriger ensuite", async () => {
    const hr = await createTestUser({ role: Role.HR, email: "hr-hire@deepclean.test" });
    const token = await loginAs(hr);

    const created = await request(app)
      .post("/api/v1/users")
      .set("Authorization", `Bearer ${token}`)
      .send({ firstName: "Paul", lastName: "Ancien", role: Role.EMPLOYEE, hireDate: "2020-01-15" });
    expect(created.status).toBe(201);
    expect(created.body.user.hireDate).toBe("2020-01-15T00:00:00.000Z");

    const updated = await request(app)
      .patch(`/api/v1/users/${created.body.user.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ hireDate: "2019-06-03" });
    expect(updated.status).toBe(200);
    expect(updated.body.user.hireDate).toBe("2019-06-03T00:00:00.000Z");
  });

  it("refuse une date mal formée", async () => {
    const hr = await createTestUser({ role: Role.HR, email: "hr-hire2@deepclean.test" });
    const token = await loginAs(hr);
    const res = await request(app)
      .post("/api/v1/users")
      .set("Authorization", `Bearer ${token}`)
      .send({ firstName: "Paul", lastName: "Mauvais", role: Role.EMPLOYEE, hireDate: "15/01/2020" });
    expect(res.status).toBe(400);
  });
});
