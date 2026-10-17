import request from "supertest";
import { Role } from "@prisma/client";
import { createApp } from "../src/app";
import { prisma } from "../src/db/prisma";
import { createTestUser, resetDatabase, TEST_PASSWORD } from "./helpers";

// Suppression de compte demandée depuis l'application (règle App Store
// 5.1.1(v)) : compte désactivé aussitôt, RH et admin technique prévenus.

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
  return { user, token: login.body.accessToken as string, refreshToken: login.body.refreshToken as string };
}

describe("Suppression de compte depuis l'application", () => {
  it("désactive le compte, ferme toutes les sessions et prévient la RH", async () => {
    const hr = await createTestUser({ role: Role.HR, email: "hr-del@deepclean.test" });
    const admin = await createTestUser({ role: Role.ADMIN, email: "admin-del@deepclean.test" });
    const employee = await loginAs(Role.EMPLOYEE, "emp-del@deepclean.test");
    await prisma.pushToken.create({ data: { userId: employee.user.id, token: "ExponentPushToken[del]", platform: "ios" } });

    const res = await request(app)
      .post("/api/v1/auth/account-deletion")
      .set("Authorization", `Bearer ${employee.token}`)
      .send({ password: TEST_PASSWORD });
    expect(res.status).toBe(200);

    const stored = await prisma.user.findUniqueOrThrow({ where: { id: employee.user.id } });
    expect(stored.isActive).toBe(false);
    expect(stored.deletionRequestedAt).not.toBeNull();
    expect(await prisma.pushToken.count({ where: { userId: employee.user.id } })).toBe(0);

    // Plus aucun accès, ni par le jeton d'accès ni par le renouvellement.
    const me = await request(app).get("/api/v1/auth/me").set("Authorization", `Bearer ${employee.token}`);
    expect(me.status).toBe(401);
    const refreshed = await request(app).post("/api/v1/auth/refresh").send({ refreshToken: employee.refreshToken });
    expect(refreshed.status).toBe(401);

    const notified = await prisma.notification.findMany({ where: { title: "Demande de suppression de compte" } });
    expect(notified.map((n) => n.userId).sort()).toEqual([hr.id, admin.id].sort());
    expect(notified[0]).toMatchObject({ relatedEntityType: "User", relatedEntityId: employee.user.id });
  });

  it("exige le bon mot de passe", async () => {
    const employee = await loginAs(Role.EMPLOYEE, "emp-del2@deepclean.test");
    const res = await request(app)
      .post("/api/v1/auth/account-deletion")
      .set("Authorization", `Bearer ${employee.token}`)
      .send({ password: "MauvaisMotDePasse1!" });
    expect(res.status).toBe(400);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: employee.user.id } })).isActive).toBe(true);
  });

  it("refuse la suppression du compte d'administration technique et les appels anonymes", async () => {
    const admin = await loginAs(Role.ADMIN, "admin-del2@deepclean.test");
    const res = await request(app)
      .post("/api/v1/auth/account-deletion")
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ password: TEST_PASSWORD });
    expect(res.status).toBe(403);
    const anonymous = await request(app).post("/api/v1/auth/account-deletion").send({ password: TEST_PASSWORD });
    expect(anonymous.status).toBe(401);
  });

  it("une réactivation par la RH clôt la demande", async () => {
    const hr = await loginAs(Role.HR, "hr-del3@deepclean.test");
    const employee = await loginAs(Role.EMPLOYEE, "emp-del3@deepclean.test");
    await request(app).post("/api/v1/auth/account-deletion").set("Authorization", `Bearer ${employee.token}`).send({ password: TEST_PASSWORD });

    const target = await prisma.user.findUniqueOrThrow({ where: { id: employee.user.id } });
    expect(target.deletionRequestedAt).not.toBeNull();
    const res = await request(app).post(`/api/v1/users/${employee.user.id}/activate`).set("Authorization", `Bearer ${hr.token}`);
    expect(res.status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: employee.user.id } })).deletionRequestedAt).toBeNull();
  });
});
