import crypto from "node:crypto";
import { env } from "../../config/env";
import { logger } from "../../config/logger";
import { prisma } from "../../db/prisma";
import { ApiError } from "../../utils/ApiError";
import { getCompanyProfile } from "./companyProfile";

// Connexion Super PDP en « mode éditeur » (OAuth 2.1 Authorization Code,
// https://www.superpdp.tech/documentation/4) — retour explicite du client :
// un bouton « Connecter Super PDP » dans l'application. Le dirigeant se
// connecte à SON compte Super PDP et autorise l'application de l'éditeur
// (KingDream Digital) ; aucun code à copier ni à installer.
//
// - `state` à usage unique et PKCE (S256), valables 15 minutes ;
// - jeton de renouvellement (1 an, REMPLACÉ à chaque usage) chiffré en base
//   (AES-256-GCM, clé dérivée de JWT_REFRESH_SECRET), jamais renvoyé ni journalisé ;
// - un seul renouvellement à la fois (le jeton change à chaque usage : deux
//   renouvellements simultanés invalideraient la connexion).

const STATE_TTL_MS = 15 * 60_000;
const CONNECTION_ID = "default";

export type VerificationStatus = "verified" | "needs_review" | "failed";

/** Les trois réglages du mode éditeur sont présents sur le serveur. */
export function oauthAvailable(): boolean {
  return !!env.SUPERPDP_OAUTH_CLIENT_ID?.trim() && !!env.SUPERPDP_OAUTH_CLIENT_SECRET?.trim() && !!env.SUPERPDP_OAUTH_REDIRECT_URI?.trim();
}

function apiUrl(path: string): string {
  return `${env.SUPERPDP_API_URL.replace(/\/$/, "")}${path}`;
}

// ─── Chiffrement du jeton de renouvellement ───────────────────────────────

function key(): Buffer {
  return Buffer.from(crypto.hkdfSync("sha256", env.JWT_REFRESH_SECRET, "deep-clean", "superpdp-refresh-token", 32));
}

export function encryptToken(token: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return `v1:${Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64")}`;
}

export function decryptToken(stored: string): string {
  const raw = Buffer.from(stored.replace(/^v1:/, ""), "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
}

const b64url = (buf: Buffer) => buf.toString("base64url");

// ─── Démarrage : adresse de la page d'autorisation Super PDP ──────────────

export async function startConnection(userId: string): Promise<string> {
  if (!oauthAvailable()) {
    throw ApiError.badRequest("Le bouton « Connecter Super PDP » n'est pas encore activé sur ce serveur. Contactez votre prestataire.");
  }
  await prisma.superPdpOAuthState.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - STATE_TTL_MS) } } });
  const state = b64url(crypto.randomBytes(32));
  const codeVerifier = b64url(crypto.randomBytes(48));
  await prisma.superPdpOAuthState.create({ data: { state, codeVerifier, userId } });

  const params = new URLSearchParams({
    response_type: "code",
    client_id: env.SUPERPDP_OAUTH_CLIENT_ID!.trim(),
    redirect_uri: env.SUPERPDP_OAUTH_REDIRECT_URI!.trim(),
    state,
    code_challenge: b64url(crypto.createHash("sha256").update(codeVerifier).digest()),
    code_challenge_method: "S256",
    superpdp_send_and_receive: "any",
  });
  // Pré-remplissage (email et SIREN de l'entreprise) : le dirigeant n'a
  // presque rien à saisir chez Super PDP.
  const company = getCompanyProfile();
  if (company.email) params.set("login_hint", company.email);
  if (company.siren && /^\d{9}$/.test(company.siren)) {
    params.set("superpdp_company_number", company.siren);
    params.set("superpdp_company_number_scheme", "fr_siren");
  }
  return `${apiUrl("/oauth2/authorize")}?${params.toString()}`;
}

// ─── Échanges avec le serveur d'autorisation ──────────────────────────────

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}

async function tokenRequest(form: Record<string, string>): Promise<{ ok: true; data: TokenResponse } | { ok: false; status: number; error: string }> {
  const res = await fetch(apiUrl("/oauth2/token"), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ ...form, client_id: env.SUPERPDP_OAUTH_CLIENT_ID!.trim(), client_secret: env.SUPERPDP_OAUTH_CLIENT_SECRET!.trim() }),
  });
  if (res.ok) return { ok: true, data: (await res.json()) as TokenResponse };
  let error = "";
  try {
    error = ((await res.json()) as { error?: string }).error ?? "";
  } catch {
    // corps non JSON
  }
  return { ok: false, status: res.status, error };
}

/** Entreprise reliée et état de sa vérification chez Super PDP. */
async function describe(accessToken: string): Promise<{ verificationStatus: string | null; companyName: string | null; companyNumber: string | null }> {
  const get = (path: string) => fetch(apiUrl(path), { headers: { authorization: `Bearer ${accessToken}` } });
  let verificationStatus: string | null = null;
  let companyName: string | null = null;
  let companyNumber: string | null = null;
  try {
    const session = await get("/v1.beta/oauth2_sessions/me");
    if (session.ok) verificationStatus = ((await session.json()) as { company_verification_status?: string }).company_verification_status ?? null;
    // Refusé (403) tant que l'entreprise n'est pas vérifiée : sans gravité.
    const company = await get("/v1.beta/companies/me");
    if (company.ok) {
      const c = (await company.json()) as { formal_name?: string; trade_name?: string; number?: string };
      companyName = c.formal_name ?? c.trade_name ?? null;
      companyNumber = c.number ?? null;
    }
  } catch (err) {
    logger.warn({ err }, "Super PDP : lecture de l'état de la connexion impossible");
  }
  return { verificationStatus, companyName, companyNumber };
}

// ─── Retour de Super PDP : la connexion est enregistrée ───────────────────

export interface CompletedConnection {
  userId: string;
  companyName: string | null;
  verificationStatus: string | null;
  accessToken: string;
  expiresIn: number;
}

export async function completeConnection(state: string, code: string): Promise<CompletedConnection> {
  if (!oauthAvailable()) throw ApiError.badRequest("Connexion Super PDP non activée sur ce serveur.");
  const pending = await prisma.superPdpOAuthState.findUnique({ where: { state } });
  // Usage unique : supprimé avant tout échange, même s'il échoue ensuite.
  if (pending) await prisma.superPdpOAuthState.delete({ where: { state } }).catch(() => undefined);
  if (!pending || pending.createdAt.getTime() < Date.now() - STATE_TTL_MS) {
    throw ApiError.badRequest("Cette demande de connexion a expiré. Relancez « Connecter Super PDP » depuis l'application.");
  }

  const result = await tokenRequest({
    grant_type: "authorization_code",
    code,
    redirect_uri: env.SUPERPDP_OAUTH_REDIRECT_URI!.trim(),
    code_verifier: pending.codeVerifier,
  });
  if (!result.ok || !result.data.refresh_token) {
    logger.warn({ status: result.ok ? 200 : result.status, error: result.ok ? "refresh_token absent" : result.error }, "Super PDP : échange du code refusé");
    throw ApiError.badRequest("Super PDP n'a pas validé la connexion. Relancez « Connecter Super PDP » depuis l'application.");
  }

  const info = await describe(result.data.access_token);
  const data = {
    refreshTokenEnc: encryptToken(result.data.refresh_token),
    companyName: info.companyName,
    companyNumber: info.companyNumber,
    verificationStatus: info.verificationStatus,
    connectedById: pending.userId,
    connectedAt: new Date(),
  };
  await prisma.superPdpConnection.upsert({ where: { id: CONNECTION_ID }, create: { id: CONNECTION_ID, ...data }, update: data });
  return {
    userId: pending.userId,
    companyName: info.companyName,
    verificationStatus: info.verificationStatus,
    accessToken: result.data.access_token,
    expiresIn: result.data.expires_in ?? 1800,
  };
}

// ─── Utilisation : jeton d'accès à partir du jeton de renouvellement ──────

export async function hasOAuthConnection(): Promise<boolean> {
  if (!oauthAvailable()) return false;
  return (await prisma.superPdpConnection.count({ where: { id: CONNECTION_ID } })) > 0;
}

let refreshing: Promise<{ accessToken: string; expiresIn: number }> | null = null;

/** Nouveau jeton d'accès ; le jeton de renouvellement reçu en échange est enregistré aussitôt. */
export function refreshAccessToken(): Promise<{ accessToken: string; expiresIn: number }> {
  if (!refreshing) {
    refreshing = doRefresh().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

async function doRefresh(): Promise<{ accessToken: string; expiresIn: number }> {
  const row = await prisma.superPdpConnection.findUnique({ where: { id: CONNECTION_ID } });
  if (!row) throw ApiError.badRequest("Aucun compte Super PDP n'est relié. Cliquez sur « Connecter Super PDP » dans l'espace Super PDP.");
  let current: string;
  try {
    current = decryptToken(row.refreshTokenEnc);
  } catch {
    // Clé du serveur changée (JWT_REFRESH_SECRET) : la connexion est à refaire.
    await prisma.superPdpConnection.deleteMany({ where: { id: CONNECTION_ID } });
    throw ApiError.badRequest("Le compte Super PDP doit être reconnecté. Cliquez sur « Connecter Super PDP » dans l'espace Super PDP.");
  }
  const result = await tokenRequest({ grant_type: "refresh_token", refresh_token: current });
  if (!result.ok) {
    if (result.status === 400 || result.status === 401) {
      // Autorisation retirée chez Super PDP, ou compte inutilisé depuis un an.
      logger.warn({ status: result.status, error: result.error }, "Super PDP : autorisation expirée ou retirée");
      await prisma.superPdpConnection.deleteMany({ where: { id: CONNECTION_ID } });
      throw ApiError.badRequest("L'accès au compte Super PDP a été retiré ou a expiré. Cliquez sur « Connecter Super PDP » pour le relier à nouveau.");
    }
    throw ApiError.badRequest("Super PDP est momentanément indisponible. Réessayez dans quelques minutes.");
  }
  if (result.data.refresh_token) {
    await prisma.superPdpConnection.update({ where: { id: CONNECTION_ID }, data: { refreshTokenEnc: encryptToken(result.data.refresh_token) } });
  }
  return { accessToken: result.data.access_token, expiresIn: result.data.expires_in ?? 1800 };
}

/** Met à jour l'entreprise reliée et son état de vérification. */
export async function refreshConnectionStatus(accessToken: string): Promise<void> {
  const info = await describe(accessToken);
  if (!info.verificationStatus && !info.companyName) return;
  await prisma.superPdpConnection.updateMany({
    where: { id: CONNECTION_ID },
    data: {
      ...(info.verificationStatus ? { verificationStatus: info.verificationStatus } : {}),
      ...(info.companyName ? { companyName: info.companyName, companyNumber: info.companyNumber } : {}),
    },
  });
}

export async function getOAuthConnection() {
  if (!oauthAvailable()) return null;
  return prisma.superPdpConnection.findUnique({
    where: { id: CONNECTION_ID },
    select: { companyName: true, companyNumber: true, verificationStatus: true, connectedAt: true },
  });
}

/** Déconnexion : l'autorisation est révoquée chez Super PDP (RFC 7009) puis oubliée. */
export async function disconnect(): Promise<boolean> {
  const row = await prisma.superPdpConnection.findUnique({ where: { id: CONNECTION_ID } });
  if (!row) return false;
  try {
    await fetch(apiUrl("/oauth2/revoke"), {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        token: decryptToken(row.refreshTokenEnc),
        token_type_hint: "refresh_token",
        client_id: env.SUPERPDP_OAUTH_CLIENT_ID?.trim() ?? "",
        client_secret: env.SUPERPDP_OAUTH_CLIENT_SECRET?.trim() ?? "",
      }),
    });
  } catch (err) {
    // Révocation impossible (réseau) : on oublie quand même le jeton ici.
    logger.warn({ err }, "Super PDP : révocation impossible");
  }
  await prisma.superPdpConnection.deleteMany({ where: { id: CONNECTION_ID } });
  return true;
}
