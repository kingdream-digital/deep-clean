import { PrismaClient, NotificationType } from "@prisma/client";
import { hashPassword } from "../src/utils/password";
import { env } from "../src/config/env";

const prisma = new PrismaClient();

const SIMPLE_PASSWORD = "Clean2026!";

// Garde-fou ajouté (audit secrets/sécurité) : ce script ÉCRASE le mot de
// passe de comptes existants par une valeur fixe et publique — dont
// "rh@deepclean.fr", exactement l'adresse du vrai compte RH de production.
// Lancé par erreur contre DATABASE_URL de production, il écraserait
// silencieusement le vrai mot de passe RH par un mot de passe connu de tous.
function assertNotProduction(): void {
  if (env.isProduction) {
    throw new Error(
      "Ce script de démo ne doit jamais être exécuté en production (NODE_ENV=production) : il écrase le mot de passe de comptes existants par une valeur fixe et publique."
    );
  }
}

const DEMO_EMAILS = [
  "rh@deepclean.fr",
  "directeur@deepclean.fr",
  "karim.chef@deepclean.fr",
  "sophie.chef@deepclean.fr",
  "lucas.employe@deepclean.fr",
  "emma.employe@deepclean.fr",
  "nathan.employe@deepclean.fr",
  "chloe.employe@deepclean.fr",
];

async function main() {
  assertNotProduction();

  const passwordHash = await hashPassword(SIMPLE_PASSWORD);
  const { count } = await prisma.user.updateMany({
    where: { email: { in: DEMO_EMAILS } },
    data: { passwordHash, mustChangePassword: false },
  });
  console.log(`Mot de passe simplifié appliqué à ${count} comptes démo : ${SIMPLE_PASSWORD}`);

  const lucas = await prisma.user.findUniqueOrThrow({ where: { email: "lucas.employe@deepclean.fr" } });
  const karim = await prisma.user.findUniqueOrThrow({ where: { email: "karim.chef@deepclean.fr" } });
  const sophie = await prisma.user.findUniqueOrThrow({ where: { email: "sophie.chef@deepclean.fr" } });

  const tilleulsMission = await prisma.mission.findFirst({
    where: { site: { name: "Résidence Les Tilleuls" }, status: "SCHEDULED" },
    orderBy: { date: "asc" },
  });
  const techcorpMission = await prisma.mission.findFirst({
    where: { site: { name: "Bureaux TechCorp" }, status: "SCHEDULED" },
    orderBy: { date: "asc" },
  });

  const notifications = [
    {
      userId: lucas.id,
      type: NotificationType.MISSION_ASSIGNED,
      title: "Nouvelle mission",
      body: "Une nouvelle mission vous a été attribuée : Nettoyage parties communes.",
      relatedEntityType: "mission",
      relatedEntityId: tilleulsMission?.id,
      isRead: false,
    },
    {
      userId: lucas.id,
      type: NotificationType.MISSION_INSTRUCTION_ADDED,
      title: "Nouvelle consigne",
      body: "Une nouvelle consigne a été ajoutée à votre mission : attention au sol glissant après lavage.",
      relatedEntityType: "mission",
      relatedEntityId: tilleulsMission?.id,
      isRead: true,
    },
    {
      userId: karim.id,
      type: NotificationType.VALIDATION_REQUESTED,
      title: "Validation en attente",
      body: "La mission « Désinfection salles de consultation » est terminée et attend votre validation.",
      relatedEntityType: "mission",
      relatedEntityId: null,
      isRead: false,
    },
    {
      userId: sophie.id,
      type: NotificationType.MISSION_TIME_CHANGED,
      title: "Horaire modifié",
      body: "L'horaire de votre mission « Grand nettoyage open space » a été modifié.",
      relatedEntityType: "mission",
      relatedEntityId: techcorpMission?.id,
      isRead: false,
    },
  ];

  for (const n of notifications) {
    await prisma.notification.create({ data: n });
  }
  console.log(`${notifications.length} notifications démo créées.`);
}

main()
  .catch((err) => {
    console.error("Échec du seed extras :", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
