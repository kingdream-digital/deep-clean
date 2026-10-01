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

function tomorrowDateString(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

describe("Standards de nettoyage — création et permissions", () => {
  it("permet au superviseur de créer un standard pour un chantier", async () => {
    const { accessToken } = await loginAs(Role.SUPERVISOR, "sup-std1@deepclean.test");
    const site = await createTestSite();

    const res = await request(app)
      .post("/api/v1/cleaning-standards")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        siteId: site.id,
        name: "Standard bureaux",
        tasks: ["Aspirer", "Vider les corbeilles", ""],
        equipment: ["Aspirateur"],
        safetyInstructions: "Porter des gants",
      });

    expect(res.status).toBe(201);
    expect(res.body.standard.name).toBe("Standard bureaux");
    expect(res.body.standard.tasks).toEqual(["Aspirer", "Vider les corbeilles"]);
  });

  it("refuse à un chef d'équipe de créer un standard", async () => {
    const { accessToken } = await loginAs(Role.SITE_MANAGER, "smgr-std1@deepclean.test");
    const site = await createTestSite();

    const res = await request(app)
      .post("/api/v1/cleaning-standards")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ siteId: site.id, name: "Standard interdit", tasks: [], equipment: [] });

    expect(res.status).toBe(403);
  });

  it("refuse à un employé de créer un standard", async () => {
    const { accessToken } = await loginAs(Role.EMPLOYEE, "emp-std1@deepclean.test");
    const site = await createTestSite();

    const res = await request(app)
      .post("/api/v1/cleaning-standards")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ siteId: site.id, name: "Standard interdit", tasks: [], equipment: [] });

    expect(res.status).toBe(403);
  });

  it("liste les standards d'un chantier à l'équipe qui y travaille, et à personne d'autre", async () => {
    const { accessToken: hrToken } = await loginAs(Role.HR, "hr-std1@deepclean.test");
    const { user: member, accessToken: memberToken } = await loginAs(Role.EMPLOYEE, "emp-std2@deepclean.test");
    const { accessToken: outsiderToken } = await loginAs(Role.EMPLOYEE, "emp-std3@deepclean.test");
    const site = await createTestSite();
    await prisma.siteMember.create({ data: { siteId: site.id, userId: member.id } });

    await request(app)
      .post("/api/v1/cleaning-standards")
      .set("Authorization", `Bearer ${hrToken}`)
      .send({ siteId: site.id, name: "Standard A", tasks: [], equipment: [] });

    const res = await request(app)
      .get(`/api/v1/cleaning-standards?siteId=${site.id}`)
      .set("Authorization", `Bearer ${memberToken}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].name).toBe("Standard A");

    // Un employé qui ne travaille pas sur ce chantier n'y a pas accès, et la
    // réponse ne lui apprend pas que le chantier existe (404, jamais 403).
    const outsider = await request(app)
      .get(`/api/v1/cleaning-standards?siteId=${site.id}`)
      .set("Authorization", `Bearer ${outsiderToken}`);
    expect(outsider.status).toBe(404);
  });

  it("permet de modifier et supprimer un standard", async () => {
    const { accessToken } = await loginAs(Role.HR, "hr-std2@deepclean.test");
    const site = await createTestSite();

    const created = await request(app)
      .post("/api/v1/cleaning-standards")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ siteId: site.id, name: "Standard B", tasks: ["Étape 1"], equipment: [] });
    const id = created.body.standard.id as string;

    const updated = await request(app)
      .patch(`/api/v1/cleaning-standards/${id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ tasks: ["Étape 1", "Étape 2"] });
    expect(updated.status).toBe(200);
    expect(updated.body.standard.tasks).toEqual(["Étape 1", "Étape 2"]);

    const deleted = await request(app)
      .delete(`/api/v1/cleaning-standards/${id}`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(deleted.status).toBe(204);

    const list = await request(app)
      .get(`/api/v1/cleaning-standards?siteId=${site.id}`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(list.body.items).toHaveLength(0);
  });
});

describe("Application d'un standard à la création d'une mission", () => {
  it("copie le contenu du standard dans la fiche de poste de la mission créée", async () => {
    const { accessToken } = await loginAs(Role.SUPERVISOR, "sup-std2@deepclean.test");
    const employee = await createTestUser({ role: Role.EMPLOYEE, email: "emp-std3@deepclean.test" });
    const site = await createTestSite();

    const standard = await request(app)
      .post("/api/v1/cleaning-standards")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        siteId: site.id,
        name: "Standard clinique",
        tasks: ["Désinfecter les surfaces"],
        equipment: ["Produit virucide"],
        safetyInstructions: "Port du masque obligatoire",
      });
    const standardId = standard.body.standard.id as string;

    const mission = await request(app)
      .post("/api/v1/missions")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        siteId: site.id,
        title: "Nettoyage standard",
        date: tomorrowDateString(),
        startTime: "08:00",
        endTime: "10:00",
        assigneeIds: [employee.id],
        standardId,
      });

    expect(mission.status).toBe(201);
    expect(mission.body.mission.standard.name).toBe("Standard clinique");
    expect(mission.body.mission.jobSheet.tasks).toEqual(["Désinfecter les surfaces"]);
    expect(mission.body.mission.jobSheet.equipment).toEqual(["Produit virucide"]);
    expect(mission.body.mission.jobSheet.safetyInstructions).toBe("Port du masque obligatoire");
  });

  it("refuse d'appliquer un standard qui appartient à un AUTRE chantier", async () => {
    const { accessToken } = await loginAs(Role.SUPERVISOR, "sup-std3@deepclean.test");
    const employee = await createTestUser({ role: Role.EMPLOYEE, email: "emp-std4@deepclean.test" });
    const siteA = await createTestSite({ name: "Chantier A" });
    const siteB = await createTestSite({ name: "Chantier B" });

    const standard = await request(app)
      .post("/api/v1/cleaning-standards")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ siteId: siteA.id, name: "Standard A", tasks: [], equipment: [] });

    const mission = await request(app)
      .post("/api/v1/missions")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        siteId: siteB.id,
        title: "Nettoyage",
        date: tomorrowDateString(),
        startTime: "08:00",
        endTime: "10:00",
        assigneeIds: [employee.id],
        standardId: standard.body.standard.id,
      });

    expect(mission.status).toBe(400);
  });
});
