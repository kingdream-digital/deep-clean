import request from "supertest";
import { Role } from "@prisma/client";
import { createApp } from "../src/app";
import { prisma } from "../src/db/prisma";
import { createTestSite, createTestUser, resetDatabase, tinyTestPhoto, TEST_PASSWORD } from "./helpers";

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
  return { user, accessToken: login.body.accessToken as string };
}

describe("Chantiers — création et permissions", () => {
  it("refuse à un chef d'équipe de créer un chantier", async () => {
    const { accessToken } = await loginAs(Role.SITE_MANAGER, "smgr-create@deepclean.test");

    const res = await request(app)
      .post("/api/v1/sites")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Nouveau chantier", address: "1 rue Test" });

    expect(res.status).toBe(403);
  });

  it("permet à la RH de créer un chantier", async () => {
    const { accessToken } = await loginAs(Role.HR, "hr-create@deepclean.test");

    const res = await request(app)
      .post("/api/v1/sites")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Nouveau chantier", address: "1 rue Test" });

    expect(res.status).toBe(201);
    expect(res.body.site.name).toBe("Nouveau chantier");
  });

  it("permet au superviseur de créer un chantier", async () => {
    const { accessToken } = await loginAs(Role.SUPERVISOR, "sup-create@deepclean.test");

    const res = await request(app)
      .post("/api/v1/sites")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Chantier superviseur", address: "1 rue Test" });

    expect(res.status).toBe(201);
    expect(res.body.site.name).toBe("Chantier superviseur");
  });
});

describe("Chantiers — visibilité scoping par rôle", () => {
  it("un employé ne voit que les chantiers dont il est membre", async () => {
    const { user: employee, accessToken } = await loginAs(Role.EMPLOYEE, "emp-scope@deepclean.test");
    const memberSite = await createTestSite({ name: "Chantier membre" });
    await createTestSite({ name: "Chantier étranger" });
    await prisma.siteMember.create({ data: { siteId: memberSite.id, userId: employee.id } });

    const res = await request(app).get("/api/v1/sites").set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].id).toBe(memberSite.id);
  });

  it("un chef d'équipe ne voit que les chantiers qu'il gère", async () => {
    const { user: manager, accessToken } = await loginAs(Role.SITE_MANAGER, "smgr-scope@deepclean.test");
    const owned = await createTestSite({ name: "Mon chantier", managerId: manager.id });
    await createTestSite({ name: "Autre chantier" });

    const res = await request(app).get("/api/v1/sites").set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].id).toBe(owned.id);
  });

  it("renvoie 404 (jamais 403) pour un chantier hors périmètre — ne révèle pas son existence", async () => {
    const { accessToken } = await loginAs(Role.EMPLOYEE, "emp-404@deepclean.test");
    const outOfScope = await createTestSite({ name: "Chantier hors périmètre" });

    const res = await request(app).get(`/api/v1/sites/${outOfScope.id}`).set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(404);
  });
});

describe("Chantiers — superviseur fixe du chantier (distinct du chef d'équipe)", () => {
  it("refuse d'assigner un superviseur du chantier qui n'a pas le rôle Superviseur", async () => {
    const { accessToken } = await loginAs(Role.HR, "hr-supervisor-invalid@deepclean.test");
    const employee = await createTestUser({ role: Role.EMPLOYEE, email: "emp-not-supervisor@deepclean.test" });

    const res = await request(app)
      .post("/api/v1/sites")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Chantier avec superviseur invalide", address: "1 rue Test", supervisorId: employee.id });

    expect(res.status).toBe(400);
  });

  it("permet d'assigner un superviseur du chantier, indépendant du chef d'équipe (qui peut varier)", async () => {
    const { accessToken } = await loginAs(Role.DIRECTOR, "dir-supervisor@deepclean.test");
    const manager = await createTestUser({ role: Role.SITE_MANAGER, email: "smgr-supervised@deepclean.test" });
    const supervisor = await createTestUser({ role: Role.SUPERVISOR, email: "sup-fixed@deepclean.test" });

    const created = await request(app)
      .post("/api/v1/sites")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Chantier avec superviseur", address: "1 rue Test", managerId: manager.id, supervisorId: supervisor.id });

    expect(created.status).toBe(201);
    expect(created.body.site.managerId).toBe(manager.id);
    expect(created.body.site.supervisorId).toBe(supervisor.id);

    // Le chef d'équipe peut être remplacé sans toucher au superviseur fixe.
    const otherManager = await createTestUser({ role: Role.SITE_MANAGER, email: "smgr-replacement@deepclean.test" });
    const updated = await request(app)
      .patch(`/api/v1/sites/${created.body.site.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ managerId: otherManager.id });

    expect(updated.status).toBe(200);
    expect(updated.body.site.managerId).toBe(otherManager.id);
    expect(updated.body.site.supervisorId).toBe(supervisor.id);
  });
});

describe("Chantiers — photo du chantier (retour explicite du client, visuel direct)", () => {
  it("permet à la RH de déposer une photo de chantier, servie à tout compte pouvant voir le chantier", async () => {
    const { accessToken: hrToken } = await loginAs(Role.HR, "hr-site-photo@deepclean.test");
    const site = await createTestSite({ name: "Chantier avec photo" });

    const uploaded = await request(app)
      .put(`/api/v1/sites/${site.id}/photo`)
      .set("Authorization", `Bearer ${hrToken}`)
      .attach("photo", await tinyTestPhoto(), { filename: "chantier.jpg", contentType: "image/jpeg" });

    expect(uploaded.status).toBe(200);
    expect(uploaded.body.site.hasPhoto).toBe(true);
    expect(uploaded.body.site.photoKey).toBeUndefined();

    const { user: employee, accessToken: employeeToken } = await loginAs(Role.EMPLOYEE, "emp-site-photo@deepclean.test");
    await prisma.siteMember.create({ data: { siteId: site.id, userId: employee.id } });

    const file = await request(app)
      .get(`/api/v1/sites/${site.id}/photo/file`)
      .set("Authorization", `Bearer ${employeeToken}`);
    expect(file.status).toBe(200);
    expect(file.headers["content-type"]).toContain("image/jpeg");
  });

  it("refuse au chef d'équipe de déposer une photo sur son propre chantier (réservé à la fiche chantier)", async () => {
    const { user: manager, accessToken } = await loginAs(Role.SITE_MANAGER, "smgr-site-photo@deepclean.test");
    const site = await createTestSite({ managerId: manager.id });

    const res = await request(app)
      .put(`/api/v1/sites/${site.id}/photo`)
      .set("Authorization", `Bearer ${accessToken}`)
      .attach("photo", await tinyTestPhoto(), { filename: "chantier.jpg", contentType: "image/jpeg" });

    expect(res.status).toBe(403);
  });

  it("permet de retirer une photo de chantier, et renvoie 404 s'il n'y en a pas", async () => {
    const { accessToken } = await loginAs(Role.SUPERVISOR, "sup-site-photo@deepclean.test");
    const site = await createTestSite({ name: "Chantier sans photo" });

    const removeMissing = await request(app).delete(`/api/v1/sites/${site.id}/photo`).set("Authorization", `Bearer ${accessToken}`);
    expect(removeMissing.status).toBe(404);

    await request(app)
      .put(`/api/v1/sites/${site.id}/photo`)
      .set("Authorization", `Bearer ${accessToken}`)
      .attach("photo", await tinyTestPhoto(), { filename: "chantier.jpg", contentType: "image/jpeg" });

    const removed = await request(app).delete(`/api/v1/sites/${site.id}/photo`).set("Authorization", `Bearer ${accessToken}`);
    expect(removed.status).toBe(200);
    expect(removed.body.site.hasPhoto).toBe(false);
  });
});

describe("Chantiers — le chef d'équipe ne modifie plus la fiche chantier", () => {
  it("refuse au chef d'équipe de modifier la description de son propre chantier (retour explicite du client)", async () => {
    const { user: manager, accessToken } = await loginAs(Role.SITE_MANAGER, "smgr-edit@deepclean.test");
    const site = await createTestSite({ managerId: manager.id });

    const res = await request(app)
      .patch(`/api/v1/sites/${site.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ description: "Nouvelle description" });
    expect(res.status).toBe(403);
  });

  it("permet au chef d'équipe d'ajouter/retirer un membre de son équipe malgré tout", async () => {
    const { user: manager, accessToken } = await loginAs(Role.SITE_MANAGER, "smgr-team@deepclean.test");
    const employee = await createTestUser({ role: Role.EMPLOYEE, email: "smgr-team-emp@deepclean.test" });
    const site = await createTestSite({ managerId: manager.id });

    const add = await request(app)
      .post(`/api/v1/sites/${site.id}/members`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ userId: employee.id });
    expect(add.status).toBe(204);

    const remove = await request(app)
      .delete(`/api/v1/sites/${site.id}/members/${employee.id}`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(remove.status).toBe(204);
  });
});

describe("Chantiers — photo du chef d'équipe et du superviseur", () => {
  it("indique s'ils ont une photo par un simple booléen, sans jamais exposer la clé de stockage", async () => {
    const manager = await createTestUser({ role: Role.SITE_MANAGER, email: "smgr-photo@deepclean.test" });
    const supervisor = await createTestUser({ role: Role.SUPERVISOR, email: "sup-photo@deepclean.test" });
    await prisma.user.update({ where: { id: manager.id }, data: { avatarKey: "avatars/chef.webp" } });
    const site = await createTestSite({ managerId: manager.id, supervisorId: supervisor.id });
    const { accessToken } = await loginAs(Role.HR, "hr-photo@deepclean.test");

    const detail = await request(app).get(`/api/v1/sites/${site.id}`).set("Authorization", `Bearer ${accessToken}`);
    expect(detail.status).toBe(200);
    expect(detail.body.site.manager.hasAvatar).toBe(true);
    expect(detail.body.site.supervisor.hasAvatar).toBe(false);
    expect(JSON.stringify(detail.body)).not.toContain("avatarKey");
    expect(JSON.stringify(detail.body)).not.toContain("avatars/chef.webp");

    const list = await request(app).get("/api/v1/sites").set("Authorization", `Bearer ${accessToken}`);
    expect(list.status).toBe(200);
    expect(list.body.items[0].manager.hasAvatar).toBe(true);
    expect(JSON.stringify(list.body)).not.toContain("avatarKey");
  });
});
