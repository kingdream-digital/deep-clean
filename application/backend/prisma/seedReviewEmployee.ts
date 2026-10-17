/**
 * Prépare à la main le compte employé de démo (Lucas Petit, `lpetit`) pour la
 * vérification Apple / Google — le backend le fait déjà seul au démarrage et
 * chaque nuit (src/jobs/reviewDemoAccount.ts). Sur le serveur :
 *   npx tsx prisma/seedReviewEmployee.ts
 */
import { PrismaClient } from "@prisma/client";
import { prepareReviewDemoAccount } from "../src/jobs/reviewDemoAccount";

const prisma = new PrismaClient();

prepareReviewDemoAccount(prisma)
  .then((result) => {
    if (!result) {
      console.log("Compte de démo de Lucas Petit introuvable : rien à faire.");
      return;
    }
    console.log(`Pointage(s) ouvert(s) supprimé(s) : ${result.staleEntriesRemoved}.`);
    console.log(`Mission(s) passée(s) « en cours » clôturée(s) : ${result.staleMissionsClosed}.`);
    console.log(`Missions créées pour Lucas (aujourd'hui à J+14) : ${result.missionsCreated}.`);
  })
  .catch((err) => {
    console.error("Échec de la préparation du compte employé :", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
