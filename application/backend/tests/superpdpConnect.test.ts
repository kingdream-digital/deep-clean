import crypto from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";
import request from "supertest";
import { Role } from "@prisma/client";
import { createApp } from "../src/app";
import { env } from "../src/config/env";
import { prisma } from "../src/db/prisma";
import { resetSuperPdpToken } from "../src/modules/einvoicing/superpdp.client";
import { decryptToken } from "../src/modules/einvoicing/superpdpOAuth";
import { createTestUser, resetDatabase, TEST_PASSWORD } from "./helpers";

const app = createApp();
const mutableEnv = env as unknown as Record<string, unknown>;
const REDIRECT = "https://api.deep-clean.test/api/v1/einvoicing/superpdp/callback";

// Faux serveur d'autorisation et API Super PDP (mode éditeur).
let lastVerifier = "";
let refreshCount = 0;
let refreshRevoked = false;
let verification = "needs_review";
const forms: Record<string, string>[] = [];
const server = http.createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const json = (code: number, data: unknown) => {
      res.writeHead(code, { "content-type": "application/json" });
      res.end(JSON.stringify(data));
    };
    const form = Object.fromEntries(new URLSearchParams(Buffer.concat(chunks).toString()));
    if (req.url === "/oauth2/token") {
      forms.push(form);
      if (form.client_id !== "kingdream-app" || form.client_secret !== "kingdream-secret") return json(401, { error: "invalid_client" });
      if (form.grant_type === "authorization_code") {
        lastVerifier = form.code_verifier ?? "";
        if (form.code !== "code-ok" || form.redirect_uri !== REDIRECT) return json(400, { error: "invalid_grant" });
        return json(200, { access_token: "acces-1", refresh_token: "renouvellement-1", expires_in: 1800 });
      }
      if (form.grant_type === "refresh_token") {
        if (refreshRevoked || form.refresh_token !== `renouvellement-${refreshCount + 1}`) return json(400, { error: "invalid_grant" });
        refreshCount += 1;
        return json(200, { access_token: `acces-${refreshCount + 1}`, refresh_token: `renouvellement-${refreshCount + 1}`, expires_in: 1800 });
      }
      return json(400, { error: "unsupported_grant_type" });
    }
    if (req.url === "/oauth2/revoke") {
      forms.push(form);
      return json(200, {});
    }
    if (!req.headers.authorization?.startsWith("Bearer acces-")) return json(401, { error: "unauthorized" });
    if (req.url === "/v1.beta/oauth2_sessions/me") return json(200, { client_id: "kingdream-app", created_at: new Date().toISOString(), company_verification_status: verification });
    if (req.url === "/v1.beta/companies/me") {
      return verification === "verified" ? json(200, { id: 7, formal_name: "DEEP CLEAN", number: "942773375", env: "production" }) : json(403, { error: "forbidden" });
    }
    return json(404, { error: "not found" });
  });
});

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, resolve));
  mutableEnv.SUPERPDP_API_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

beforeEach(async () => {
  await resetDatabase();
  resetSuperPdpToken();
  forms.length = 0;
  refreshCount = 0;
  refreshRevoked = false;
  verification = "needs_review";
  Object.assign(mutableEnv, {
    SUPERPDP_OAUTH_CLIENT_ID: "kingdream-app",
    SUPERPDP_OAUTH_CLIENT_SECRET: "kingdream-secret",
    SUPERPDP_OAUTH_REDIRECT_URI: REDIRECT,
    COMPANY_SIRET: "94277337500012",
    COMPANY_EMAIL: "deepclean.contact.pro@gmail.com",
  });
  delete mutableEnv.SUPERPDP_CLIENT_ID;
  delete mutableEnv.SUPERPDP_CLIENT_SECRET;
});

afterAll(async () => {
  for (const k of ["SUPERPDP_OAUTH_CLIENT_ID", "SUPERPDP_OAUTH_CLIENT_SECRET", "SUPERPDP_OAUTH_REDIRECT_URI", "COMPANY_SIRET", "COMPANY_EMAIL"]) delete mutableEnv[k];
  server.close();
  await prisma.$disconnect();
});

async function auth(role: Role, email: string) {
  const user = await createTestUser({ role, email });
  const res = await request(app).post("/api/v1/auth/login").send({ username: user.username, password: TEST_PASSWORD });
  return { user, headers: { Authorization: `Bearer ${res.body.accessToken as string}` } };
}

async function startAndReturn(headers: Record<string, string>) {
  const start = await request(app).post("/api/v1/einvoicing/superpdp/connect").set(headers);
  expect(start.status).toBe(200);
  const url = new URL(start.body.url as string);
  return { url, state: url.searchParams.get("state")! };
}

describe("Bouton « Connecter Super PDP » (mode éditeur)", () => {
  it("prépare une autorisation pré-remplie, avec state et PKCE", async () => {
    const { headers } = await auth(Role.DIRECTOR, "dir-pdp@deepclean.test");
    const { url } = await startAndReturn(headers);
    expect(url.pathname).toBe("/oauth2/authorize");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      response_type: "code",
      client_id: "kingdream-app",
      redirect_uri: REDIRECT,
      code_challenge_method: "S256",
      login_hint: "deepclean.contact.pro@gmail.com",
      superpdp_company_number: "942773375",
      superpdp_company_number_scheme: "fr_siren",
    });
    expect(url.searchParams.get("state")!.length).toBeGreaterThan(30);
  });

  it("au retour : relie le compte, jeton chiffré en base, état de vérification affiché", async () => {
    const { user, headers } = await auth(Role.DIRECTOR, "dir-pdp2@deepclean.test");
    const { url, state } = await startAndReturn(headers);

    const back = await request(app).get(`/api/v1/einvoicing/superpdp/callback?state=${state}&code=code-ok`);
    expect(back.status).toBe(200);
    expect(back.text).toContain("Super PDP est connecté");
    expect(back.text).toContain("termine la vérification");

    // PKCE : le vérificateur envoyé correspond au défi de l'adresse d'autorisation.
    expect(crypto.createHash("sha256").update(lastVerifier).digest("base64url")).toBe(url.searchParams.get("code_challenge"));

    const row = await prisma.superPdpConnection.findUniqueOrThrow({ where: { id: "default" } });
    expect(row.refreshTokenEnc).not.toContain("renouvellement");
    expect(decryptToken(row.refreshTokenEnc)).toBe("renouvellement-1");
    expect(row.connectedById).toBe(user.id);

    const overview = await request(app).get("/api/v1/einvoicing/overview").set(headers);
    expect(overview.body.overview.connection).toMatchObject({ configured: true, mode: "oauth", oauthAvailable: true, account: { verificationStatus: "needs_review" } });

    // Le state est à usage unique.
    const replay = await request(app).get(`/api/v1/einvoicing/superpdp/callback?state=${state}&code=code-ok`);
    expect(replay.status).toBe(400);
    expect(replay.text).toContain("expiré");
  });

  it("renouvelle le jeton (remplacé à chaque usage) et met à jour la vérification", async () => {
    const { headers } = await auth(Role.ADMIN, "admin-pdp@deepclean.test");
    const { state } = await startAndReturn(headers);
    await request(app).get(`/api/v1/einvoicing/superpdp/callback?state=${state}&code=code-ok`);
    resetSuperPdpToken();
    verification = "verified";

    const test = await request(app).post("/api/v1/einvoicing/test-connection").set(headers);
    expect(test.status).toBe(200);
    const row = await prisma.superPdpConnection.findUniqueOrThrow({ where: { id: "default" } });
    expect(decryptToken(row.refreshTokenEnc)).toBe("renouvellement-2");
    expect(row).toMatchObject({ verificationStatus: "verified", companyName: "DEEP CLEAN", companyNumber: "942773375" });
  });

  it("autorisation retirée chez Super PDP : la connexion est oubliée avec un message clair", async () => {
    const { headers } = await auth(Role.DIRECTOR, "dir-pdp3@deepclean.test");
    const { state } = await startAndReturn(headers);
    await request(app).get(`/api/v1/einvoicing/superpdp/callback?state=${state}&code=code-ok`);
    resetSuperPdpToken();
    refreshRevoked = true;

    const test = await request(app).post("/api/v1/einvoicing/test-connection").set(headers);
    expect(test.status).toBe(400);
    expect(test.body.error.message).toContain("Connecter Super PDP");
    expect(await prisma.superPdpConnection.count()).toBe(0);
  });

  it("déconnexion : révoque l'autorisation chez Super PDP et oublie le jeton", async () => {
    const { headers } = await auth(Role.DIRECTOR, "dir-pdp4@deepclean.test");
    const { state } = await startAndReturn(headers);
    await request(app).get(`/api/v1/einvoicing/superpdp/callback?state=${state}&code=code-ok`);

    const res = await request(app).delete("/api/v1/einvoicing/superpdp/connection").set(headers);
    expect(res.status).toBe(200);
    expect(forms.at(-1)).toMatchObject({ token: "renouvellement-1", token_type_hint: "refresh_token" });
    expect(await prisma.superPdpConnection.count()).toBe(0);
    const overview = await request(app).get("/api/v1/einvoicing/overview").set(headers);
    expect(overview.body.overview.connection).toMatchObject({ configured: false, mode: null });
  });

  it("refus ou réponse trafiquée : rien n'est relié", async () => {
    const { headers } = await auth(Role.DIRECTOR, "dir-pdp5@deepclean.test");
    const denied = await request(app).get("/api/v1/einvoicing/superpdp/callback?error=access_denied");
    expect(denied.status).toBe(400);
    expect(denied.text).toContain("Connexion annulée");

    const forged = await request(app).get("/api/v1/einvoicing/superpdp/callback?state=invente&code=code-ok");
    expect(forged.status).toBe(400);

    const { state } = await startAndReturn(headers);
    const badCode = await request(app).get(`/api/v1/einvoicing/superpdp/callback?state=${state}&code=mauvais`);
    expect(badCode.status).toBe(400);
    expect(await prisma.superPdpConnection.count()).toBe(0);
  });

  it("réservé à la direction, la RH et l'admin ; bouton absent si le mode éditeur n'est pas installé", async () => {
    for (const [role, email] of [
      [Role.EMPLOYEE, "emp-pdp@deepclean.test"],
      [Role.SUPERVISOR, "sup-pdp@deepclean.test"],
      [Role.ACCOUNTANT, "compta-pdp@deepclean.test"],
    ] as const) {
      const { headers } = await auth(role, email);
      expect((await request(app).post("/api/v1/einvoicing/superpdp/connect").set(headers)).status).toBe(403);
    }
    const { headers } = await auth(Role.HR, "rh-pdp@deepclean.test");
    delete mutableEnv.SUPERPDP_OAUTH_CLIENT_ID;
    const res = await request(app).post("/api/v1/einvoicing/superpdp/connect").set(headers);
    expect(res.status).toBe(400);
    const overview = await request(app).get("/api/v1/einvoicing/overview").set(headers);
    expect(overview.body.overview.connection.oauthAvailable).toBe(false);
  });
});
