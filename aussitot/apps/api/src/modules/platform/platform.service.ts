import { z } from "zod";
import type { CreatedUserDto, OrganizationDto } from "@aussitot/shared";
import { isSlugAvailable, uuidv7, withTenant } from "../../lib/db.ts";
import { AppError } from "../../lib/errors.ts";
import { parse } from "../../lib/validate.ts";
import { logActivity } from "../../lib/audit.ts";
import { baseUsername, generateTemporaryPassword, hashPassword } from "../../lib/auth/password.ts";
import { toOrganizationDto } from "../organization/organization.service.ts";
import { toUserDto } from "../users/users.service.ts";

/**
 * Ouverture d'un compte entreprise par l'OPÉRATEUR de la plateforme (pas
 * d'inscription publique : règle Deep Clean conservée). Crée l'entreprise et
 * son administrateur, qui recevra un mot de passe temporaire à changer à la
 * première connexion, puis créera lui-même les comptes de son équipe.
 */
export const createOrganizationSchema = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/, "Code entreprise : lettres minuscules, chiffres et tirets (40 max)."),
  name: z.string().trim().min(2).max(120),
  plan: z.enum(["STARTER", "PRO", "BUSINESS"]).default("PRO"),
  seatLimit: z.number().int().min(1).max(5000).default(25),
  assistantMonthlyQuota: z.number().int().min(0).max(1_000_000).default(3000),
  timezone: z.string().default("Europe/Paris"),
  admin: z.object({
    firstName: z.string().trim().min(1).max(60),
    lastName: z.string().trim().min(1).max(60),
    email: z.email().optional(),
  }),
});

export type CreateOrganizationInput = z.input<typeof createOrganizationSchema>;

export async function createOrganization(raw: CreateOrganizationInput): Promise<{ organization: OrganizationDto; admin: CreatedUserDto }> {
  const input = parse(createOrganizationSchema, raw);
  if (!(await isSlugAvailable(input.slug))) throw AppError.conflict("Ce code entreprise est déjà utilisé.", "SLUG_TAKEN");

  const orgId = uuidv7();
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);

  // La transaction est rattachée à la NOUVELLE entreprise : les politiques RLS
  // autorisent la création de sa ligne et de son premier compte, rien d'autre.
  const { organization, admin } = await withTenant(orgId, async (tx) => {
    const organization = await tx.organization.create({
      data: {
        id: orgId,
        slug: input.slug,
        name: input.name,
        plan: input.plan,
        seatLimit: input.seatLimit,
        assistantMonthlyQuota: input.assistantMonthlyQuota,
        timezone: input.timezone,
      },
    });
    const admin = await tx.user.create({
      data: {
        username: baseUsername(input.admin.firstName, input.admin.lastName),
        firstName: input.admin.firstName,
        lastName: input.admin.lastName,
        email: input.admin.email?.toLowerCase() ?? null,
        role: "ADMIN",
        passwordHash,
        mustChangePassword: true,
      },
    });
    await logActivity(tx, { userId: null }, "USER_CREATED", { type: "user", id: admin.id }, { role: "ADMIN", by: "platform" });
    return { organization, admin };
  });

  return { organization: toOrganizationDto(organization), admin: { user: toUserDto(admin), temporaryPassword } };
}
