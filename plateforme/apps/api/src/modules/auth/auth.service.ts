import { newPasswordSchema, passwordProblems, type AuthResponseDto, type LoginInput, type SessionUserDto } from "@aussitot/shared";
import { env } from "../../config/env.ts";
import { findOrgBySlug, findSessionOrg, uuidv7, withTenant } from "../../lib/db.ts";
import { AppError } from "../../lib/errors.ts";
import { hashPassword, verifyDecoy, verifyPassword } from "../../lib/auth/password.ts";
import { generateRefreshToken, hashRefreshToken, signAccessToken } from "../../lib/auth/tokens.ts";
import { logActivity } from "../../lib/audit.ts";
import { forgetCachedSessions, revokeCachedSessions } from "../../lib/sessionCache.ts";
import { getOrgBasics } from "../../lib/orgCache.ts";
import type { Ctx } from "../../lib/context.ts";
import type { User } from "../../generated/prisma/client.ts";

interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

export interface AuthResult extends AuthResponseDto {
  refreshToken: string;
}

// Message volontairement identique dans tous les cas d'échec : on ne révèle
// jamais si c'est l'entreprise, l'identifiant ou le mot de passe qui est faux.
const INVALID_CREDENTIALS = "Identifiants incorrects. Pour tout problème de connexion ou de compte, contactez la RH.";
const ACCOUNT_DISABLED = "Ce compte est désactivé. Pour tout problème de connexion ou de compte, contactez la RH.";
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
/** Tolérance quand l'app envoie deux renouvellements simultanés avec le même jeton. */
const REFRESH_RACE_GRACE_MS = 30_000;

function sessionExpiry(rememberMe: boolean): Date {
  const ms = rememberMe ? env.REMEMBER_ME_TTL_DAYS * 86_400_000 : env.SESSION_TTL_HOURS * 3_600_000;
  return new Date(Date.now() + ms);
}

async function toSessionUser(user: Pick<User, "id" | "username" | "firstName" | "lastName" | "email" | "role" | "mustChangePassword" | "organizationId">): Promise<SessionUserDto> {
  const org = await getOrgBasics(user.organizationId);
  return {
    id: user.id,
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
    organization: { id: org.id, slug: org.slug, name: org.name, timezone: org.timezone, hasLogo: org.hasLogo, brandColor: org.brandColor },
  };
}

export async function login(input: Required<Pick<LoginInput, "organization" | "identifier" | "password">> & { rememberMe: boolean }, meta: RequestMeta): Promise<AuthResult> {
  const org = await findOrgBySlug(input.organization);
  if (!org) {
    await verifyDecoy(input.password);
    throw AppError.unauthorized(INVALID_CREDENTIALS, "INVALID_CREDENTIALS");
  }

  const identifier = input.identifier.trim().toLowerCase();
  const user = await withTenant(org.id, (tx) =>
    tx.user.findFirst({ where: { OR: [{ username: identifier }, { email: identifier }] } }),
  );
  if (!user) {
    await verifyDecoy(input.password);
    throw AppError.unauthorized(INVALID_CREDENTIALS, "INVALID_CREDENTIALS");
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const minutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000);
    throw AppError.tooManyRequests(
      `Compte bloqué temporairement après plusieurs échecs. Réessayez dans ${minutes} minute${minutes > 1 ? "s" : ""}, ou contactez la RH.`,
    );
  }

  // Le hachage se vérifie hors transaction : aucune connexion à la base n'est
  // monopolisée pendant le calcul.
  const valid = await verifyPassword(user.passwordHash, input.password);

  if (!valid) {
    await withTenant(org.id, async (tx) => {
      const failed = user.failedLoginCount + 1;
      const lock = failed >= MAX_FAILED_ATTEMPTS;
      await tx.user.update({
        where: { id: user.id },
        data: { failedLoginCount: lock ? 0 : failed, lockedUntil: lock ? new Date(Date.now() + LOCK_MINUTES * 60_000) : undefined },
      });
      await logActivity(tx, { userId: user.id, ip: meta.ip }, lock ? "AUTH_LOCKED" : "AUTH_LOGIN_FAILED", { type: "user", id: user.id });
    });
    throw AppError.unauthorized(INVALID_CREDENTIALS, "INVALID_CREDENTIALS");
  }

  if (!user.isActive) throw AppError.forbidden(ACCOUNT_DISABLED);
  if (org.status !== "ACTIVE") throw AppError.forbidden("L'accès de votre entreprise est suspendu. Contactez le support.");

  const { token: refreshToken, hash } = generateRefreshToken();
  const session = await withTenant(org.id, async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() } });
    const created = await tx.session.create({
      data: {
        organizationId: org.id,
        userId: user.id,
        refreshTokenHash: hash,
        family: uuidv7(),
        rememberMe: input.rememberMe,
        userAgent: meta.userAgent?.slice(0, 300),
        ipAddress: meta.ip,
        expiresAt: sessionExpiry(input.rememberMe),
      },
    });
    await logActivity(tx, { userId: user.id, ip: meta.ip }, "AUTH_LOGIN", { type: "user", id: user.id });
    return created;
  });

  const accessToken = await signAccessToken({ userId: user.id, orgId: org.id, role: user.role, sessionId: session.id });
  return { accessToken, refreshToken, expiresIn: env.ACCESS_TOKEN_TTL_SECONDS, user: await toSessionUser(user) };
}

export async function refresh(refreshToken: string, meta: RequestMeta): Promise<AuthResult> {
  const hash = hashRefreshToken(refreshToken);
  const orgId = await findSessionOrg(hash);
  if (!orgId) throw AppError.unauthorized();

  type Outcome =
    | { kind: "ok"; result: AuthResult }
    | { kind: "race" }
    | { kind: "reuse"; revokedIds: string[] }
    | { kind: "invalid" }
    | { kind: "disabled" };

  const outcome: Outcome = await withTenant(orgId, async (tx): Promise<Outcome> => {
    const session = await tx.session.findUnique({ where: { refreshTokenHash: hash }, include: { user: true } });
    if (!session) return { kind: "invalid" };
    const now = new Date();

    if (session.revokedAt) {
      if (!session.replacedById) return { kind: "invalid" }; // déconnexion normale
      if (now.getTime() - session.revokedAt.getTime() < REFRESH_RACE_GRACE_MS) return { kind: "race" };
      // Jeton déjà renouvelé puis rejoué bien plus tard : vol probable.
      const family = await tx.session.findMany({ where: { family: session.family, revokedAt: null }, select: { id: true } });
      await tx.session.updateMany({ where: { family: session.family, revokedAt: null }, data: { revokedAt: now } });
      await logActivity(tx, { userId: session.userId, ip: meta.ip }, "AUTH_REFRESH_REUSE", { type: "user", id: session.userId });
      return { kind: "reuse", revokedIds: family.map((s) => s.id) };
    }
    if (session.expiresAt <= now) return { kind: "invalid" };
    if (!session.user.isActive) return { kind: "disabled" };

    const next = generateRefreshToken();
    const created = await tx.session.create({
      data: {
        organizationId: orgId,
        userId: session.userId,
        refreshTokenHash: next.hash,
        family: session.family,
        rememberMe: session.rememberMe,
        userAgent: meta.userAgent?.slice(0, 300) ?? session.userAgent,
        ipAddress: meta.ip ?? session.ipAddress,
        // « Rester connecté » : expiration glissante. Sinon : durée fixe depuis la connexion.
        expiresAt: session.rememberMe ? sessionExpiry(true) : session.expiresAt,
      },
    });
    await tx.session.update({ where: { id: session.id }, data: { revokedAt: now, replacedById: created.id, lastUsedAt: now } });
    const accessToken = await signAccessToken({ userId: session.userId, orgId, role: session.user.role, sessionId: created.id });
    return {
      kind: "ok",
      result: { accessToken, refreshToken: next.token, expiresIn: env.ACCESS_TOKEN_TTL_SECONDS, user: await toSessionUser(session.user) },
    };
  });

  switch (outcome.kind) {
    case "ok": {
      const org = await getOrgBasics(orgId);
      if (org.status !== "ACTIVE") throw AppError.forbidden("L'accès de votre entreprise est suspendu. Contactez le support.");
      return outcome.result;
    }
    case "race":
      throw AppError.unauthorized("Session déjà renouvelée.", "REFRESH_RACE");
    case "reuse":
      await revokeCachedSessions(outcome.revokedIds);
      throw AppError.unauthorized("Par sécurité, votre session a été fermée. Merci de vous reconnecter.", "SESSION_REVOKED");
    case "disabled":
      throw AppError.forbidden(ACCOUNT_DISABLED);
    default:
      throw AppError.unauthorized();
  }
}

/** Déconnexion : la session est révoquée côté serveur (pas seulement oubliée par l'app). */
export async function logout(ctx: Ctx): Promise<void> {
  await withTenant(ctx.orgId, async (tx) => {
    await tx.session.updateMany({ where: { id: ctx.sessionId, revokedAt: null }, data: { revokedAt: new Date() } });
    await logActivity(tx, ctx, "AUTH_LOGOUT", { type: "user", id: ctx.userId });
  });
  await revokeCachedSessions([ctx.sessionId]);
}

export async function changeOwnPassword(ctx: Ctx, currentPassword: string, newPassword: string): Promise<void> {
  const user = await withTenant(ctx.orgId, (tx) => tx.user.findUnique({ where: { id: ctx.userId } }));
  if (!user) throw AppError.unauthorized();

  if (!(await verifyPassword(user.passwordHash, currentPassword))) {
    throw AppError.validation({ currentPassword: ["Mot de passe actuel incorrect."] });
  }
  const parsed = newPasswordSchema.safeParse(newPassword);
  const problems = parsed.success ? passwordProblems(newPassword, [user.username, user.firstName, user.lastName]) : parsed.error.issues.map((i) => i.message);
  if (problems.length) throw AppError.validation({ newPassword: problems });
  if (await verifyPassword(user.passwordHash, newPassword)) {
    throw AppError.validation({ newPassword: ["Le nouveau mot de passe doit être différent de l'actuel."] });
  }

  const passwordHash = await hashPassword(newPassword);
  const revoked = await withTenant(ctx.orgId, async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { passwordHash, mustChangePassword: false, passwordChangedAt: new Date() } });
    // Toutes les AUTRES sessions sont fermées : un éventuel accès volé est coupé.
    const others = await tx.session.findMany({ where: { userId: user.id, revokedAt: null, id: { not: ctx.sessionId } }, select: { id: true } });
    await tx.session.updateMany({ where: { id: { in: others.map((s) => s.id) } }, data: { revokedAt: new Date() } });
    await logActivity(tx, ctx, "AUTH_PASSWORD_CHANGED", { type: "user", id: user.id });
    return others.map((s) => s.id);
  });
  await revokeCachedSessions(revoked);
  await forgetCachedSessions([ctx.sessionId]);
}

export async function currentUser(ctx: Ctx): Promise<SessionUserDto> {
  const user = await withTenant(ctx.orgId, (tx) => tx.user.findUnique({ where: { id: ctx.userId } }));
  if (!user || !user.isActive) throw AppError.unauthorized();
  return toSessionUser(user);
}
