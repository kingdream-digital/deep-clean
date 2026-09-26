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
