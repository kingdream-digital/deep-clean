import { Role } from "@prisma/client";
import { prisma } from "../src/db/prisma";
import { hashPassword } from "../src/utils/password";

export const TEST_PASSWORD = "CorrectHorse9!Battery";

export async function resetDatabase() {
  // Ordre inverse des dépendances pour respecter les contraintes de clé étrangère.
  await prisma.activityLog.deleteMany();
  await prisma.timeEntry.deleteMany();
  await prisma.validation.deleteMany();
  await prisma.photo.deleteMany();
  await prisma.problemComment.deleteMany();
  await prisma.problem.deleteMany();
  await prisma.missionAssignment.deleteMany();
  await prisma.mission.deleteMany();
  await prisma.cleaningStandard.deleteMany();
  await prisma.siteMember.deleteMany();
  await prisma.site.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.message.deleteMany();
  await prisma.pushToken.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
}

export async function createTestUser(
  overrides: Partial<{ email: string; username: string; role: Role; isActive: boolean }> = {}
) {
  const passwordHash = await hashPassword(TEST_PASSWORD);
  return prisma.user.create({
    data: {
      // Identifiant de connexion — jamais dérivé de l'email dans les tests non
      // plus (même règle que la production, voir utils/username.ts) : un
      // suffixe aléatoire suffit ici, la lisibilité du nom vient de `email`
      // (toujours passé explicitement par les tests pour identifier un compte).
      username: overrides.username ?? `testuser${Date.now()}${Math.floor(Math.random() * 1_000_000)}`,
      email: overrides.email ?? `user-${Date.now()}-${Math.random().toString(36).slice(2)}@deepclean.test`,
      firstName: "Test",
      lastName: "User",
      role: overrides.role ?? Role.EMPLOYEE,
      isActive: overrides.isActive ?? true,
      mustChangePassword: false,
      passwordHash,
    },
  });
}

export async function createTestSite(overrides: Partial<{ name: string; managerId: string | null }> = {}) {
  return prisma.site.create({
    data: {
      name: overrides.name ?? `Chantier ${Date.now()}-${Math.random().toString(36).slice(2)}`,
      address: "1 rue de Test, 75000 Paris",
      managerId: overrides.managerId ?? null,
    },
  });
}
