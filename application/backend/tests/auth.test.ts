import request from "supertest";
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

describe("POST /api/v1/auth/login", () => {
  it("refuse un mot de passe incorrect sans révéler la cause précise", async () => {
    const user = await createTestUser({ email: "employe@deepclean.test" });

    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ username: user.username, password: "MauvaisMotDePasse1!" });

    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe("Identifiant ou mot de passe incorrect.");
  });

  it("refuse un identifiant inexistant avec le même message générique", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ username: "inconnu", password: "Whatever1!" });

    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe("Identifiant ou mot de passe incorrect.");
  });

  it("connecte un utilisateur actif avec les bons identifiants", async () => {
    const user = await createTestUser({ email: "employe2@deepclean.test" });

    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ username: user.username, password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    expect(res.body.user.email).toBe(user.email);
  });

  it("refuse la connexion d'un compte désactivé", async () => {
    const user = await createTestUser({ email: "desactive@deepclean.test", isActive: false });

    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ username: user.username, password: TEST_PASSWORD });

    expect(res.status).toBe(403);
    expect(res.body.error.message).toMatch(/RH/);
  });
});

describe("Cycle de session (refresh / logout)", () => {
  it("fait tourner le refresh token et invalide l'ancien", async () => {
    const user = await createTestUser({ email: "session@deepclean.test" });
    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ username: user.username, password: TEST_PASSWORD });

    const firstRefreshToken = login.body.refreshToken as string;

    const refreshed = await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: firstRefreshToken });
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.refreshToken).not.toBe(firstRefreshToken);

    const reuseOldToken = await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: firstRefreshToken });
    expect(reuseOldToken.status).toBe(401);
  });

  it("invalide la session après déconnexion", async () => {
    const user = await createTestUser({ email: "logout@deepclean.test" });
    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ username: user.username, password: TEST_PASSWORD });

    const logout = await request(app)
      .post("/api/v1/auth/logout")
      .send({ refreshToken: login.body.refreshToken });
    expect(logout.status).toBe(204);

    const refreshAfterLogout = await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: login.body.refreshToken });
    expect(refreshAfterLogout.status).toBe(401);
  });
});

describe("GET /api/v1/auth/me", () => {
  it("refuse une requête sans token", async () => {
    const res = await request(app).get("/api/v1/auth/me");
    expect(res.status).toBe(401);
  });

  it("refuse un token invalide", async () => {
    const res = await request(app).get("/api/v1/auth/me").set("Authorization", "Bearer token-invalide");
    expect(res.status).toBe(401);
  });

  it("retourne l'utilisateur courant avec un token valide", async () => {
    const user = await createTestUser({ email: "me@deepclean.test" });
    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ username: user.username, password: TEST_PASSWORD });

    const res = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${login.body.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(user.id);
  });
});

describe("POST /api/v1/auth/change-password", () => {
  it("rejette un changement de mot de passe avec un mot de passe actuel incorrect", async () => {
    const user = await createTestUser({ email: "changepw@deepclean.test" });
    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ username: user.username, password: TEST_PASSWORD });

    const res = await request(app)
      .post("/api/v1/auth/change-password")
      .set("Authorization", `Bearer ${login.body.accessToken}`)
      .send({ currentPassword: "Faux1!MotDePasse", newPassword: "NouveauMotDePasse9!" });

    expect(res.status).toBe(400);
  });

  it("déconnecte les autres sessions après un changement de mot de passe", async () => {
    const user = await createTestUser({ email: "changepw2@deepclean.test" });
    const sessionA = await request(app)
      .post("/api/v1/auth/login")
      .send({ username: user.username, password: TEST_PASSWORD });
    const sessionB = await request(app)
      .post("/api/v1/auth/login")
      .send({ username: user.username, password: TEST_PASSWORD });

    const change = await request(app)
      .post("/api/v1/auth/change-password")
      .set("Authorization", `Bearer ${sessionA.body.accessToken}`)
      .send({ currentPassword: TEST_PASSWORD, newPassword: "NouveauMotDePasse9!" });
    expect(change.status).toBe(200);

    const refreshB = await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: sessionB.body.refreshToken });
    expect(refreshB.status).toBe(401);
  });
});
