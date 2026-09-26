import { PrismaClient, Role } from "@prisma/client";
import { hashPassword } from "../src/utils/password";
import { generateUsername } from "../src/utils/username";
import { env } from "../src/config/env";

const prisma = new PrismaClient();

/**
 * Crée le compte administrateur technique initial si aucun n'existe encore.
 * C'est le seul compte autorisé à démarrer sans passer par la RH, puisqu'il
 * sert justement à créer le premier compte RH depuis l'application.
 */
async function main() {
  if (!env.BOOTSTRAP_ADMIN_EMAIL || !env.BOOTSTRAP_ADMIN_PASSWORD) {
    console.log("BOOTSTRAP_ADMIN_EMAIL / BOOTSTRAP_ADMIN_PASSWORD non définis, seed ignoré.");
    return;
  }

  const existingAdmin = await prisma.user.findFirst({ where: { role: Role.ADMIN } });
  if (existingAdmin) {
    console.log("Un compte administrateur existe déjà, seed ignoré.");
    return;
  }

  const passwordHash = await hashPassword(env.BOOTSTRAP_ADMIN_PASSWORD);
  const username = await generateUsername("Admin", "Technique");

  await prisma.user.create({
    data: {
      username,
      email: env.BOOTSTRAP_ADMIN_EMAIL,
      firstName: "Admin",
      lastName: "Technique",
      role: Role.ADMIN,
      passwordHash,
      mustChangePassword: true,
      isActive: true,
    },
  });

  console.log(`Compte administrateur créé : identifiant "${username}"`);
  console.log("Changez ce mot de passe dès la première connexion.");
}

main()
  .catch((err) => {
    console.error("Échec du seed :", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
