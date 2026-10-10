import {
  assignableRoles,
  canManageAccount,
  type CreatedUserDto,
  type CreateUserInput,
  type Role,
  type UpdateUserInput,
  type UserDto,
} from "@aussitot/shared";
import { createUserSchema, updateUserSchema } from "@aussitot/shared";
import type { Db } from "../../lib/db.ts";
import { iso, withTenant } from "../../lib/db.ts";
import { AppError, assertFound } from "../../lib/errors.ts";
import { requirePermission, type Ctx } from "../../lib/context.ts";
import { logActivity } from "../../lib/audit.ts";
import { baseUsername, generateTemporaryPassword, hashPassword } from "../../lib/auth/password.ts";
import { forgetCachedSessions, revokeCachedSessions } from "../../lib/sessionCache.ts";
import { getOrgBasics } from "../../lib/orgCache.ts";
import { parse } from "../../lib/validate.ts";
import type { User } from "../../generated/prisma/client.ts";

export function toUserDto(user: User): UserDto {
  return {
    id: user.id,
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    phone: user.phone,
    jobTitle: user.jobTitle,
    role: user.role,
    isActive: user.isActive,
    mustChangePassword: user.mustChangePassword,
    weeklyHours: user.weeklyHours,
    lastLoginAt: iso(user.lastLoginAt),
    createdAt: user.createdAt.toISOString(),
  };
}

async function uniqueUsername(tx: Db, firstName: string, lastName: string): Promise<string> {
  const base = baseUsername(firstName, lastName);
  const taken = new Set(
    (await tx.user.findMany({ where: { username: { startsWith: base } }, select: { username: true } })).map((u) => u.username),
  );
  if (!taken.has(base)) return base;
  for (let i = 2; i < 1000; i += 1) if (!taken.has(`${base}${i}`)) return `${base}${i}`;
  throw AppError.conflict("Impossible de générer un identifiant unique.");
}

async function assertSeatAvailable(tx: Db, orgId: string): Promise<void> {
  const org = await getOrgBasics(orgId);
  const active = await tx.user.count({ where: { isActive: true } });
  if (active >= org.seatLimit) {
    throw AppError.conflict(
      `Votre abonnement inclut ${org.seatLimit} comptes actifs. Désactivez un compte ou passez à l'offre supérieure.`,
      "SEAT_LIMIT",
    );
  }
}

async function loadManageable(tx: Db, ctx: Ctx, id: string): Promise<User> {
  const target = assertFound(await tx.user.findUnique({ where: { id } }), "Compte introuvable.");
  if (target.id !== ctx.userId && !canManageAccount(ctx.role, target.role)) {
    throw AppError.forbidden("Vous ne pouvez pas modifier un compte de ce niveau.");
  }
  return target;
}

function assertAssignable(actor: Role, role: Role): void {
  if (!assignableRoles(actor).includes(role)) throw AppError.forbidden("Vous ne pouvez pas attribuer ce rôle.");
}

export async function listUsers(ctx: Ctx, query: { q?: string; includeInactive?: boolean }): Promise<UserDto[]> {
  requirePermission(ctx, "users.read");
  const q = query.q?.trim();
  return withTenant(ctx.orgId, async (tx) => {
    const users = await tx.user.findMany({
      where: {
        isActive: query.includeInactive ? undefined : true,
        OR: q
          ? [
              { firstName: { contains: q, mode: "insensitive" } },
              { lastName: { contains: q, mode: "insensitive" } },
              { username: { contains: q.toLowerCase() } },
            ]
          : undefined,
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take: 500,
    });
    return users.map(toUserDto);
  });
}

export async function getUser(ctx: Ctx, id: string): Promise<UserDto> {
  if (id !== ctx.userId) requirePermission(ctx, "users.read");
  return withTenant(ctx.orgId, async (tx) => toUserDto(assertFound(await tx.user.findUnique({ where: { id } }), "Compte introuvable.")));
}

/** Seule la RH (ou l'administrateur du compte) crée des comptes. Aucune inscription publique. */
export async function createUser(ctx: Ctx, raw: CreateUserInput): Promise<CreatedUserDto> {
  requirePermission(ctx, "users.create");
  const input = parse(createUserSchema, raw);
  assertAssignable(ctx.role, input.role);
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);

  const user = await withTenant(ctx.orgId, async (tx) => {
    await assertSeatAvailable(tx, ctx.orgId);
    if (input.email && (await tx.user.findFirst({ where: { email: input.email } }))) {
      throw AppError.validation({ email: ["Cette adresse email est déjà utilisée par un autre compte."] });
    }
    const created = await tx.user.create({
      data: {
        username: await uniqueUsername(tx, input.firstName, input.lastName),
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email ?? null,
        phone: input.phone ?? null,
        jobTitle: input.jobTitle ?? null,
        weeklyHours: input.weeklyHours ?? null,
        role: input.role,
        passwordHash,
        mustChangePassword: true,
        createdById: ctx.userId,
      },
    });
    await logActivity(tx, ctx, "USER_CREATED", { type: "user", id: created.id }, { role: created.role });
    return created;
  });
  return { user: toUserDto(user), temporaryPassword };
}

export async function updateUser(ctx: Ctx, id: string, raw: UpdateUserInput): Promise<UserDto> {
  requirePermission(ctx, "users.update");
  const input = parse(updateUserSchema, raw);
  const { user, roleChanged, sessionIds } = await withTenant(ctx.orgId, async (tx) => {
    const target = await loadManageable(tx, ctx, id);
    if (input.role && input.role !== target.role) {
      if (target.id === ctx.userId) throw AppError.forbidden("Vous ne pouvez pas modifier votre propre rôle.");
      assertAssignable(ctx.role, input.role);
    }
    if (input.email && input.email !== target.email && (await tx.user.findFirst({ where: { email: input.email, id: { not: id } } }))) {
      throw AppError.validation({ email: ["Cette adresse email est déjà utilisée par un autre compte."] });
    }
    const updated = await tx.user.update({
      where: { id },
      data: {
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        phone: input.phone,
        jobTitle: input.jobTitle,
        weeklyHours: input.weeklyHours,
        role: input.role,
      },
    });
    await logActivity(tx, ctx, "USER_UPDATED", { type: "user", id }, { fields: Object.keys(input) });
    const sessions = await tx.session.findMany({ where: { userId: id, revokedAt: null }, select: { id: true } });
    return { user: updated, roleChanged: Boolean(input.role && input.role !== target.role), sessionIds: sessions.map((s) => s.id) };
  });
  // Rôle modifié : les jetons en cours sont revérifiés et l'app en obtient un nouveau.
  if (roleChanged) await forgetCachedSessions(sessionIds);
  return toUserDto(user);
}

export async function setUserActive(ctx: Ctx, id: string, active: boolean): Promise<UserDto> {
  requirePermission(ctx, "users.deactivate");
  if (id === ctx.userId) throw AppError.forbidden("Vous ne pouvez pas désactiver votre propre compte.");
  const { user, revoked } = await withTenant(ctx.orgId, async (tx) => {
    await loadManageable(tx, ctx, id);
    if (active) await assertSeatAvailable(tx, ctx.orgId);
    const updated = await tx.user.update({ where: { id }, data: { isActive: active, failedLoginCount: 0, lockedUntil: null } });
    let revokedIds: string[] = [];
    if (!active) {
      // Désactivation : toutes les sessions sont fermées immédiatement.
      const sessions = await tx.session.findMany({ where: { userId: id, revokedAt: null }, select: { id: true } });
      revokedIds = sessions.map((s) => s.id);
      await tx.session.updateMany({ where: { id: { in: revokedIds } }, data: { revokedAt: new Date() } });
    }
    await logActivity(tx, ctx, active ? "USER_REACTIVATED" : "USER_DEACTIVATED", { type: "user", id });
    return { user: updated, revoked: revokedIds };
  });
  await revokeCachedSessions(revoked);
  return toUserDto(user);
}

/** Réinitialise l'accès sans jamais connaître ni afficher l'ancien mot de passe. */
export async function resetUserAccess(ctx: Ctx, id: string): Promise<CreatedUserDto> {
  requirePermission(ctx, "users.resetAccess");
  if (id === ctx.userId) throw AppError.forbidden("Pour votre propre compte, utilisez « Modifier mon mot de passe ».");
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);
  const { user, revoked } = await withTenant(ctx.orgId, async (tx) => {
    await loadManageable(tx, ctx, id);
    const updated = await tx.user.update({
      where: { id },
      data: { passwordHash, mustChangePassword: true, failedLoginCount: 0, lockedUntil: null },
    });
    const sessions = await tx.session.findMany({ where: { userId: id, revokedAt: null }, select: { id: true } });
    await tx.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    await logActivity(tx, ctx, "USER_ACCESS_RESET", { type: "user", id });
    return { user: updated, revoked: sessions.map((s) => s.id) };
  });
  await revokeCachedSessions(revoked);
  return { user: toUserDto(user), temporaryPassword };
}

/** Annuaire minimal pour l'affectation des missions (prénom, nom, rôle). */
export async function listAssignableStaff(ctx: Ctx): Promise<{ id: string; firstName: string; lastName: string; role: Role }[]> {
  requirePermission(ctx, "planning.manage");
  return withTenant(ctx.orgId, (tx) =>
    tx.user.findMany({
      where: { isActive: true },
      select: { id: true, firstName: true, lastName: true, role: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
  );
}
