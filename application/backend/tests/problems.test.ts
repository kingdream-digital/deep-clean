import request from "supertest";
import { Role } from "@prisma/client";
import { createApp } from "../src/app";
import { prisma } from "../src/db/prisma";
import { createTestSite, createTestUser, resetDatabase, TEST_PASSWORD } from "./helpers";

const app = createApp();

// PNG 1x1 valide (transparent) — suffisant pour que sharp puisse réellement
// décoder/recompresser l'image dans le test, comme en conditions réelles.
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);

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

async function createMissionWithEmployee() {
  const { user: manager, accessToken: managerToken } = await loginAs(Role.SITE_MANAGER, "problems-manager@deepclean.test");
  // Depuis le retour explicite du client, le chef d'équipe ne crée plus le
  // planning : c'est le superviseur qui crée la mission sur son chantier.
  const { accessToken: supervisorToken } = await loginAs(Role.SUPERVISOR, "problems-supervisor@deepclean.test");
  const employee = await createTestUser({ role: Role.EMPLOYEE, email: "problems-emp@deepclean.test" });
  const outsider = await createTestUser({ role: Role.EMPLOYEE, email: "problems-outsider@deepclean.test" });
  const site = await createTestSite({ managerId: manager.id });

  const mission = await request(app)
    .post("/api/v1/missions")
    .set("Authorization", `Bearer ${supervisorToken}`)
    .send({
      siteId: site.id,
      title: "Nettoyage",
      date: tomorrowDateString(),
      startTime: "08:00",
      endTime: "12:00",
      assigneeIds: [employee.id],
    });

  return { manager, managerToken, employee, outsider, site, missionId: mission.body.mission.id as string };
}

describe("Signalement de problème depuis une mission", () => {
  it("permet à l'employé affecté de signaler un matériel manquant et notifie le chef d'équipe", async () => {
    const { manager, employee, missionId } = await createMissionWithEmployee();
    const login = await request(app).post("/api/v1/auth/login").send({ username: employee.username, password: TEST_PASSWORD });

    const res = await request(app)
      .post("/api/v1/problems")
      .set("Authorization", `Bearer ${login.body.accessToken}`)
      .send({ missionId, type: "MISSING_MATERIAL", description: "Plus de produit désinfectant." });

    expect(res.status).toBe(201);
    expect(res.body.problem.type).toBe("MISSING_MATERIAL");
    expect(res.body.problem.status).toBe("NEW");

    const notifications = await prisma.notification.findMany({ where: { userId: manager.id, type: "PROBLEM_UPDATE" } });
    expect(notifications).toHaveLength(1);
    expect(notifications[0]!.body).toContain("matériel manquant");
  });

  it("refuse à un employé non affecté à la mission de signaler un problème", async () => {
    const { outsider, missionId } = await createMissionWithEmployee();
    const login = await request(app).post("/api/v1/auth/login").send({ username: outsider.username, password: TEST_PASSWORD });

    const res = await request(app)
      .post("/api/v1/problems")
      .set("Authorization", `Bearer ${login.body.accessToken}`)
      .send({ missionId, description: "Problème quelconque." });

    expect(res.status).toBe(403);
  });

  it("laisse la RH signaler un problème (retour explicite du client) et garder une visibilité globale", async () => {
    const { employee, missionId } = await createMissionWithEmployee();
    const { accessToken } = await loginAs(Role.HR, "problems-hr@deepclean.test");

    // Signaler un problème est ouvert à tous les rôles depuis le retour
    // explicite du client (voir CLAUDE.md, section CHEF D'ÉQUIPE) : la RH en
    // était exclue à l'origine, elle ne l'est plus.
    const create = await request(app)
      .post("/api/v1/problems")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ missionId, description: "Problème quelconque." });
    expect(create.status).toBe(201);

    const employeeLogin = await request(app).post("/api/v1/auth/login").send({ username: employee.username, password: TEST_PASSWORD });
    const reported = await request(app)
      .post("/api/v1/problems")
      .set("Authorization", `Bearer ${employeeLogin.body.accessToken}`)
      .send({ missionId, description: "Sol endommagé dans le couloir." });

    const list = await request(app).get("/api/v1/problems").set("Authorization", `Bearer ${accessToken}`);
    expect(list.status).toBe(200);
    expect(list.body.items.some((p: { id: string }) => p.id === reported.body.problem.id)).toBe(true);

    const detail = await request(app)
      .get(`/api/v1/problems/${reported.body.problem.id}`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(detail.status).toBe(200);
  });

  it("un employé non concerné ne peut pas consulter le signalement d'un autre", async () => {
    const { employee, outsider, missionId } = await createMissionWithEmployee();
    const employeeLogin = await request(app).post("/api/v1/auth/login").send({ username: employee.username, password: TEST_PASSWORD });
    const created = await request(app)
      .post("/api/v1/problems")
      .set("Authorization", `Bearer ${employeeLogin.body.accessToken}`)
      .send({ missionId, description: "Sol endommagé dans le couloir." });

    const outsiderLogin = await request(app).post("/api/v1/auth/login").send({ username: outsider.username, password: TEST_PASSWORD });
    const res = await request(app)
      .get(`/api/v1/problems/${created.body.problem.id}`)
      .set("Authorization", `Bearer ${outsiderLogin.body.accessToken}`);

    expect(res.status).toBe(404);
  });
});

describe("Suivi du statut d'un signalement", () => {
  it("fait avancer le statut et notifie l'auteur, mais refuse de reculer", async () => {
    const { managerToken, employee, missionId } = await createMissionWithEmployee();
    const employeeLogin = await request(app).post("/api/v1/auth/login").send({ username: employee.username, password: TEST_PASSWORD });
    const created = await request(app)
      .post("/api/v1/problems")
      .set("Authorization", `Bearer ${employeeLogin.body.accessToken}`)
      .send({ missionId, description: "Sol endommagé dans le couloir." });

    const advance = await request(app)
      .post(`/api/v1/problems/${created.body.problem.id}/status`)
      .set("Authorization", `Bearer ${managerToken}`)
      .send({ status: "IN_PROGRESS" });
    expect(advance.status).toBe(200);

    const notifications = await prisma.notification.findMany({
      where: { userId: employee.id, type: "PROBLEM_UPDATE" },
    });
    expect(notifications).toHaveLength(1);

    const advanceAgain = await request(app)
      .post(`/api/v1/problems/${created.body.problem.id}/status`)
      .set("Authorization", `Bearer ${managerToken}`)
      .send({ status: "RESOLVED" });
    expect(advanceAgain.status).toBe(200);

    // RESOLVED -> IN_PROGRESS est un enum valide mais un recul dans le suivi : refusé par le service.
    const rollback = await request(app)
      .post(`/api/v1/problems/${created.body.problem.id}/status`)
      .set("Authorization", `Bearer ${managerToken}`)
      .send({ status: "IN_PROGRESS" });
    expect(rollback.status).toBe(409);
  });

  it("refuse à un employé (non gestionnaire) de faire avancer le statut", async () => {
    const { employee, missionId } = await createMissionWithEmployee();
    const employeeLogin = await request(app).post("/api/v1/auth/login").send({ username: employee.username, password: TEST_PASSWORD });
    const created = await request(app)
      .post("/api/v1/problems")
      .set("Authorization", `Bearer ${employeeLogin.body.accessToken}`)
      .send({ missionId, description: "Sol endommagé dans le couloir." });

    const res = await request(app)
      .post(`/api/v1/problems/${created.body.problem.id}/status`)
      .set("Authorization", `Bearer ${employeeLogin.body.accessToken}`)
      .send({ status: "IN_PROGRESS" });

    expect(res.status).toBe(403);
  });
});

describe("Commentaires et photos", () => {
  it("permet d'ajouter un commentaire visible par les parties concernées", async () => {
    const { managerToken, employee, missionId } = await createMissionWithEmployee();
    const employeeLogin = await request(app).post("/api/v1/auth/login").send({ username: employee.username, password: TEST_PASSWORD });
    const created = await request(app)
      .post("/api/v1/problems")
      .set("Authorization", `Bearer ${employeeLogin.body.accessToken}`)
      .send({ missionId, description: "Sol endommagé dans le couloir." });

    const res = await request(app)
      .post(`/api/v1/problems/${created.body.problem.id}/comments`)
      .set("Authorization", `Bearer ${managerToken}`)
      .send({ comment: "Pris en compte, intervention prévue demain." });

    expect(res.status).toBe(201);
    expect(res.body.comment.comment).toBe("Pris en compte, intervention prévue demain.");
  });

  it("indique si l'auteur a une photo, sans jamais exposer sa clé de stockage", async () => {
    const { manager, managerToken, employee, missionId } = await createMissionWithEmployee();
    await prisma.user.update({ where: { id: manager.id }, data: { avatarKey: "avatars/secret-key.jpg" } });
    const employeeLogin = await request(app).post("/api/v1/auth/login").send({ username: employee.username, password: TEST_PASSWORD });
    const created = await request(app)
      .post("/api/v1/problems")
      .set("Authorization", `Bearer ${employeeLogin.body.accessToken}`)
      .send({ missionId, description: "Vitre fissurée." });
    const comment = await request(app)
      .post(`/api/v1/problems/${created.body.problem.id}/comments`)
      .set("Authorization", `Bearer ${managerToken}`)
      .send({ comment: "Vu." });

    const detail = await request(app)
      .get(`/api/v1/problems/${created.body.problem.id}`)
      .set("Authorization", `Bearer ${managerToken}`);

    expect(comment.body.comment.author.hasAvatar).toBe(true);
    expect(detail.body.problem.comments[0].author.hasAvatar).toBe(true);
    expect(detail.body.problem.reportedBy.hasAvatar).toBe(false);
    expect(JSON.stringify(detail.body)).not.toContain("secret-key");
    expect(JSON.stringify(comment.body)).not.toContain("secret-key");
  });

  it("permet d'uploader une photo, de la télécharger de façon authentifiée, et refuse l'accès à un tiers", async () => {
    const { employee, outsider, missionId } = await createMissionWithEmployee();
    const employeeLogin = await request(app).post("/api/v1/auth/login").send({ username: employee.username, password: TEST_PASSWORD });
    const created = await request(app)
      .post("/api/v1/problems")
      .set("Authorization", `Bearer ${employeeLogin.body.accessToken}`)
      .send({ missionId, description: "Sol endommagé dans le couloir." });
    const problemId = created.body.problem.id as string;

    const upload = await request(app)
      .post(`/api/v1/problems/${problemId}/photos`)
      .set("Authorization", `Bearer ${employeeLogin.body.accessToken}`)
      .attach("photo", TINY_PNG, { filename: "photo.png", contentType: "image/png" });

    expect(upload.status).toBe(201);
    expect(upload.body.photo.mimeType).toBe("image/jpeg"); // recompressée en JPEG par utils/storage.ts
    expect(upload.body.photo.daysUntilDeletion).toBe(14); // conservation 14 jours (voir jobs/photoRetention.ts)
    const photoId = upload.body.photo.id as string;

    const download = await request(app)
      .get(`/api/v1/problems/${problemId}/photos/${photoId}/file`)
      .set("Authorization", `Bearer ${employeeLogin.body.accessToken}`);
    expect(download.status).toBe(200);
    expect(download.headers["content-type"]).toBe("image/jpeg");

    const outsiderLogin = await request(app).post("/api/v1/auth/login").send({ username: outsider.username, password: TEST_PASSWORD });
    const forbidden = await request(app)
      .get(`/api/v1/problems/${problemId}/photos/${photoId}/file`)
      .set("Authorization", `Bearer ${outsiderLogin.body.accessToken}`);
    expect(forbidden.status).toBe(404);
  });
});
