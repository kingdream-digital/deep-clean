import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { activate, api, createMember, createTestOrg, login, STRONG_PASSWORD, testApp, type TestOrg } from "./helpers.ts";
import { createOrganization } from "../src/modules/platform/platform.service.ts";

let app: FastifyInstance;
let org: TestOrg;

beforeAll(async () => {
  app = await testApp();
  org = await createTestOrg(app, "auth");
});
afterAll(async () => app.close());

describe("connexion", () => {
  it("refuse avec le même message neutre une entreprise, un identifiant ou un mot de passe faux", async () => {
    const attempts = [
      { organization: "inconnue", identifier: "x", password: "y" },
      { organization: org.slug, identifier: "personne", password: "y" },
      { organization: org.slug, identifier: "aadmin1", password: "faux" },
    ];
    const messages = new Set<string>();
    for (const payload of attempts) {
      const res = await app.inject({ method: "POST", url: "/v1/auth/login", payload });
      expect(res.statusCode).toBe(401);
      messages.add(res.json().error.message);
    }
    expect(messages.size).toBe(1);
    expect([...messages][0]).toContain("contactez la RH");
  });

  it("n'accepte que l'entreprise, l'identifiant et le mot de passe corrects", async () => {
    const member = await createMember(app, org, "EMPLOYEE");
    const session = await login(app, org.slug.toUpperCase(), member.username, STRONG_PASSWORD);
    const me = await api(app, session.token).get("/v1/auth/me");
    expect(me.statusCode).toBe(200);
    expect(me.json().role).toBe("EMPLOYEE");
  });

  it("bloque temporairement le compte après 5 échecs", async () => {
    const member = await createMember(app, org, "EMPLOYEE");
    for (let i = 0; i < 5; i += 1) {
      await app.inject({
        method: "POST",
        url: "/v1/auth/login",
        payload: { organization: org.slug, identifier: member.username, password: "mauvais" },
      });
    }
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { organization: org.slug, identifier: member.username, password: STRONG_PASSWORD },
    });
    expect(res.statusCode).toBe(429);
    expect(res.json().error.message).toContain("bloqué temporairement");
  });
});

describe("navigateur (CORS)", () => {
  it("autorise les modifications et suppressions depuis l'app web", async () => {
    const res = await app.inject({
      method: "OPTIONS",
      url: "/v1/quotes/00000000-0000-0000-0000-000000000000",
      headers: {
        origin: "http://localhost:8081",
        "access-control-request-method": "PATCH",
        "access-control-request-headers": "authorization,content-type",
      },
    });
    expect(res.statusCode).toBe(204);
    const allowed = String(res.headers["access-control-allow-methods"]);
    for (const method of ["PATCH", "PUT", "DELETE"]) expect(allowed).toContain(method);
  });
});

describe("limitation des tentatives de connexion", () => {
  it("compte les tentatives par compte visé, pas par adresse IP partagée", async () => {
    const { loginRateKey } = await import("../src/modules/auth/auth.routes.ts");
    const req = (organization: string, identifier: string, ip = "203.0.113.7") => ({ ip, body: { organization, identifier } }) as never;
    // Deux collègues derrière le même accès internet : compteurs distincts.
    expect(loginRateKey(req("deep-clean", "lpetit"))).not.toBe(loginRateKey(req("deep-clean", "erousseau")));
    // Le même compte, quelle que soit la casse : même compteur.
    expect(loginRateKey(req("Deep-Clean", " LPetit "))).toBe(loginRateKey(req("deep-clean", "lpetit")));
    // Une autre adresse : autre compteur (le verrouillage du compte, lui, reste global).
    expect(loginRateKey(req("deep-clean", "lpetit", "198.51.100.2"))).not.toBe(loginRateKey(req("deep-clean", "lpetit")));
  });
});

describe("premier accès", () => {
  it("impose le remplacement du mot de passe temporaire avant tout autre usage", async () => {
    const created = await api(app, org.admin.token).post("/v1/users", { firstName: "Paul", lastName: "Nouveau", role: "EMPLOYEE" });
    const { user, temporaryPassword } = created.json();
    const session = await login(app, org.slug, user.username, temporaryPassword);
    const blocked = await api(app, session.token).get("/v1/dashboard");
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json().error.code).toBe("PASSWORD_CHANGE_REQUIRED");

    const weak = await api(app, session.token).post("/v1/auth/change-password", {
      currentPassword: temporaryPassword,
      newPassword: "court",
    });
    expect(weak.statusCode).toBe(400);
    const ok = await api(app, session.token).post("/v1/auth/change-password", {
      currentPassword: temporaryPassword,
      newPassword: STRONG_PASSWORD,
    });
    expect(ok.statusCode).toBe(200);
    expect((await api(app, session.token).get("/v1/dashboard")).statusCode).toBe(200);
  });

  it("ne renvoie jamais le mot de passe ni son empreinte", async () => {
    const list = await api(app, org.admin.token).get("/v1/users");
    expect(list.body).not.toMatch(/passwordHash|argon2/);
  });
});

describe("sessions", () => {
  it("renouvelle la session par rotation du jeton", async () => {
    const member = await createMember(app, org, "SUPERVISOR");
    const first = await app.inject({ method: "POST", url: "/v1/auth/refresh", payload: { refreshToken: member.refreshToken } });
    expect(first.statusCode).toBe(200);
    expect(first.json().refreshToken).not.toBe(member.refreshToken);
    expect((await api(app, first.json().accessToken).get("/v1/auth/me")).statusCode).toBe(200);
  });

  it("déconnecte réellement : le jeton d'accès est refusé aussitôt", async () => {
    const member = await createMember(app, org, "EMPLOYEE");
    expect((await api(app, member.token).post("/v1/auth/logout")).statusCode).toBe(200);
    expect((await api(app, member.token).get("/v1/auth/me")).statusCode).toBe(401);
    const refresh = await app.inject({ method: "POST", url: "/v1/auth/refresh", payload: { refreshToken: member.refreshToken } });
    expect(refresh.statusCode).toBe(401);
  });

  it("coupe l'accès immédiatement quand la RH désactive un compte", async () => {
    const member = await createMember(app, org, "EMPLOYEE");
    expect((await api(app, member.token).get("/v1/dashboard")).statusCode).toBe(200);
    expect((await api(app, org.admin.token).post(`/v1/users/${member.userId}/deactivate`)).statusCode).toBe(200);
    expect((await api(app, member.token).get("/v1/dashboard")).statusCode).toBe(401);
    const relogin = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { organization: org.slug, identifier: member.username, password: STRONG_PASSWORD },
    });
    expect(relogin.statusCode).toBe(403);
    expect(relogin.json().error.message).toContain("contactez la RH");
  });

  it("réinitialise l'accès sans jamais exposer l'ancien mot de passe", async () => {
    const member = await createMember(app, org, "EMPLOYEE");
    const reset = await api(app, org.admin.token).post(`/v1/users/${member.userId}/reset-access`);
    expect(reset.statusCode).toBe(200);
    expect(reset.json().temporaryPassword).toHaveLength(14);
    // Les sessions en cours sont fermées, l'ancien mot de passe ne marche plus.
    expect((await api(app, member.token).get("/v1/auth/me")).statusCode).toBe(401);
    const old = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { organization: org.slug, identifier: member.username, password: STRONG_PASSWORD },
    });
    expect(old.statusCode).toBe(401);
    await activate(app, org.slug, member.username, reset.json().temporaryPassword);
  });

  it("révoque toute la famille de sessions si un jeton déjà renouvelé est rejoué", async () => {
    const member = await createMember(app, org, "EMPLOYEE");
    const rotated = await app.inject({ method: "POST", url: "/v1/auth/refresh", payload: { refreshToken: member.refreshToken } });
    expect(rotated.statusCode).toBe(200);
    // On simule un rejeu tardif du jeton volé (au-delà de la tolérance de 30 s).
    const pg = await import("pg");
    const admin = new pg.default.Client({ connectionString: process.env.DATABASE_ADMIN_URL });
    await admin.connect();
    await admin.query(`UPDATE sessions SET "revokedAt" = now() - interval '5 minutes' WHERE "userId" = $1 AND "replacedById" IS NOT NULL`, [
      member.userId,
    ]);
    await admin.end();
    const replay = await app.inject({ method: "POST", url: "/v1/auth/refresh", payload: { refreshToken: member.refreshToken } });
    expect(replay.statusCode).toBe(401);
    expect(replay.json().error.code).toBe("SESSION_REVOKED");
    // La session légitime issue de la rotation est elle aussi fermée.
    expect((await api(app, rotated.json().accessToken).get("/v1/auth/me")).statusCode).toBe(401);
  });
});

describe("ouverture d'une entreprise", () => {
  it("refuse un code entreprise déjà pris et exige le jeton opérateur", async () => {
    await expect(createOrganization({ slug: org.slug, name: "Doublon", admin: { firstName: "A", lastName: "B" } })).rejects.toThrow(
      /déjà utilisé/,
    );
    const res = await app.inject({
      method: "POST",
      url: "/v1/platform/organizations",
      payload: { slug: "pirate", name: "Pirate", admin: { firstName: "A", lastName: "B" } },
    });
    expect(res.statusCode).toBe(404);
  });

  it("ne propose aucune inscription publique", async () => {
    for (const url of ["/v1/auth/register", "/v1/auth/signup", "/v1/users/register"]) {
      expect((await app.inject({ method: "POST", url, payload: {} })).statusCode).toBeGreaterThanOrEqual(401);
    }
  });
});
