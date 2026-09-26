import { prisma } from "../../db/prisma";
import { ApiError } from "../../utils/ApiError";
import { checkPasswordPolicy, hashPassword, verifyPassword } from "../../utils/password";
import {
  generateRefreshToken,
  hashRefreshToken,
  refreshTokenExpiryDate,
  signAccessToken,
} from "../../utils/tokens";
import { logActivity } from "../../utils/activityLog";

interface RequestContext {
  ipAddress?: string;
  userAgent?: string;
}

interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: PublicUser;
}

interface PublicUser {
  id: string;
  username: string;
  email: string | null;
  firstName: string;
  lastName: string;
  role: string;
  mustChangePassword: boolean;
  // Jamais avatarKey lui-même (voir users.service.ts::presentUser, même
  // convention) — juste de quoi savoir si users.api.ts::avatarUrl() a
  // quelque chose à afficher.
  hasAvatar: boolean;
}

function toPublicUser(user: {
  id: string;
  username: string;
  email: string | null;
  firstName: string;
  lastName: string;
  role: string;
  mustChangePassword: boolean;
  avatarKey?: string | null;
}): PublicUser {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
    hasAvatar: Boolean(user.avatarKey),
  };
}

// Message volontairement générique : ne jamais indiquer si c'est l'identifiant
// ou le mot de passe qui est incorrect (évite l'énumération de comptes).
const INVALID_CREDENTIALS_MESSAGE = "Identifiant ou mot de passe incorrect.";

export async function login(
  username: string,
  password: string,
  rememberMe: boolean,
  ctx: RequestContext
): Promise<AuthResult> {
  const user = await prisma.user.findUnique({ where: { username } });

  if (!user) {
    throw ApiError.unauthorized(INVALID_CREDENTIALS_MESSAGE);
  }

  const passwordValid = await verifyPassword(password, user.passwordHash);
  if (!passwordValid) {
    await logActivity({
      userId: user.id,
      action: "AUTH_LOGIN_FAILED",
      ipAddress: ctx.ipAddress,
    });
    throw ApiError.unauthorized(INVALID_CREDENTIALS_MESSAGE);
  }

  if (!user.isActive) {
    throw ApiError.forbidden(
      "Ce compte est désactivé. Pour tout problème de connexion ou de compte, contactez la RH."
    );
  }

  const { token: refreshToken, hash } = generateRefreshToken();
  const session = await prisma.session.create({
    data: {
      userId: user.id,
      refreshTokenHash: hash,
      userAgent: ctx.userAgent,
      ipAddress: ctx.ipAddress,
      rememberMe,
      expiresAt: refreshTokenExpiryDate(rememberMe),
    },
  });

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await logActivity({ userId: user.id, action: "AUTH_LOGIN_SUCCESS", ipAddress: ctx.ipAddress });

  const accessToken = signAccessToken({ userId: user.id, role: user.role, sessionId: session.id });

  return { accessToken, refreshToken, user: toPublicUser(user) };
}

export async function refresh(refreshToken: string, ctx: RequestContext): Promise<AuthResult> {
  const hash = hashRefreshToken(refreshToken);
  const session = await prisma.session.findUnique({ where: { refreshTokenHash: hash }, include: { user: true } });

  if (!session || session.revokedAt || session.expiresAt < new Date()) {
    throw ApiError.unauthorized("Session invalide ou expirée. Merci de vous reconnecter.");
  }
  if (!session.user.isActive) {
    throw ApiError.forbidden("Ce compte est désactivé. Contactez la RH.");
  }

  // Rotation du refresh token : l'ancien est révoqué, un nouveau est émis.
  // Limite l'impact d'un vol de refresh token.
  const { token: newRefreshToken, hash: newHash } = generateRefreshToken();

  const newSession = await prisma.$transaction(async (tx) => {
    await tx.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
    return tx.session.create({
      data: {
        userId: session.userId,
        refreshTokenHash: newHash,
        userAgent: ctx.userAgent ?? session.userAgent,
        ipAddress: ctx.ipAddress ?? session.ipAddress,
        rememberMe: session.rememberMe,
        expiresAt: refreshTokenExpiryDate(session.rememberMe),
      },
    });
  });

  const accessToken = signAccessToken({
    userId: session.user.id,
    role: session.user.role,
    sessionId: newSession.id,
  });

  return { accessToken, refreshToken: newRefreshToken, user: toPublicUser(session.user) };
}

export async function logout(refreshToken: string): Promise<void> {
  const hash = hashRefreshToken(refreshToken);
  await prisma.session.updateMany({
    where: { refreshTokenHash: hash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function changeOwnPassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  currentSessionId: string
): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw ApiError.unauthorized();
  }

  const currentValid = await verifyPassword(currentPassword, user.passwordHash);
  if (!currentValid) {
    throw ApiError.badRequest("Mot de passe actuel incorrect.");
  }

  const policy = checkPasswordPolicy(newPassword);
  if (!policy.valid) {
    throw ApiError.badRequest("Le nouveau mot de passe ne respecte pas la politique de sécurité.", policy.errors);
  }

  const newHash = await hashPassword(newPassword);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newHash, mustChangePassword: false },
    }),
    // Invalide toutes les autres sessions actives : un changement de mot de passe
    // doit déconnecter les éventuelles sessions compromises.
    prisma.session.updateMany({
      where: { userId, revokedAt: null, id: { not: currentSessionId } },
      data: { revokedAt: new Date() },
    }),
  ]);

  await logActivity({ userId, action: "AUTH_PASSWORD_CHANGED" });
}

export async function getCurrentUser(userId: string): Promise<PublicUser> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw ApiError.unauthorized();
  }
  return toPublicUser(user);
}
