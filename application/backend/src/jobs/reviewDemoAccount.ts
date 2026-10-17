import { MissionStatus, type PrismaClient } from "@prisma/client";
import { addDaysToKey, calendarDay, companyDateKey, companyDateTime } from "../utils/companyTime";

// Compte employé de la démo (prisma/seedPresentationDemo.ts) donné aux
// vérificateurs Apple / Google : ils doivent pouvoir pointer une arrivée puis
// une sortie sur une mission du jour, à toute heure de leur journée (le soir
// en France). Sans effet dès que la démo est vidée (compte absent).
const REVIEW_EMPLOYEE_EMAIL = "lucas.employe@deepclean.fr";
const DAYS_AHEAD = 14;
// Un pointage ouvert depuis plus longtemps est un reste de la démo de
// présentation (« en poste » depuis des centaines d'heures), jamais celui
// d'un vérificateur en cours de test.
const STALE_OPEN_ENTRY_MS = 24 * 60 * 60 * 1000;

const SLOTS = [
  {
    siteName: "Résidence Les Tilleuls",
    title: "Nettoyage parties communes",
    start: "09:00",
    end: "12:00",
    instructions: "Hall d'entrée, cages d'escalier, vitres du rez-de-chaussée.",
  },
  {
    siteName: "Clinique Saint-Michel",
    title: "Désinfection salles de consultation",
    start: "14:00",
    end: "17:00",
    instructions: "Protocole sanitaire renforcé, salles 1 à 6.",
  },
  {
    siteName: "Résidence Les Tilleuls",
    title: "Entretien du soir",
    start: "18:00",
    end: "23:00",
    instructions: "Poubelles, ascenseur, halls d'entrée.",
  },
];

export interface ReviewDemoResult {
  staleEntriesRemoved: number;
  staleMissionsClosed: number;
  missionsCreated: number;
}

/**
 * Idempotent : supprime le pointage resté ouvert par la démo, clôt les
 * missions passées restées « en cours » et planifie l'employé de démo chaque
 * jour jusqu'à J+14 (matin, après-midi, soir), sans doublon. Ne touche qu'à ce
 * compte et à ses missions. Renvoie null si la démo n'est pas chargée.
 */
export async function prepareReviewDemoAccount(
  prisma: PrismaClient,
  now: Date = new Date()
): Promise<ReviewDemoResult | null> {
  const employee = await prisma.user.findUnique({ where: { email: REVIEW_EMPLOYEE_EMAIL } });
  if (!employee) return null;
  const creator = (await prisma.user.findUnique({ where: { email: "rh@deepclean.fr" } })) ?? employee;

  const staleEntries = await prisma.timeEntry.deleteMany({
    where: {
      userId: employee.id,
      clockOut: null,
      clockIn: { lt: new Date(now.getTime() - STALE_OPEN_ENTRY_MS) },
    },
  });
  const staleMissions = await prisma.mission.updateMany({
    where: {
      status: MissionStatus.IN_PROGRESS,
      endTime: { lt: now },
      assignments: { some: { userId: employee.id } },
    },
    data: { status: MissionStatus.COMPLETED },
  });

  const today = companyDateKey(now);
  let missionsCreated = 0;
  for (const slot of SLOTS) {
    const site = await prisma.site.findFirst({ where: { name: slot.siteName } });
    if (!site) continue;
    for (let offset = 0; offset <= DAYS_AHEAD; offset += 1) {
      const day = addDaysToKey(today, offset);
      const startTime = companyDateTime(day, slot.start);
      const alreadyPlanned = await prisma.mission.findFirst({
        where: { siteId: site.id, startTime, assignments: { some: { userId: employee.id } } },
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
          assignments: { create: [{ userId: employee.id }] },
        },
      });
      missionsCreated += 1;
    }
  }

  return {
    staleEntriesRemoved: staleEntries.count,
    staleMissionsClosed: staleMissions.count,
    missionsCreated,
  };
}
