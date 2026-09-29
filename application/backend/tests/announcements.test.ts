import request from "supertest";
import { Role } from "@prisma/client";
import { createApp } from "../src/app";
import { prisma } from "../src/db/prisma";
import { createTestUser, resetDatabase, tinyTestPhoto, TEST_PASSWORD } from "./helpers";

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

describe("Actualités — photo de couverture", () => {
  it("permet à la RH de publier une actualité avec une photo de couverture", async () => {
    const { accessToken } = await loginAs(Role.HR, "hr-annonce1@deepclean.test");

    const res = await request(app)
      .post("/api/v1/announcements")
      .set("Authorization", `Bearer ${accessToken}`)
      .field("title", "Bienvenue")
      .field("body", "Bienvenue à toutes et à tous dans nos nouveaux locaux.")
      .attach("photo", await tinyTestPhoto(), { filename: "locaux.jpg", contentType: "image/jpeg" });

    expect(res.status).toBe(201);
    expect(res.body.announcement.hasCoverPhoto).toBe(true);
    expect(res.body.announcement.coverPhotoKey).toBeUndefined();
  });

  it("publie sans photo si aucune n'est fournie", async () => {
    const { accessToken } = await loginAs(Role.DIRECTOR, "dir-annonce1@deepclean.test");

    const res = await request(app)
      .post("/api/v1/announcements")
      .set("Authorization", `Bearer ${accessToken}`)
      .field("title", "Info")
      .field("body", "Une actualité toute simple, sans photo.");

    expect(res.status).toBe(201);
    expect(res.body.announcement.hasCoverPhoto).toBe(false);
  });

  it("refuse à un employé de publier une actualité", async () => {
    const { accessToken } = await loginAs(Role.EMPLOYEE, "emp-annonce1@deepclean.test");

    const res = await request(app)
      .post("/api/v1/announcements")
      .set("Authorization", `Bearer ${accessToken}`)
      .field("title", "Info")
      .field("body", "Tentative non autorisée.");

    expect(res.status).toBe(403);
  });

  it("sert la photo de couverture à tout compte authentifié", async () => {
    const { accessToken: hrToken } = await loginAs(Role.HR, "hr-annonce2@deepclean.test");
    const { accessToken: empToken } = await loginAs(Role.EMPLOYEE, "emp-annonce2@deepclean.test");

    const created = await request(app)
      .post("/api/v1/announcements")
      .set("Authorization", `Bearer ${hrToken}`)
      .field("title", "Bienvenue")
      .field("body", "Nos nouveaux locaux.")
      .attach("photo", await tinyTestPhoto(), { filename: "locaux.jpg", contentType: "image/jpeg" });

    const photo = await request(app)
      .get(`/api/v1/announcements/${created.body.announcement.id}/cover-photo`)
      .set("Authorization", `Bearer ${empToken}`);
    expect(photo.status).toBe(200);
    expect(photo.headers["content-type"]).toContain("image/jpeg");
  });

  it("renvoie 404 pour la photo d'une actualité qui n'en a pas", async () => {
    const { accessToken } = await loginAs(Role.HR, "hr-annonce3@deepclean.test");

    const created = await request(app)
      .post("/api/v1/announcements")
      .set("Authorization", `Bearer ${accessToken}`)
      .field("title", "Info")
      .field("body", "Sans photo.");

    const photo = await request(app)
      .get(`/api/v1/announcements/${created.body.announcement.id}/cover-photo`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(photo.status).toBe(404);
  });
});
