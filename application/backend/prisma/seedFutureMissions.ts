import { PrismaClient, MissionStatus } from "@prisma/client";

const prisma = new PrismaClient();

function combineDateTime(date: string, time: string): Date {
  return new Date(`${date}T${time}:00`);
}

function isoDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

// Étale des missions sur les 3 prochaines semaines (au-delà de la semaine en
// cours déjà couverte par seedDemo.ts) pour vérifier le rendu du planning sur
// plusieurs semaines à venir, pas seulement la semaine courante.
async function main() {
  const rh = await prisma.user.findUniqueOrThrow({ where: { email: "rh@deepclean.fr" } });
  const karim = await prisma.user.findUniqueOrThrow({ where: { email: "karim.chef@deepclean.fr" } });
  const sophie = await prisma.user.findUniqueOrThrow({ where: { email: "sophie.chef@deepclean.fr" } });
  const lucas = await prisma.user.findUniqueOrThrow({ where: { email: "lucas.employe@deepclean.fr" } });
  const emma = await prisma.user.findUniqueOrThrow({ where: { email: "emma.employe@deepclean.fr" } });
  const nathan = await prisma.user.findUniqueOrThrow({ where: { email: "nathan.employe@deepclean.fr" } });
  const chloe = await prisma.user.findUniqueOrThrow({ where: { email: "chloe.employe@deepclean.fr" } });

  const siteTilleuls = await prisma.site.findFirstOrThrow({ where: { name: "Résidence Les Tilleuls" } });
  const siteTechcorp = await prisma.site.findFirstOrThrow({ where: { name: "Bureaux TechCorp" } });
  const siteClinique = await prisma.site.findFirstOrThrow({ where: { name: "Clinique Saint-Michel" } });

  const today = new Date();
  const monday = addDays(today, 1 - (today.getDay() === 0 ? 7 : today.getDay()));

  type MissionSeed = {
    site: { id: string };
    title: string;
    dayOffset: number;
    start: string;
    end: string;
    instructions: string;
    assignees: string[];
    leadId?: string;
    status: MissionStatus;
  };

  const missionSeeds: MissionSeed[] = [
    {
      site: siteTilleuls,
      title: "Nettoyage parties communes",
      dayOffset: 7,
      start: "08:00",
      end: "11:00",
      instructions: "Hall d'entrée, cages d'escalier, vitres du rez-de-chaussée.",
      assignees: [lucas.id, emma.id],
      leadId: karim.id,
      status: MissionStatus.SCHEDULED,
    },
    {
      site: siteTechcorp,
      title: "Entretien bureaux étage 2",
      dayOffset: 7,
      start: "18:00",
      end: "20:30",
      instructions: "Aspiration, poubelles, sanitaires.",
      assignees: [nathan.id, chloe.id],
      leadId: sophie.id,
      status: MissionStatus.SCHEDULED,
    },
    {
      site: siteClinique,
      title: "Désinfection salles de consultation",
      dayOffset: 8,
      start: "07:00",
      end: "09:00",
      instructions: "Protocole sanitaire renforcé, salles 1 à 6.",
      assignees: [lucas.id, nathan.id],
      leadId: karim.id,
      status: MissionStatus.SCHEDULED,
    },
    {
      site: siteTilleuls,
      title: "Nettoyage vitres façade",
      dayOffset: 9,
      start: "09:00",
      end: "12:00",
      instructions: "Vitres extérieures, intervention en nacelle — prévoir accès.",
      assignees: [emma.id, karim.id],
      leadId: karim.id,
      status: MissionStatus.SCHEDULED,
    },
    {
      site: siteTechcorp,
      title: "Grand nettoyage open space",
      dayOffset: 11,
      start: "18:00",
      end: "21:00",
      instructions: "Vitres intérieures, moquette, cuisine partagée.",
      assignees: [nathan.id, chloe.id, sophie.id],
      leadId: sophie.id,
      status: MissionStatus.SCHEDULED,
    },
    {
      site: siteClinique,
      title: "Désinfection salles de consultation",
      dayOffset: 14,
      start: "07:00",
      end: "09:00",
      instructions: "Protocole sanitaire renforcé, salles 7 à 12.",
      assignees: [lucas.id, karim.id],
      leadId: karim.id,
      status: MissionStatus.SCHEDULED,
    },
    {
      site: siteTilleuls,
      title: "Nettoyage parties communes",
      dayOffset: 14,
      start: "08:00",
      end: "11:00",
      instructions: "Hall d'entrée, cages d'escalier, vitres du rez-de-chaussée.",
      assignees: [lucas.id, emma.id],
      leadId: karim.id,
      status: MissionStatus.SCHEDULED,
    },
    {
      site: siteTechcorp,
      title: "Entretien bureaux étage 2",
      dayOffset: 16,
      start: "18:00",
      end: "20:30",
      instructions: "Aspiration, poubelles, sanitaires. Client a demandé un report possible.",
      assignees: [nathan.id, chloe.id],
      leadId: sophie.id,
      status: MissionStatus.CANCELLED,
    },
    {
      site: siteClinique,
      title: "Désinfection salles de consultation",
      dayOffset: 18,
      start: "07:00",
      end: "09:00",
      instructions: "Protocole sanitaire renforcé, salles 1 à 6.",
      assignees: [lucas.id, nathan.id],
      leadId: karim.id,
      status: MissionStatus.SCHEDULED,
    },
    {
      site: siteTilleuls,
      title: "Nettoyage parties communes",
      dayOffset: 21,
      start: "08:00",
      end: "11:00",
      instructions: "Hall d'entrée, cages d'escalier, vitres du rez-de-chaussée.",
      assignees: [emma.id, chloe.id],
      leadId: sophie.id,
      status: MissionStatus.SCHEDULED,
    },
  ];

  let created = 0;
  for (const seed of missionSeeds) {
    const dateStr = isoDate(addDays(monday, seed.dayOffset));

    const alreadyExists = await prisma.mission.findFirst({
      where: { siteId: seed.site.id, title: seed.title, date: new Date(`${dateStr}T00:00:00`) },
    });
    if (alreadyExists) continue;

    const startTime = combineDateTime(dateStr, seed.start);
    const endTime = combineDateTime(dateStr, seed.end);

    const mission = await prisma.mission.create({
      data: {
        siteId: seed.site.id,
        title: seed.title,
        date: new Date(`${dateStr}T00:00:00`),
        startTime,
        endTime,
        instructions: seed.instructions,
        status: seed.status,
        createdById: rh.id,
      },
    });

    for (const userId of seed.assignees) {
      await prisma.missionAssignment.create({
        data: { missionId: mission.id, userId, isLead: userId === seed.leadId },
      });
    }
    created += 1;
  }

  console.log(`${created} missions futures créées (${missionSeeds.length - created} déjà existantes, ignorées).`);
}

main()
  .catch((err) => {
    console.error("Échec du seed missions futures :", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
