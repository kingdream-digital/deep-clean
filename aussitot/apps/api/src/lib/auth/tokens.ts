import { createHash, randomBytes } from "node:crypto";
import { SignJWT, jwtVerify, errors as joseErrors } from "jose";
import { isRole, type Role } from "@aussitot/shared";
import { env } from "../../config/env.ts";
import { AppError } from "../errors.ts";

const key = new TextEncoder().encode(env.JWT_SECRET);
const ISSUER = "aussitot";
const AUDIENCE = "aussitot-app";

export interface AccessClaims {
  userId: string;
  orgId: string;
  role: Role;
  sessionId: string;
}

/** Jeton d'accès court (10 min par défaut), vérifiable sans base de données. */
export async function signAccessToken(claims: AccessClaims): Promise<string> {
  return new SignJWT({ org: claims.orgId, role: claims.role, sid: claims.sessionId })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(claims.userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${env.ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(key);
}

export async function verifyAccessToken(token: string): Promise<AccessClaims> {
  try {
    const { payload } = await jwtVerify(token, key, { issuer: ISSUER, audience: AUDIENCE, algorithms: ["HS256"] });
    const { sub, org, role, sid } = payload as { sub?: string; org?: unknown; role?: unknown; sid?: unknown };
    if (!sub || typeof org !== "string" || typeof sid !== "string" || !isRole(role)) {
      throw AppError.unauthorized();
    }
    return { userId: sub, orgId: org, role, sessionId: sid };
  } catch (err) {
    if (err instanceof AppError) throw err;
    if (err instanceof joseErrors.JWTExpired) throw AppError.unauthorized("Session expirée.", "TOKEN_EXPIRED");
    throw AppError.unauthorized();
  }
}

/** Jeton de renouvellement : 256 bits aléatoires, seule son empreinte est stockée. */
export function generateRefreshToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashRefreshToken(token) };
}

export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
