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
  it("le compteur d'un nouveau salarié démarre à 0", async () => {
    const employee = await createTestUser({ role: Role.EMPLOYEE, email: "leave-emp1@deepclean.test" });
    const token = await loginAs(employee);

    const res = await request(app).get(`/api/v1/leave/${employee.id}/balance`).set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.balance.acquired).toBe(0);
    expect(res.body.balance.toValidate).toBe(0);
    expect(res.body.balance.remaining).toBe(0);
    expect(res.body.balance.period.cap).toBe(30);
  });

  it("calcule chaque mois écoulé (2,5 j), à valider par la RH avant de compter dans le solde", async () => {
    const employee = await createTestUser({ role: Role.EMPLOYEE, email: "leave-emp2@deepclean.test" });
    // Contrat et compte depuis 3 mois pleins.
    const start = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 3, 1));
    await prisma.user.update({ where: { id: employee.id }, data: { hireDate: start, createdAt: start } });
    const hr = await createTestUser({ role: Role.HR, email: "leave-hr2@deepclean.test" });
    const hrToken = await loginAs(hr);

    const list = await request(app).get("/api/v1/leave/accruals").set("Authorization", `Bearer ${hrToken}`);
    expect(list.status).toBe(200);
    const mine = list.body.items.filter((a: { userId: string }) => a.userId === employee.id);
    expect(mine).toHaveLength(3);
    expect(mine.every((a: { days: number; status: string }) => a.days === 2.5 && a.status === "PROPOSED")).toBe(true);

    let balance = (await request(app).get(`/api/v1/leave/${employee.id}/balance`).set("Authorization", `Bearer ${hrToken}`)).body.balance;
    expect(balance.acquired).toBe(0);
    expect(balance.toValidate).toBe(7.5);

    // La RH corrige un mois (motif obligatoire), puis valide les autres.
    const [first, ...others] = mine;
    const noNote = await request(app).post(`/api/v1/leave/accruals/${first.id}/validate`).set("Authorization", `Bearer ${hrToken}`).send({ days: 2 });
    expect(noNote.status).toBe(400);
    const corrected = await request(app)
      .post(`/api/v1/leave/accruals/${first.id}/validate`)
      .set("Authorization", `Bearer ${hrToken}`)
      .send({ days: 2, note: "Reprise d'ancienneté" });
    expect(corrected.status).toBe(200);
    for (const a of others) {
      expect((await request(app).post(`/api/v1/leave/accruals/${a.id}/validate`).set("Authorization", `Bearer ${hrToken}`).send({})).status).toBe(200);
    }

    balance = (await request(app).get(`/api/v1/leave/${employee.id}/balance`).set("Authorization", `Bearer ${hrToken}`)).body.balance;
    expect(balance.acquired).toBe(7);
    expect(balance.toValidate).toBe(0);
    expect(await prisma.notification.count({ where: { userId: employee.id, title: "Congés acquis" } })).toBe(3);
  });

  it("un employé ne peut ni voir ni valider les relevés, et personne ne valide les siens", async () => {
    const employee = await createTestUser({ role: Role.EMPLOYEE, email: "leave-emp3@deepclean.test" });
    const start = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 1, 1));
    await prisma.user.update({ where: { id: employee.id }, data: { hireDate: start, createdAt: start } });
    const hr = await createTestUser({ role: Role.HR, email: "leave-hr3@deepclean.test" });
    await prisma.user.update({ where: { id: hr.id }, data: { hireDate: start, createdAt: start } });
    const hrToken = await loginAs(hr);
    const items = (await request(app).get("/api/v1/leave/accruals").set("Authorization", `Bearer ${hrToken}`)).body.items;
    const empAccrual = items.find((a: { userId: string }) => a.userId === employee.id);
    const hrAccrual = items.find((a: { userId: string }) => a.userId === hr.id);

    const empToken = await loginAs(employee);
    expect((await request(app).get("/api/v1/leave/accruals").set("Authorization", `Bearer ${empToken}`)).status).toBe(403);
    expect((await request(app).post(`/api/v1/leave/accruals/${empAccrual.id}/validate`).set("Authorization", `Bearer ${empToken}`).send({})).status).toBe(403);
    expect((await request(app).post(`/api/v1/leave/accruals/${hrAccrual.id}/validate`).set("Authorization", `Bearer ${hrToken}`).send({})).status).toBe(403);
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

describe("Moteur de congés — règles d'acquisition selon les absences", () => {
  // Fonction pure : aucun accès base.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { computeMonthAccrual } = require("../src/modules/leave/leave.service") as typeof import("../src/modules/leave/leave.service");
  const day = (s: string) => new Date(`${s}T00:00:00.000Z`);
  const user = { hireDate: day("2025-01-01"), leaveAccrualRate: null };

  it("un mois complet travaillé donne 2,5 jours ouvrables", () => {
    expect(computeMonthAccrual(user, "2026-09", [])!.rawDays).toBe(2.5);
  });

  it("congé payé, accident du travail et congé maternité sont assimilés à du travail effectif", () => {
    for (const type of ["PAID_LEAVE", "WORK_ACCIDENT", "PARENTAL_LEAVE"] as const) {
      expect(computeMonthAccrual(user, "2026-09", [{ type, startDate: day("2026-09-01"), endDate: day("2026-09-30") }])!.rawDays).toBe(2.5);
    }
  });

  it("un mois entier d'arrêt maladie ordinaire donne 2 jours (loi du 22 avril 2024)", () => {
    expect(computeMonthAccrual(user, "2026-09", [{ type: "SICK_LEAVE", startDate: day("2026-09-01"), endDate: day("2026-09-30") }])!.rawDays).toBe(2);
  });

  it("les jours de congé sans solde n'ouvrent aucun droit", () => {
    const d = computeMonthAccrual(user, "2026-09", [{ type: "UNPAID_LEAVE", startDate: day("2026-09-16"), endDate: day("2026-09-30") }])!;
    expect(d.unpaidDays).toBe(15);
    expect(d.rawDays).toBe(1.25);
  });

  it("un premier mois partiel est calculé au prorata", () => {
    const d = computeMonthAccrual({ hireDate: day("2026-09-16"), leaveAccrualRate: null }, "2026-09", [])!;
    expect(d.consideredDays).toBe(15);
    expect(d.rawDays).toBe(1.25);
    expect(computeMonthAccrual({ hireDate: day("2026-10-05"), leaveAccrualRate: null }, "2026-09", [])).toBeNull();
  });
});
