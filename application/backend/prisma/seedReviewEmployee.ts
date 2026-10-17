/**
 * Prépare le compte employé de démo (Lucas Petit, `lpetit`) pour la
 * vérification Apple / Google : le vérificateur se connecte avec ce compte et
 * doit pouvoir pointer une arrivée puis une sortie sur une mission du jour.
 *
 * - supprime le pointage resté ouvert par la démo de présentation (« en
 *   poste » depuis des centaines d'heures, impossible à clore sans position) ;
 * - clôt les missions de Lucas restées « en cours » alors qu'elles sont finies ;
 * - planifie Lucas chaque jour, d'aujourd'hui à J+14, sur trois créneaux
 *   (matin, après-midi, soir : le soir en France correspond à la journée de
 *   travail des vérificateurs américains).
 *
 * Ne touche qu'au compte de Lucas et à ses missions. Relancer le script ne
 * crée pas de doublons. Sur le serveur (Coolify → backend → Terminal) :
 *   DEMO_MODE=1 npx tsx prisma/seedReviewEmployee.ts
 */
import { PrismaClient, MissionStatus } from "@prisma/client";
import { env } from "../src/config/env";
import { addDaysToKey, calendarDay, companyDateKey, companyDateTime } from "../src/utils/companyTime";

const prisma = new PrismaClient();
const DAYS_AHEAD = 14;

const SLOTS = [
  { siteName: "Résidence Les Tilleuls", title: "Nettoyage parties communes", start: "09:00", end: "12:00", instructions: "Hall d'entrée, cages d'escalier, vitres du rez-de-chaussée." },
  { siteName: "Clinique Saint-Michel", title: "Désinfection salles de consultation", start: "14:00", end: "17:00", instructions: "Protocole sanitaire renforcé, salles 1 à 6." },
  { siteName: "Résidence Les Tilleuls", title: "Entretien du soir", start: "18:00", end: "23:00", instructions: "Poubelles, ascenseur, halls d'entrée." },
];

async function main() {
  if (env.isProduction && process.env.DEMO_MODE !== "1") {
    throw new Error("Serveur en production : relancer avec DEMO_MODE=1 devant la commande (serveur de démonstration uniquement).");
  }

  const lucas = await prisma.user.findUnique({ where: { email: "lucas.employe@deepclean.fr" } });
  if (!lucas) throw new Error("Compte de démo de Lucas Petit introuvable : charger d'abord la démo (seedPresentationDemo.ts).");
  const creator = (await prisma.user.findUnique({ where: { email: "rh@deepclean.fr" } })) ?? lucas;

  const openEntries = await prisma.timeEntry.deleteMany({ where: { userId: lucas.id, clockOut: null } });
  const staleMissions = await prisma.mission.updateMany({
    where: { status: MissionStatus.IN_PROGRESS, endTime: { lt: new Date() }, assignments: { some: { userId: lucas.id } } },
    data: { status: MissionStatus.COMPLETED },
  });

  const today = companyDateKey(new Date());
  let created = 0;
  for (const slot of SLOTS) {
    const site = await prisma.site.findFirst({ where: { name: slot.siteName } });
    if (!site) {
      console.warn(`Chantier « ${slot.siteName} » introuvable : créneau ${slot.start}-${slot.end} ignoré.`);
      continue;
    }
    for (let offset = 0; offset <= DAYS_AHEAD; offset += 1) {
      const day = addDaysToKey(today, offset);
      const startTime = companyDateTime(day, slot.start);
      const alreadyPlanned = await prisma.mission.findFirst({
        where: { siteId: site.id, startTime, assignments: { some: { userId: lucas.id } } },
      });
      if (alreadyPlanned) continue;

      await prisma.mission.create({
        data: {
          siteId: site.id,
          title: slot.title,
          date: calendarDay(day),
          startTime,
          endTime: companyDateTime(day, slot.end),
          instructions: slot.instructions,
          status: MissionStatus.SCHEDULED,
          createdById: creator.id,
          assignments: { create: [{ userId: lucas.id }] },
        },
      });
      created += 1;
    }
  }

  console.log(`Pointage(s) ouvert(s) supprimé(s) : ${openEntries.count}.`);
  console.log(`Mission(s) passée(s) « en cours » clôturée(s) : ${staleMissions.count}.`);
  console.log(`Missions créées pour Lucas (aujourd'hui à J+${DAYS_AHEAD}) : ${created}.`);
}

main()
  .catch((err) => {
    console.error("Échec de la préparation du compte employé :", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
