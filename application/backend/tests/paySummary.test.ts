import request from "supertest";
import { Role, TimeEntryStatus } from "@prisma/client";
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

async function tokenOf(user: { username: string }) {
  const login = await request(app).post("/api/v1/auth/login").send({ username: user.username, password: TEST_PASSWORD });
  return login.body.accessToken as string;
}

/** Pointage validé, heures de Paris (octobre 2026 : UTC+2 jusqu'au 25). */
async function shift(userId: string, startUtc: string, endUtc: string) {
  await prisma.timeEntry.create({
    data: { userId, clockIn: new Date(startUtc), clockOut: new Date(endUtc), status: TimeEntryStatus.VALIDATED },
  });
}

async function nightWorkerWithShifts() {
  const employee = await createTestUser({ role: Role.EMPLOYEE, email: "nuit@deepclean.test" });
  // Deux semaines de nuits 22 h → 5 h (Paris), du lundi au vendredi.
  for (const day of ["05", "06", "07", "08", "09", "12", "13", "14", "15", "16"]) {
    const next = String(Number(day) + 1).padStart(2, "0");
    await shift(employee.id, `2026-10-${day}T20:00:00Z`, `2026-10-${next}T03:00:00Z`);
  }
  // Un dimanche de jour, 8 h → 12 h (Paris).
  await shift(employee.id, "2026-10-18T06:00:00Z", "2026-10-18T10:00:00Z");
  return employee;
}

describe("Heures majorées du mois", () => {
  it("ventile nuit et dimanche, reconnaît le travailleur de nuit et calcule son repos compensateur", async () => {
    const employee = await nightWorkerWithShifts();
    const token = await tokenOf(employee);

    const res = await request(app).get("/api/v1/time-entries/pay-summary?month=2026-10").set("Authorization", `Bearer ${token}`);
    expect(res.body).toEqual(expect.objectContaining({ summary: expect.anything() }));
    const { totals, nightWorker, compensatoryRest } = res.body.summary;
    expect(totals.countedMinutes).toBe(10 * 420 + 240);
    expect(totals.minutesByCategory.night).toBe(4200);
    expect(totals.minutesByCategory.sunday).toBe(240);
    // 70 h × 20 % + 4 h × 25 % (dimanche, taux en vigueur depuis juillet 2026).
    expect(totals.premiumMinutes).toBe(840 + 60);
    expect(nightWorker.isNightWorker).toBe(true);
    // 2 % des 70 h de nuit = 84 minutes de repos acquises.
    expect(compensatoryRest.monthAcquiredMinutes).toBe(84);
    expect(compensatoryRest.balanceMinutes).toBe(84);
  });

  it("déduit le repos compensateur pris et suit la décision de la RH", async () => {
    const employee = await nightWorkerWithShifts();
    const hr = await createTestUser({ role: Role.HR, email: "rh-nuit@deepclean.test" });
    const hrToken = await tokenOf(hr);
    await prisma.absence.create({
      data: { userId: employee.id, type: "COMPENSATORY_REST", status: "APPROVED", startDate: new Date("2026-10-20T00:00:00Z"), endDate: new Date("2026-10-20T00:00:00Z") },
    });

    const res = await request(app).get(`/api/v1/time-entries/pay-summary?month=2026-10&userId=${employee.id}`).set("Authorization", `Bearer ${hrToken}`);
    expect(res.status).toBe(200);
    expect(res.body.summary.compensatoryRest.yearTakenMinutes).toBe(420);
    expect(res.body.summary.compensatoryRest.balanceMinutes).toBe(84 - 420);

    const patch = await request(app).patch(`/api/v1/users/${employee.id}`).set("Authorization", `Bearer ${hrToken}`).send({ nightWorkerStatus: "NO" });
    expect(patch.status).toBe(200);
    const after = await request(app).get(`/api/v1/time-entries/pay-summary?month=2026-10&userId=${employee.id}`).set("Authorization", `Bearer ${hrToken}`);
    expect(after.body.summary.nightWorker.isNightWorker).toBe(false);
    expect(after.body.summary.compensatoryRest.monthAcquiredMinutes).toBe(0);
    // Les majorations de nuit restent dues, travailleur de nuit ou non.
    expect(after.body.summary.totals.minutesByCategory.night).toBe(4200);
  });

  it("refuse à un employé de consulter les heures d'un collègue", async () => {
    const employee = await nightWorkerWithShifts();
    const other = await createTestUser({ role: Role.EMPLOYEE, email: "autre@deepclean.test" });
    const res = await request(app).get(`/api/v1/time-entries/pay-summary?month=2026-10&userId=${employee.id}`).set("Authorization", `Bearer ${await tokenOf(other)}`);
    expect(res.status).toBe(404);
  });
});
