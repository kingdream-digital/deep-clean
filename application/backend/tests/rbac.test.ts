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

async function loginAs(role: Role) {
  const user = await createTestUser({ role, email: `${role.toLowerCase()}@deepclean.test` });
  const login = await request(app)
    .post("/api/v1/auth/login")
    .send({ username: user.username, password: TEST_PASSWORD });
  return { user, accessToken: login.body.accessToken as string };
}

describe("Contrôle des permissions — gestion des comptes (réservée à la RH)", () => {
  it("refuse à un employé la création d'un compte", async () => {
    const { accessToken } = await loginAs(Role.EMPLOYEE);

    const res = await request(app)
      .post("/api/v1/users")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ email: "nouveau@deepclean.test", firstName: "Nouveau", lastName: "Employé", role: Role.EMPLOYEE });

    expect(res.status).toBe(403);
  });

  it("permet à un chef d'équipe de consulter la liste des employés (pour composer ses équipes), mais pas d'en créer un", async () => {
    const { accessToken } = await loginAs(Role.SITE_MANAGER);

    const list = await request(app).get("/api/v1/users").set("Authorization", `Bearer ${accessToken}`);
    expect(list.status).toBe(200);

    const create = await request(app)
      .post("/api/v1/users")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ email: "nouveau-smgr@deepclean.test", firstName: "Nouveau", lastName: "Employé", role: Role.EMPLOYEE });
    expect(create.status).toBe(403);
  });

  it("refuse toute requête non authentifiée", async () => {
    const res = await request(app).get("/api/v1/users");
    expect(res.status).toBe(401);
  });

  it("permet à la RH de créer un compte et retourne un mot de passe temporaire", async () => {
    const { accessToken } = await loginAs(Role.HR);

    const res = await request(app)
      .post("/api/v1/users")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ email: "nouveau2@deepclean.test", firstName: "Nouveau", lastName: "Employé", role: Role.EMPLOYEE });

    expect(res.status).toBe(201);
    expect(res.body.temporaryPassword).toBeDefined();
    expect(res.body.user.email).toBe("nouveau2@deepclean.test");
    expect(res.body.user.mustChangePassword).toBe(true);
  });

  it("empêche un employé désactivé par la RH de se reconnecter", async () => {
    const { accessToken: hrToken } = await loginAs(Role.HR);
    const employee = await createTestUser({ email: "adesactiver@deepclean.test", role: Role.EMPLOYEE });

    const deactivate = await request(app)
      .post(`/api/v1/users/${employee.id}/deactivate`)
      .set("Authorization", `Bearer ${hrToken}`);
    expect(deactivate.status).toBe(200);
    expect(deactivate.body.user.isActive).toBe(false);

    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ username: employee.username, password: TEST_PASSWORD });
    expect(login.status).toBe(403);
  });

  it("empêche un utilisateur RH de se désactiver lui-même", async () => {
    const { user, accessToken } = await loginAs(Role.HR);

    const res = await request(app)
      .post(`/api/v1/users/${user.id}/deactivate`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(400);
  });

  it("empêche un utilisateur RH de s'attribuer lui-même un autre rôle (auto-élévation de privilèges)", async () => {
    const { user, accessToken } = await loginAs(Role.HR);

    const res = await request(app)
      .patch(`/api/v1/users/${user.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ role: Role.ADMIN });

    expect(res.status).toBe(400);

    const stillHr = await prisma.user.findUnique({ where: { id: user.id } });
    expect(stillHr?.role).toBe(Role.HR);
  });

  it("permet à la RH de modifier le rôle de quelqu'un d'autre (pas d'elle-même)", async () => {
    const { accessToken } = await loginAs(Role.HR);
    const employee = await createTestUser({ email: "arole-changer@deepclean.test", role: Role.EMPLOYEE });

    const res = await request(app)
      .patch(`/api/v1/users/${employee.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ role: Role.SUPERVISOR });

    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe(Role.SUPERVISOR);
  });

  it("réinitialise l'accès sans jamais exposer l'ancien mot de passe", async () => {
    const { accessToken: hrToken } = await loginAs(Role.HR);
    const employee = await createTestUser({ email: "areset@deepclean.test", role: Role.EMPLOYEE });

    const res = await request(app)
      .post(`/api/v1/users/${employee.id}/reset-access`)
      .set("Authorization", `Bearer ${hrToken}`);

    expect(res.status).toBe(200);
    expect(res.body.temporaryPassword).toBeDefined();
    expect(res.body.temporaryPassword).not.toBe(TEST_PASSWORD);
  });
});

describe("Isolation des données entre utilisateurs — notifications", () => {
  it("empêche un utilisateur de marquer comme lue la notification d'un autre", async () => {
    const { user: owner, accessToken: ownerToken } = await loginAs(Role.EMPLOYEE);
    const { accessToken: otherToken } = await loginAs(Role.SITE_MANAGER);

    const notification = await prisma.notification.create({
      data: {
        userId: owner.id,
        type: "GENERAL",
        title: "Test",
        body: "Contenu",
      },
    });

    const res = await request(app)
      .post(`/api/v1/notifications/${notification.id}/read`)
      .set("Authorization", `Bearer ${otherToken}`);

    // 404 plutôt que 403 : ne révèle pas l'existence de la notification d'autrui.
    expect(res.status).toBe(404);

    const ownerRes = await request(app)
      .post(`/api/v1/notifications/${notification.id}/read`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(ownerRes.status).toBe(200);
  });
});

describe("Mot de passe temporaire non changé — accès bloqué côté serveur", () => {
  it("refuse toute route hors /auth tant que l'utilisateur n'a pas changé son mot de passe temporaire", async () => {
    const employee = await createTestUser({ email: "atempo@deepclean.test", role: Role.EMPLOYEE });
    await prisma.user.update({ where: { id: employee.id }, data: { mustChangePassword: true } });

    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ username: employee.username, password: TEST_PASSWORD });
    expect(login.status).toBe(200);
    expect(login.body.user.mustChangePassword).toBe(true);
    const accessToken = login.body.accessToken as string;

    // /auth reste accessible (nécessaire pour changer le mot de passe et se déconnecter).
    const me = await request(app).get("/api/v1/auth/me").set("Authorization", `Bearer ${accessToken}`);
    expect(me.status).toBe(200);

    // Tout le reste est bloqué, même une simple lecture.
    const notifications = await request(app)
      .get("/api/v1/notifications")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(notifications.status).toBe(403);

    const missions = await request(app).get("/api/v1/missions").set("Authorization", `Bearer ${accessToken}`);
    expect(missions.status).toBe(403);
  });

  it("redonne l'accès normal une fois le mot de passe changé", async () => {
    const employee = await createTestUser({ email: "atempo2@deepclean.test", role: Role.EMPLOYEE });
    await prisma.user.update({ where: { id: employee.id }, data: { mustChangePassword: true } });

    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ username: employee.username, password: TEST_PASSWORD });
    const accessToken = login.body.accessToken as string;

    const changePassword = await request(app)
      .post("/api/v1/auth/change-password")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ currentPassword: TEST_PASSWORD, newPassword: "NouveauMotDePasse9!" });
    expect(changePassword.status).toBe(200);

    // Le changement de mot de passe révoque la session courante par sécurité
    // (voir auth.service.ts changeOwnPassword) : il faut se reconnecter.
    const relog = await request(app)
      .post("/api/v1/auth/login")
      .send({ username: employee.username, password: "NouveauMotDePasse9!" });
    expect(relog.status).toBe(200);
    expect(relog.body.user.mustChangePassword).toBe(false);

    const notifications = await request(app)
      .get("/api/v1/notifications")
      .set("Authorization", `Bearer ${relog.body.accessToken}`);
    expect(notifications.status).toBe(200);
  });
});
