import request from "supertest";
import { Role } from "@prisma/client";
import { createApp } from "../src/app";
import { prisma } from "../src/db/prisma";
import { createTestUser, resetDatabase, TEST_PASSWORD, tinyTestPhoto } from "./helpers";

// Accueil public de l'application : la RH ou la direction y met des
// actualités depuis son espace ; le public (sans compte) ne voit que celles-ci,
// sans rien sur leur auteur.

const app = createApp();

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function tokenFor(role: Role, email: string) {
  const user = await createTestUser({ role, email });
  const login = await request(app).post("/api/v1/auth/login").send({ username: user.username, password: TEST_PASSWORD });
  return login.body.accessToken as string;
}

function publish(token: string, title: string, isPublic?: boolean) {
  const req = request(app).post("/api/v1/announcements").set("Authorization", `Bearer ${token}`).field("title", title).field("body", `${title} — le détail.`);
  return isPublic === undefined ? req : req.field("isPublic", String(isPublic));
}

describe("Actualités de l'accueil public", () => {
  it("ne montre au public que les actualités publiques, sans leur auteur", async () => {
    const hr = await tokenFor(Role.HR, "hr-news@deepclean.test");
    expect((await publish(hr, "Réunion d'équipe lundi")).status).toBe(201);
    const pub = await publish(hr, "Nous recrutons à Manosque", true);
    expect(pub.status).toBe(201);
    expect(pub.body.announcement.isPublic).toBe(true);

    const list = await request(app).get("/api/v1/public/news");
    expect(list.status).toBe(200);
    expect(list.body.items.map((n: { title: string }) => n.title)).toEqual(["Nous recrutons à Manosque"]);
    expect(list.body.items[0].author).toBeUndefined();
    expect(list.body.items[0].publishedAt).toBeTruthy();

    const internal = await prisma.announcement.findFirstOrThrow({ where: { isPublic: false } });
    expect((await request(app).get(`/api/v1/public/news/${internal.id}`)).status).toBe(404);
    expect((await request(app).get(`/api/v1/public/news/${pub.body.announcement.id}`)).body.news.title).toBe("Nous recrutons à Manosque");
  });

  it("sert la photo d'une actualité publique seulement", async () => {
    const director = await tokenFor(Role.DIRECTOR, "dir-news@deepclean.test");
    const withPhoto = await request(app)
      .post("/api/v1/announcements")
      .set("Authorization", `Bearer ${director}`)
      .field("title", "Nouveau matériel")
      .field("body", "Nos équipes sont équipées d'une nouvelle injecteuse-extracteuse.")
      .field("isPublic", "true")
      .attach("photo", await tinyTestPhoto(), { filename: "photo.jpg", contentType: "image/jpeg" });
    expect(withPhoto.status).toBe(201);
    const id = withPhoto.body.announcement.id as string;

    const photo = await request(app).get(`/api/v1/public/news/${id}/cover-photo`);
    expect(photo.status).toBe(200);
    expect(photo.headers["content-type"]).toBe("image/jpeg");

    await request(app).patch(`/api/v1/announcements/${id}/visibility`).set("Authorization", `Bearer ${director}`).send({ isPublic: false });
    expect((await request(app).get(`/api/v1/public/news/${id}/cover-photo`)).status).toBe(404);
    expect((await request(app).get("/api/v1/public/news")).body.items).toEqual([]);
  });

  it("réserve l'accueil public à la RH, la direction et l'admin technique", async () => {
    const supervisor = await tokenFor(Role.SUPERVISOR, "sup-news@deepclean.test");
    const refused = await publish(supervisor, "Annonce superviseur", true);
    expect(refused.status).toBe(403);
    const internal = await publish(supervisor, "Annonce superviseur");
    expect(internal.status).toBe(201);
    const id = internal.body.announcement.id as string;

    for (const role of [Role.EMPLOYEE, Role.SITE_MANAGER, Role.SUPERVISOR]) {
      const token = await tokenFor(role, `${role.toLowerCase()}-vis@deepclean.test`);
      const res = await request(app).patch(`/api/v1/announcements/${id}/visibility`).set("Authorization", `Bearer ${token}`).send({ isPublic: true });
      expect(res.status).toBe(403);
    }
    expect((await request(app).patch(`/api/v1/announcements/${id}/visibility`).send({ isPublic: true })).status).toBe(401);

    const admin = await tokenFor(Role.ADMIN, "admin-vis@deepclean.test");
    const ok = await request(app).patch(`/api/v1/announcements/${id}/visibility`).set("Authorization", `Bearer ${admin}`).send({ isPublic: true });
    expect(ok.status).toBe(200);
    expect(ok.body.announcement.isPublic).toBe(true);
    expect(await prisma.activityLog.count({ where: { action: "ANNOUNCEMENT_MADE_PUBLIC", entityId: id } })).toBe(1);
  });
});
