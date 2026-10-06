import request from "supertest";
import { Role } from "@prisma/client";
import { createApp } from "../src/app";
import { prisma } from "../src/db/prisma";
import { createTestSite, createTestUser, resetDatabase, TEST_PASSWORD } from "./helpers";

function localDateString(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function localTimeString(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

const app = createApp();

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function loginAs(role: Role, email: string) {
  const user = await createTestUser({ role, email });
  const login = await request(app).post("/api/v1/auth/login").send({ username: user.username, password: TEST_PASSWORD });
  return login.body.accessToken as string;
}

describe("GET /api/v1/stats/overview", () => {
  it("refuse l'accès à la RH, au chef d'équipe et à l'employé", async () => {
    for (const role of [Role.HR, Role.SITE_MANAGER, Role.EMPLOYEE]) {
      const token = await loginAs(role, `stats-${role}@deepclean.test`);
      const res = await request(app).get("/api/v1/stats/overview").set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(403);
    }
  });

  it("retourne un aperçu cohérent pour la direction", async () => {
    await createTestSite();
    const token = await loginAs(Role.DIRECTOR, "stats-director@deepclean.test");

    const res = await request(app).get("/api/v1/stats/overview").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.sites.total).toBeGreaterThanOrEqual(1);
    expect(res.body.missions).toEqual(
      expect.objectContaining({ scheduled: 0, inProgress: 0, completed: 0, cancelled: 0 })
    );
    expect(res.body.validations.validationRatePercent).toBe(0);
  });

  it("compte une mission planifiée plus tard aujourd'hui dans les missions à venir sous 7 jours", async () => {
    const site = await createTestSite();
    const token = await loginAs(Role.DIRECTOR, "stats-upcoming@deepclean.test");
    const employee = await createTestUser({ role: Role.EMPLOYEE, email: "stats-upcoming-emp@deepclean.test" });

    const now = new Date();
    const start = new Date(now.getTime() + 2 * 60000);
    const end = new Date(now.getTime() + 32 * 60000);

    const created = await request(app)
      .post("/api/v1/missions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        siteId: site.id,
        title: "Mission du jour même",
        date: localDateString(start),
        startTime: localTimeString(start),
        endTime: localTimeString(end),
        assigneeIds: [employee.id],
      });
    expect(created.status).toBe(201);

    const res = await request(app).get("/api/v1/stats/overview").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.missions.upcoming7Days).toBeGreaterThanOrEqual(1);
  });
});
