import { PrismaClient, Role } from "@prisma/client";
import { hashPassword } from "../src/utils/password";
import { generateUsername } from "../src/utils/username";
import { env } from "../src/config/env";

const prisma = new PrismaClient();

// Garde-fou ajouté (audit secrets/sécurité) : ce script crée un compte avec
// un mot de passe fixe et public. Voir seedDemo.ts/seedDemoExtras.ts pour le
// détail du risque en cas d'exécution accidentelle contre la production.
function assertNotProduction(): void {
  if (env.isProduction) {
    throw new Error(
      "Ce script de démo ne doit jamais être exécuté en production (NODE_ENV=production) : il crée un compte avec un mot de passe fixe et public."
    );
  }
}

async function main() {
  assertNotProduction();

  const rh = await prisma.user.findUniqueOrThrow({ where: { email: "rh@deepclean.fr" } });
  const passwordHash = await hashPassword("Clean2026!");
  // `username` est requis et unique (voir prisma/schema.prisma) — jamais
  // l'email, voir seedDemo.ts::upsertUser pour le même correctif.
  const username = await generateUsername("Farid", "Haddad");
  const supervisor = await prisma.user.upsert({
    where: { email: "superviseur@deepclean.fr" },
    update: {},
    create: {
      username,
      email: "superviseur@deepclean.fr",
      firstName: "Farid",
      lastName: "Haddad",
      role: Role.SUPERVISOR,
      passwordHash,
      mustChangePassword: false,
      isActive: true,
      createdById: rh.id,
    },
  });
  console.log(`Superviseur créé : ${supervisor.username}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
