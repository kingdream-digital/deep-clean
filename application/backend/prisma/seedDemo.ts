import { PrismaClient, Role, MissionStatus } from "@prisma/client";
import { hashPassword } from "../src/utils/password";
import { generateUsername } from "../src/utils/username";
import { env } from "../src/config/env";

const prisma = new PrismaClient();

const DEMO_PASSWORD = "DemoClean2026!";

// Garde-fou ajouté (audit secrets/sécurité) : ce script crée des comptes avec
// un mot de passe fixe et public (visible dans ce fichier du dépôt). Rien
// n'empêchait jusqu'ici de le lancer par erreur contre DATABASE_URL de
// production — si ça arrivait, ce mot de passe connu de tous deviendrait
// valide sur de vrais comptes. Refuse explicitement de tourner en production.
function assertNotProduction(): void {
  if (env.isProduction) {
    throw new Error(
      "Ce script de démo ne doit jamais être exécuté en production (NODE_ENV=production) : il crée des comptes avec un mot de passe fixe et public."
    );
  }
}

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

async function upsertUser(params: {
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  createdById?: string | null;
}) {
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  // `username` est requis et unique (voir prisma/schema.prisma) — c'est
  // l'identifiant de connexion réel, jamais l'email. Généré ici de la même
  // façon que la RH le fait depuis l'application (users.service.ts::createUser)
  // pour que les comptes de démo se connectent exactement comme un vrai compte.
  const username = await generateUsername(params.firstName, params.lastName);
  return prisma.user.upsert({
    where: { email: params.email },
    update: {},
    create: {
      username,
      email: params.email,
      firstName: params.firstName,
      lastName: params.lastName,
      role: params.role,
      passwordHash,
      mustChangePassword: false,
      isActive: true,
      createdById: params.createdById ?? null,
    },
  });
}

async function main() {
  assertNotProduction();

  const admin = await prisma.user.findFirst({ where: { role: Role.ADMIN } });

  const rh = await upsertUser({
    email: "rh@deepclean.fr",
    firstName: "Marie",
    lastName: "Dupont",
    role: Role.HR,
    createdById: admin?.id,
  });
  const directeur = await upsertUser({
    email: "directeur@deepclean.fr",
    firstName: "Jean",
    lastName: "Lefèvre",
    role: Role.DIRECTOR,
    createdById: rh.id,
  });
  const karim = await upsertUser({
    email: "karim.chef@deepclean.fr",
    firstName: "Karim",
    lastName: "Benali",
    role: Role.SITE_MANAGER,
    createdById: rh.id,
  });
  const sophie = await upsertUser({
    email: "sophie.chef@deepclean.fr",
    firstName: "Sophie",
    lastName: "Martin",
    role: Role.SITE_MANAGER,
    createdById: rh.id,
  });
  const lucas = await upsertUser({
    email: "lucas.employe@deepclean.fr",
    firstName: "Lucas",
    lastName: "Petit",
    role: Role.EMPLOYEE,
    createdById: rh.id,
  });
  const emma = await upsertUser({
    email: "emma.employe@deepclean.fr",
    firstName: "Emma",
    lastName: "Rousseau",
    role: Role.EMPLOYEE,
    createdById: rh.id,
  });
  const nathan = await upsertUser({
    email: "nathan.employe@deepclean.fr",
    firstName: "Nathan",
    lastName: "Girard",
    role: Role.EMPLOYEE,
    createdById: rh.id,
  });
  const chloe = await upsertUser({
    email: "chloe.employe@deepclean.fr",
    firstName: "Chloé",
    lastName: "Simon",
    role: Role.EMPLOYEE,
    createdById: rh.id,
  });

  console.log("Comptes démo prêts (mot de passe commun : " + DEMO_PASSWORD + ") :");
  for (const u of [rh, directeur, karim, sophie, lucas, emma, nathan, chloe]) {
    console.log(`  - ${u.username} (${u.role})`);
  }

  let siteTilleuls = await prisma.site.findFirst({ where: { name: "Résidence Les Tilleuls" } });
  if (!siteTilleuls) {
    siteTilleuls = await prisma.site.create({
      data: {
        name: "Résidence Les Tilleuls",
        address: "12 Rue des Tilleuls, 75015 Paris",
        description: "Copropriété résidentielle, 6 étages, parties communes et halls d'entrée.",
        managerId: karim.id,
      },
    });
  }

  let siteTechcorp = await prisma.site.findFirst({ where: { name: "Bureaux TechCorp" } });
  if (!siteTechcorp) {
    siteTechcorp = await prisma.site.create({
      data: {
        name: "Bureaux TechCorp",
        address: "45 Avenue de la République, 75011 Paris",
        description: "Open space et bureaux fermés sur 3 étages, entretien quotidien.",
        managerId: sophie.id,
      },
    });
  }

  let siteClinique = await prisma.site.findFirst({ where: { name: "Clinique Saint-Michel" } });
  if (!siteClinique) {
    siteClinique = await prisma.site.create({
      data: {
        name: "Clinique Saint-Michel",
        address: "8 Boulevard Saint-Michel, 75005 Paris",
        description: "Nettoyage sanitaire renforcé, protocoles spécifiques.",
        managerId: karim.id,
      },
    });
  }

  console.log("Chantiers démo prêts : Résidence Les Tilleuls, Bureaux TechCorp, Clinique Saint-Michel");

  const teamMembers: Array<{ siteId: string; userId: string }> = [
    { siteId: siteTilleuls.id, userId: karim.id },
    { siteId: siteTilleuls.id, userId: lucas.id },
    { siteId: siteTilleuls.id, userId: emma.id },
    { siteId: siteTechcorp.id, userId: sophie.id },
    { siteId: siteTechcorp.id, userId: nathan.id },
    { siteId: siteTechcorp.id, userId: chloe.id },
    { siteId: siteClinique.id, userId: karim.id },
    { siteId: siteClinique.id, userId: lucas.id },
    { siteId: siteClinique.id, userId: nathan.id },
  ];
  for (const m of teamMembers) {
    await prisma.siteMember.upsert({
      where: { siteId_userId: { siteId: m.siteId, userId: m.userId } },
      update: {},
      create: m,
    });
  }

  const existingMissionCount = await prisma.mission.count();
  if (existingMissionCount > 0) {
    console.log("Des missions existent déjà, création des missions démo ignorée.");
    return;
  }

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
      dayOffset: -7,
      start: "08:00",
      end: "11:00",
      instructions: "Hall d'entrée, cages d'escalier, vitres du rez-de-chaussée.",
      assignees: [lucas.id, emma.id],
      leadId: karim.id,
      status: MissionStatus.COMPLETED,
    },
    {
      site: siteTechcorp,
      title: "Entretien bureaux étage 2",
      dayOffset: -5,
      start: "18:00",
      end: "20:30",
      instructions: "Aspiration, poubelles, sanitaires.",
      assignees: [nathan.id, chloe.id],
      leadId: sophie.id,
      status: MissionStatus.COMPLETED,
    },
    {
      site: siteTilleuls,
      title: "Nettoyage parties communes",
      dayOffset: 0,
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
      dayOffset: 0,
      start: "18:00",
      end: "20:30",
      instructions: "Aspiration, poubelles, sanitaires. Attention réunion en salle B jusqu'à 18h30.",
      assignees: [nathan.id, chloe.id],
      leadId: sophie.id,
      status: MissionStatus.SCHEDULED,
    },
    {
      site: siteClinique,
      title: "Désinfection salles de consultation",
      dayOffset: 1,
      start: "07:00",
      end: "09:00",
      instructions: "Protocole sanitaire renforcé, salles 1 à 6.",
      assignees: [lucas.id, nathan.id],
      leadId: karim.id,
      status: MissionStatus.SCHEDULED,
    },
    {
      site: siteTechcorp,
      title: "Grand nettoyage open space",
      dayOffset: 2,
      start: "18:00",
      end: "21:00",
      instructions: "Vitres intérieures, moquette, cuisine partagée.",
      assignees: [nathan.id, chloe.id, sophie.id],
      leadId: sophie.id,
      status: MissionStatus.SCHEDULED,
    },
    {
      site: siteTilleuls,
      title: "Nettoyage parties communes",
      dayOffset: 2,
      start: "08:00",
      end: "11:00",
      instructions: "Hall d'entrée, cages d'escalier.",
      assignees: [emma.id],
      leadId: undefined,
      status: MissionStatus.SCHEDULED,
    },
    {
      site: siteClinique,
      title: "Désinfection salles de consultation",
      dayOffset: 3,
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
      dayOffset: 4,
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
      dayOffset: 4,
      start: "18:00",
      end: "20:30",
      instructions: "Aspiration, poubelles, sanitaires.",
      assignees: [nathan.id, chloe.id],
      leadId: sophie.id,
      status: MissionStatus.CANCELLED,
    },
  ];

  for (const seed of missionSeeds) {
    const dateStr = isoDate(addDays(monday, seed.dayOffset));
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
        data: {
          missionId: mission.id,
          userId,
          isLead: userId === seed.leadId,
        },
      });
    }
  }

  console.log(`${missionSeeds.length} missions démo créées.`);
}

main()
  .catch((err) => {
    console.error("Échec du seed démo :", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
