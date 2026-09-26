import crypto from "node:crypto";
import jwt, { JwtPayload } from "jsonwebtoken";
import { env } from "../config/env";
import { Role } from "@prisma/client";

export interface AccessTokenPayload extends JwtPayload {
  sub: string; // user id
  role: Role;
  sessionId: string;
}

export function signAccessToken(payload: { userId: string; role: Role; sessionId: string }): string {
  return jwt.sign(
    { sub: payload.userId, role: payload.role, sessionId: payload.sessionId },
    env.JWT_ACCESS_SECRET,
    { expiresIn: env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions["expiresIn"] }
  );
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
}

// Le refresh token brut n'est renvoyé qu'une seule fois au client (mobile, stockage sécurisé).
// Seul son hash SHA-256 est conservé en base, comme pour un mot de passe.
export function generateRefreshToken(): { token: string; hash: string } {
  const token = crypto.randomBytes(64).toString("hex");
  const hash = hashRefreshToken(token);
  return { token, hash };
}

export function hashRefreshToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function refreshTokenExpiryDate(rememberMe: boolean): Date {
  const days = rememberMe
    ? env.JWT_REFRESH_EXPIRES_IN_DAYS_REMEMBER_ME
    : env.JWT_REFRESH_EXPIRES_IN_DAYS;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}
