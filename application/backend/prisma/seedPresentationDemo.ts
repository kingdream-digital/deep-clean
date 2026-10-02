/**
 * Jeu de données de démonstration pour la présentation commerciale
 * (application/presentation) et pour une démo en ligne à montrer au client.
 *
 * En développement : `npx tsx prisma/seedPresentationDemo.ts`.
 * Sur un serveur (NODE_ENV=production) : uniquement sur un serveur de
 * démonstration, avec `DEMO_MODE=1 npx tsx prisma/seedPresentationDemo.ts`.
 * Le script refuse alors de tourner dès que la base contient un seul compte
 * qui n'appartient pas à la démo (voir assertSafeTarget) : il ne peut jamais
 * mélanger de faux comptes, au mot de passe public, avec de vraies données.
 *
 * Contrairement à seedDemo.ts (données minimales pour développer), ce script
 * vise un rendu "vivant" pour les captures d'écran : photos de profil
 * réalistes, semaine de planning bien remplie, et un jeu complet de données
 * du module commercial (prospect → client → devis → chantier → facturation)
 * parcouru via les VRAIS services métier (jamais des lignes SQL à la main),
 * pour que chaque montant, numéro de devis/facture et statut soit calculé
 * exactement comme il le serait en conditions réelles.
 */
import { PrismaClient, Role, MissionStatus, ProblemType, QuoteItemUnit, QuoteItemFrequency, QuoteFollowUpMethod } from "@prisma/client";
import PDFDocument from "pdfkit";
import { hashPassword } from "../src/utils/password";
import { generateUsername } from "../src/utils/username";
import { env } from "../src/config/env";
import { storeImage } from "../src/utils/storage";
import { calendarDay, companyDateTime } from "../src/utils/companyTime";
import * as prospectsService from "../src/modules/prospects/prospects.service";
import * as clientsService from "../src/modules/clients/clients.service";
import * as quotesService from "../src/modules/quotes/quotes.service";
import * as invoicesService from "../src/modules/invoices/invoices.service";
import * as sitesService from "../src/modules/sites/sites.service";
import * as problemsService from "../src/modules/problems/problems.service";
import * as messagesService from "../src/modules/messages/messages.service";
import * as timesheetsService from "../src/modules/timesheets/timesheets.service";
import * as absencesService from "../src/modules/absences/absences.service";
import * as standardsService from "../src/modules/standards/standards.service";
import * as missionsService from "../src/modules/missions/missions.service";

const prisma = new PrismaClient();
const DEMO_PASSWORD = "DemoClean2026!";

// Adresses des comptes créés par ce script : tout autre compte (hors admin
// technique) est considéré comme une vraie donnée de l'entreprise.
const DEMO_EMAILS = [
  "rh@deepclean.fr", "directeur@deepclean.fr", "yasmine.superviseur@deepclean.fr", "karim.chef@deepclean.fr",
  "sophie.chef@deepclean.fr", "lucas.employe@deepclean.fr", "emma.employe@deepclean.fr", "nathan.employe@deepclean.fr",
  "chloe.employe@deepclean.fr", "ines.employe@deepclean.fr", "thomas.employe@deepclean.fr",
];

async function assertSafeTarget(): Promise<void> {
  if (!env.isProduction) return;
  if (process.env.DEMO_MODE !== "1") {
    throw new Error(
      "Serveur en production : ce script crée des comptes au mot de passe public. Il ne se lance que sur un serveur de démonstration, avec DEMO_MODE=1 devant la commande."
    );
  }
  const realAccounts = await prisma.user.count({ where: { role: { not: Role.ADMIN }, email: { notIn: DEMO_EMAILS } } });
  if (realAccounts > 0) {
    throw new Error(
      `Arrêt : la base contient ${realAccounts} compte(s) qui ne font pas partie de la démo. Rien n'a été modifié. La démo ne se charge que sur une base vide (hors admin technique).`
    );
  }
}

// Petit PDF réel (consignes de chantier) joint dans le groupe de messagerie.
function buildSafetyPdf(): Promise<Buffer> {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ size: "A4", margin: 56 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.fontSize(20).text("Consignes de sécurité · Coworking Le Phare");
    doc.moveDown().fontSize(11).fillColor("#444");
    [
      "Port des gants obligatoire pour les produits désinfectants.",
      "Signalisation « sol glissant » pendant et après le lavage des sols.",
      "Local technique : ne jamais laisser les produits sans surveillance.",
      "Ascenseur réservé au matériel entre 7 h et 9 h.",
      "Tout incident est signalé le jour même depuis l'application.",
    ].forEach((line, i) => doc.text(`${i + 1}. ${line}`).moveDown(0.4));
    doc.moveDown().fillColor("#888").fontSize(9).text("Deep Clean · document interne");
    doc.end();
  });
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}
// Heures en heure de Paris et jours calendaires à minuit UTC, quel que soit
// le fuseau du serveur (mêmes règles que l'application, utils/companyTime.ts).
const combineDateTime = companyDateTime;
const dayOnly = calendarDay;

// Photos de démo (jamais de vraies personnes) : pravatar.cc fournit des
// portraits explicitement libres pour cet usage ("free to use in personal or
// commercial projects, incl. as placeholder avatars"), picsum.photos pour les
// photos de chantier/signalement. Best-effort : une image manquante ne doit
// jamais faire échouer tout le script.
async function fetchBuffer(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

async function setAvatar(userId: string, seed: number): Promise<void> {
  const buffer = await fetchBuffer(`https://i.pravatar.cc/500?img=${seed}`);
  if (!buffer) return;
  const stored = await storeImage(buffer);
  await prisma.user.update({ where: { id: userId }, data: { avatarKey: stored.storageKey } });
}

async function upsertUser(params: { email: string; firstName: string; lastName: string; role: Role; createdById?: string | null }) {
  const passwordHash = await hashPassword(DEMO_PASSWORD);
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
  await assertSafeTarget();
  // Les devis et factures de démo passent par le vrai workflow, qui envoie un
  // e-mail au client à chaque étape. Les adresses de la démo sont inventées :
  // l'envoi est coupé pour toute la durée du script (simulation, voir
  // utils/mailer.ts), même si le serveur a un SMTP configuré.
  (env as { SMTP_HOST?: string }).SMTP_HOST = undefined;

  const admin = await prisma.user.findFirst({ where: { role: Role.ADMIN } });

  // ---------------------------------------------------------------- Comptes
  const rh = await upsertUser({ email: "rh@deepclean.fr", firstName: "Marie", lastName: "Dupont", role: Role.HR, createdById: admin?.id });
  const directeur = await upsertUser({ email: "directeur@deepclean.fr", firstName: "Jean", lastName: "Lefèvre", role: Role.DIRECTOR, createdById: rh.id });
  const superviseur = await upsertUser({ email: "yasmine.superviseur@deepclean.fr", firstName: "Yasmine", lastName: "Traoré", role: Role.SUPERVISOR, createdById: rh.id });
  const karim = await upsertUser({ email: "karim.chef@deepclean.fr", firstName: "Karim", lastName: "Benali", role: Role.SITE_MANAGER, createdById: rh.id });
  const sophie = await upsertUser({ email: "sophie.chef@deepclean.fr", firstName: "Sophie", lastName: "Martin", role: Role.SITE_MANAGER, createdById: rh.id });
  const lucas = await upsertUser({ email: "lucas.employe@deepclean.fr", firstName: "Lucas", lastName: "Petit", role: Role.EMPLOYEE, createdById: rh.id });
  const emma = await upsertUser({ email: "emma.employe@deepclean.fr", firstName: "Emma", lastName: "Rousseau", role: Role.EMPLOYEE, createdById: rh.id });
  const nathan = await upsertUser({ email: "nathan.employe@deepclean.fr", firstName: "Nathan", lastName: "Girard", role: Role.EMPLOYEE, createdById: rh.id });
  const chloe = await upsertUser({ email: "chloe.employe@deepclean.fr", firstName: "Chloé", lastName: "Simon", role: Role.EMPLOYEE, createdById: rh.id });
  const ines = await upsertUser({ email: "ines.employe@deepclean.fr", firstName: "Inès", lastName: "Fontaine", role: Role.EMPLOYEE, createdById: rh.id });
  const thomas = await upsertUser({ email: "thomas.employe@deepclean.fr", firstName: "Thomas", lastName: "Roy", role: Role.EMPLOYEE, createdById: rh.id });

  console.log("Photos de profil...");
  await Promise.all([
    setAvatar(rh.id, 47),
    setAvatar(directeur.id, 13),
    setAvatar(superviseur.id, 25),
    setAvatar(karim.id, 33),
    setAvatar(sophie.id, 44),
    setAvatar(lucas.id, 12),
    setAvatar(emma.id, 5),
    setAvatar(nathan.id, 51),
    setAvatar(chloe.id, 9),
    setAvatar(ines.id, 20),
    setAvatar(thomas.id, 60),
  ]);

  console.log("Comptes démo prêts (mot de passe commun : " + DEMO_PASSWORD + ") :");
  for (const u of [rh, directeur, superviseur, karim, sophie, lucas, emma, nathan, chloe, ines, thomas]) {
    console.log(`  - ${u.username} (${u.role})`);
  }

  // ---------------------------------------------------------------- Chantiers existants
  async function upsertSite(name: string, address: string, description: string, managerId: string) {
    const existing = await prisma.site.findFirst({ where: { name } });
    if (existing) return existing;
    return prisma.site.create({ data: { name, address, description, managerId } });
  }

  const siteTilleuls = await upsertSite("Résidence Les Tilleuls", "12 Rue des Tilleuls, 75015 Paris", "Copropriété résidentielle, 6 étages, parties communes et halls d'entrée.", karim.id);
  const siteTechcorp = await upsertSite("Bureaux TechCorp", "45 Avenue de la République, 75011 Paris", "Open space et bureaux fermés sur 3 étages, entretien quotidien.", sophie.id);
  const siteClinique = await upsertSite("Clinique Saint-Michel", "8 Boulevard Saint-Michel, 75005 Paris", "Nettoyage sanitaire renforcé, protocoles spécifiques.", karim.id);

  const teamMembers: Array<{ siteId: string; userId: string }> = [
    { siteId: siteTilleuls.id, userId: karim.id }, { siteId: siteTilleuls.id, userId: lucas.id }, { siteId: siteTilleuls.id, userId: emma.id }, { siteId: siteTilleuls.id, userId: ines.id },
    { siteId: siteTechcorp.id, userId: sophie.id }, { siteId: siteTechcorp.id, userId: nathan.id }, { siteId: siteTechcorp.id, userId: chloe.id }, { siteId: siteTechcorp.id, userId: thomas.id },
    { siteId: siteClinique.id, userId: karim.id }, { siteId: siteClinique.id, userId: lucas.id }, { siteId: siteClinique.id, userId: nathan.id },
  ];
  for (const m of teamMembers) {
    await prisma.siteMember.upsert({ where: { siteId_userId: { siteId: m.siteId, userId: m.userId } }, update: {}, create: m });
  }
  console.log("Chantiers démo prêts.");

  // ---------------------------------------------------------------- Planning : une semaine bien remplie
  // Tout est daté par rapport au jour de la démonstration : une mission en
  // cours « aujourd'hui », l'historique les jours d'avant, le planning à
  // venir ensuite. DEMO_DATE=AAAA-MM-JJ permet de préparer la démo la veille
  // pour le jour de la présentation (par défaut : aujourd'hui).
  const demoDate = process.env.DEMO_DATE;
  if (demoDate && !/^\d{4}-\d{2}-\d{2}$/.test(demoDate)) throw new Error("DEMO_DATE doit être au format AAAA-MM-JJ.");
  const today = demoDate ? new Date(`${demoDate}T12:00:00`) : new Date();
  const missionIds: Record<string, string> = {};

  // Ne recrée jamais le planning de démo s'il existe déjà (aucune suppression,
  // uniquement une vérification avant ajout).
  if ((await prisma.mission.count()) === 0) {
    type MissionSeed = { site: { id: string }; title: string; dayOffset: number; start: string; end: string; instructions: string; assignees: string[]; leadId?: string; status: MissionStatus; key?: string };

    const missionSeeds: MissionSeed[] = [
      // Historique (déjà fait)
      { site: siteTilleuls, title: "Nettoyage parties communes", dayOffset: -9, start: "08:00", end: "11:00", instructions: "Hall d'entrée, cages d'escalier, vitres du rez-de-chaussée.", assignees: [lucas.id, emma.id, ines.id], leadId: karim.id, status: MissionStatus.COMPLETED },
      { site: siteTechcorp, title: "Entretien bureaux étage 2", dayOffset: -8, start: "18:00", end: "20:30", instructions: "Aspiration, poubelles, sanitaires.", assignees: [nathan.id, chloe.id], leadId: sophie.id, status: MissionStatus.COMPLETED },
      { site: siteClinique, title: "Désinfection salles de consultation", dayOffset: -7, start: "07:00", end: "09:00", instructions: "Protocole sanitaire renforcé, salles 1 à 6.", assignees: [lucas.id, nathan.id], leadId: karim.id, status: MissionStatus.COMPLETED },
      { site: siteTilleuls, title: "Nettoyage parties communes", dayOffset: -3, start: "08:00", end: "11:00", instructions: "Hall d'entrée, cages d'escalier, vitres du rez-de-chaussée.", assignees: [lucas.id, emma.id], leadId: karim.id, status: MissionStatus.COMPLETED },
      { site: siteTechcorp, title: "Entretien bureaux étage 2", dayOffset: -3, start: "18:00", end: "20:30", instructions: "Aspiration, poubelles, sanitaires. Réunion en salle B jusqu'à 18 h 30.", assignees: [nathan.id, chloe.id, thomas.id], leadId: sophie.id, status: MissionStatus.COMPLETED },
      { site: siteClinique, title: "Désinfection salles de consultation", dayOffset: -2, start: "07:00", end: "09:00", instructions: "Protocole sanitaire renforcé, salles 1 à 6.", assignees: [lucas.id, nathan.id, karim.id], leadId: karim.id, status: MissionStatus.COMPLETED },
      { site: siteTilleuls, title: "Vitrerie extérieure", dayOffset: -2, start: "14:00", end: "16:00", instructions: "Façade rue des Tilleuls, rez-de-chaussée et 1er étage.", assignees: [emma.id, ines.id], leadId: undefined, status: MissionStatus.COMPLETED },
      { site: siteTechcorp, title: "Entretien bureaux étage 2", dayOffset: -1, start: "18:00", end: "20:30", instructions: "Aspiration, poubelles, sanitaires.", assignees: [nathan.id, chloe.id], leadId: sophie.id, status: MissionStatus.COMPLETED },
      // Aujourd'hui : une terminée tôt, une en cours, une cet après-midi
      { site: siteTechcorp, title: "Grand nettoyage open space", dayOffset: 0, start: "06:30", end: "08:30", instructions: "Vitres intérieures, moquette, cuisine partagée.", assignees: [nathan.id, chloe.id, sophie.id], leadId: sophie.id, status: MissionStatus.COMPLETED },
      { site: siteTilleuls, title: "Nettoyage parties communes", dayOffset: 0, start: "08:00", end: "11:00", instructions: "Hall d'entrée, cages d'escalier.", assignees: [lucas.id, emma.id, ines.id], leadId: karim.id, status: MissionStatus.IN_PROGRESS, key: "todayInProgress" },
      { site: siteClinique, title: "Désinfection salles de consultation", dayOffset: 0, start: "14:00", end: "16:00", instructions: "Protocole sanitaire renforcé, salles 7 à 12.", assignees: [lucas.id, karim.id], leadId: karim.id, status: MissionStatus.SCHEDULED },
      // À venir
      { site: siteTechcorp, title: "Entretien bureaux étage 2", dayOffset: 1, start: "18:00", end: "20:30", instructions: "Aspiration, poubelles, sanitaires.", assignees: [nathan.id, chloe.id, thomas.id], leadId: sophie.id, status: MissionStatus.SCHEDULED },
      { site: siteClinique, title: "Désinfection salles de consultation", dayOffset: 2, start: "07:00", end: "09:00", instructions: "Protocole sanitaire renforcé, salles 1 à 6.", assignees: [lucas.id, nathan.id, karim.id], leadId: karim.id, status: MissionStatus.SCHEDULED },
      { site: siteTilleuls, title: "Nettoyage parties communes", dayOffset: 2, start: "08:00", end: "11:00", instructions: "Hall d'entrée, cages d'escalier, vitres du rez-de-chaussée.", assignees: [emma.id, ines.id], leadId: karim.id, status: MissionStatus.SCHEDULED },
      { site: siteTechcorp, title: "Entretien bureaux étage 2", dayOffset: 3, start: "18:00", end: "20:30", instructions: "Aspiration, poubelles, sanitaires.", assignees: [nathan.id, chloe.id], leadId: sophie.id, status: MissionStatus.CANCELLED },
      { site: siteTilleuls, title: "Grand ménage mensuel", dayOffset: 4, start: "13:00", end: "17:00", instructions: "Ascenseurs, local poubelles, parking sous-sol.", assignees: [emma.id, ines.id, thomas.id], leadId: karim.id, status: MissionStatus.SCHEDULED },
      { site: siteTechcorp, title: "Entretien week-end", dayOffset: 5, start: "09:00", end: "12:00", instructions: "Nettoyage léger, accueil dégagé pour le lundi.", assignees: [chloe.id], leadId: undefined, status: MissionStatus.SCHEDULED },
    ];

    for (const seed of missionSeeds) {
      const dateStr = isoDate(addDays(today, seed.dayOffset));
      const mission = await prisma.mission.create({
        data: {
          siteId: seed.site.id,
          title: seed.title,
          date: dayOnly(dateStr),
          startTime: combineDateTime(dateStr, seed.start),
          endTime: combineDateTime(dateStr, seed.end),
          instructions: seed.instructions,
          status: seed.status,
          createdById: rh.id,
        },
      });
      if (seed.key) missionIds[seed.key] = mission.id;
      for (const userId of seed.assignees) {
        await prisma.missionAssignment.create({ data: { missionId: mission.id, userId, isLead: userId === seed.leadId } });
      }
    }
    console.log(`${missionSeeds.length} missions démo créées (semaine bien remplie).`);
  } else {
    console.log("Des missions existent déjà, création du planning démo ignorée.");
    const anyMission = await prisma.mission.findFirst({ where: { siteId: siteTilleuls.id } });
    if (anyMission) missionIds.todayInProgress = anyMission.id;
  }

  // ---------------------------------------------------------------- Actualités
  const welcomeTitle = "Bienvenue sur Deep Clean";
  if (!(await prisma.announcement.findFirst({ where: { title: welcomeTitle } }))) {
    await prisma.announcement.create({
      data: {
        authorId: directeur.id,
        title: welcomeTitle,
        body: "Bienvenue à toutes et à tous sur la nouvelle application Deep Clean ! Vous y retrouverez votre planning, vos missions, vos chantiers et toutes les informations utiles à votre travail au quotidien. N'hésitez pas à contacter la RH pour toute question.",
      },
    });
  }
  const commercialTitle = "Nouveau : module Commercial";
  if (!(await prisma.announcement.findFirst({ where: { title: commercialTitle } }))) {
    const coverBuffer = await fetchBuffer("https://picsum.photos/seed/deepclean-commercial/1200/700");
    const stored = coverBuffer ? await storeImage(coverBuffer) : null;
    await prisma.announcement.create({
      data: {
        authorId: rh.id,
        title: commercialTitle,
        body: "La gestion des prospects, devis, chantiers et factures est maintenant disponible directement dans l'application, sur mobile et sur ordinateur. Superviseurs, RH et direction peuvent y accéder depuis le menu « Commercial ».",
        coverPhotoKey: stored?.storageKey,
      },
    });
  }
  console.log("Actualités démo prêtes.");

  // ---------------------------------------------------------------- Signalements avec photo
  if (missionIds.todayInProgress) {
    const existingProblems = await prisma.problem.count();
    if (existingProblems === 0) {
      const p1 = await problemsService.createProblem({ userId: lucas.id, role: Role.EMPLOYEE }, {
        missionId: missionIds.todayInProgress,
        type: ProblemType.ISSUE,
        description: "Infiltration d'eau détectée dans le hall d'entrée, près de la loge du gardien.",
      });
      const photo1 = await fetchBuffer("https://picsum.photos/seed/deepclean-probleme-1/900/1200");
      if (photo1) await problemsService.addPhoto({ userId: lucas.id, role: Role.EMPLOYEE }, p1.id, photo1);

      const p2 = await problemsService.createProblem({ userId: emma.id, role: Role.EMPLOYEE }, {
        missionId: missionIds.todayInProgress,
        type: ProblemType.MISSING_MATERIAL,
        description: "Plus de recharges de savon pour les distributeurs des sanitaires du rez-de-chaussée.",
      });
      const photo2 = await fetchBuffer("https://picsum.photos/seed/deepclean-probleme-2/900/1200");
      if (photo2) await problemsService.addPhoto({ userId: emma.id, role: Role.EMPLOYEE }, p2.id, photo2);
      console.log("Signalements démo créés (avec photo).");
    }
  }

  // ================================================================ MODULE COMMERCIAL
  const hrActor = { userId: rh.id, role: Role.HR };
  const supActor = { userId: superviseur.id, role: Role.SUPERVISOR };

  if ((await prisma.prospect.count()) === 0) {
    console.log("Module commercial : prospects, clients, devis, facturation...");

    await prospectsService.createProspect(supActor, {
      companyName: "Cabinet Médical Verlaine", contactFirstName: "Alice", contactLastName: "Verlaine", jobTitle: "Gérante",
      phone: "0612345601", email: "a.verlaine@cabinet-verlaine.fr", address: "3 Rue Verlaine", postalCode: "75012", city: "Paris",
      source: "Recommandation", need: "Entretien hebdomadaire cabinet médical (3 salles + accueil).", status: "NEW",
    });
    await prospectsService.createProspect(supActor, {
      companyName: "Boulangerie Ferrand", contactFirstName: "Nicolas", contactLastName: "Ferrand", jobTitle: "Propriétaire",
      phone: "0612345602", email: "contact@boulangerie-ferrand.fr", address: "18 Rue de Belleville", postalCode: "75020", city: "Paris",
      source: "Site web", need: "Nettoyage quotidien laboratoire + vitrine.", status: "MEETING_SCHEDULED",
    });
    await prospectsService.createProspect(hrActor, {
      companyName: "Studio Yoga Ancrage", contactFirstName: "Léa", contactLastName: "Bonnet", jobTitle: "Fondatrice",
      phone: "0612345603", email: "lea@studio-ancrage.fr", address: "9 Rue de la Paix", postalCode: "75002", city: "Paris",
      source: "Réseaux sociaux", need: "Entretien 3x/semaine, 2 salles de pratique.", status: "NEGOTIATING",
    });
    await prospectsService.createProspect(hrActor, {
      companyName: "Garage Automax", contactFirstName: "Bruno", contactLastName: "Faure", jobTitle: "Directeur",
      phone: "0612345604", email: "b.faure@automax.fr", address: "56 Route de Meaux", postalCode: "93000", city: "Bobigny",
      source: "Salon professionnel", need: "Entretien atelier et accueil client.", status: "LOST", notes: "A choisi un prestataire déjà en place depuis 10 ans.",
    });
    const wonProspect = await prospectsService.createProspect(hrActor, {
      companyName: "Coworking Le Phare", contactFirstName: "Camille", contactLastName: "Nguyen", jobTitle: "Responsable des lieux",
      phone: "0612345605", email: "camille@lephare-coworking.fr", address: "27 Quai de Seine", postalCode: "75019", city: "Paris",
      source: "Recommandation", need: "Entretien quotidien espace de coworking, 400 m².", status: "WON",
    });

    // Prospect converti → client (workflow officiel §5-8), plus deux clients
    // créés directement pour que la liste Clients ne soit jamais vide.
    const clientPhare = await prospectsService.convertProspectToClient(hrActor, wonProspect.id);
    const clientTilleuls = await clientsService.createClient(hrActor, {
      companyName: "Syndic Résidence Les Tilleuls", contactFirstName: "Patrick", contactLastName: "Morel", jobTitle: "Syndic",
      phone: "0612345610", email: "p.morel@syndic-tilleuls.fr", billingAddress: "12 Rue des Tilleuls, 75015 Paris", postalCode: "75015", city: "Paris",
    });
    await clientsService.createClient(hrActor, {
      companyName: "TechCorp SAS", contactFirstName: "Julie", contactLastName: "Armand", jobTitle: "Office Manager",
      phone: "0612345611", email: "j.armand@techcorp.fr", billingAddress: "45 Avenue de la République, 75011 Paris", postalCode: "75011", city: "Paris",
    });

    // Devis n°1 — brouillon (jamais envoyé), pour montrer un devis en cours de rédaction.
    await quotesService.createQuote(hrActor, {
      clientId: clientTilleuls.id, subject: "Renouvellement contrat annuel 2026",
      contactName: "Patrick Morel", contactEmail: "p.morel@syndic-tilleuls.fr", billingAddress: "12 Rue des Tilleuls, 75015 Paris",
      items: [{ description: "Nettoyage parties communes", quantity: 3, unit: QuoteItemUnit.HOUR, unitPriceHt: 28, frequency: QuoteItemFrequency.MULTIPLE_PER_WEEK, occurrencesPerMonth: 12 }],
    });

    // Devis n°2 — envoyé, en attente de réponse (workflow complet DRAFT → TO_VALIDATE → VALIDATED → SENT).
    const quoteSent = await quotesService.createQuote(hrActor, {
      clientId: clientTilleuls.id, subject: "Vitrerie extérieure trimestrielle",
      contactName: "Patrick Morel", contactEmail: "p.morel@syndic-tilleuls.fr", billingAddress: "12 Rue des Tilleuls, 75015 Paris",
      items: [{ description: "Vitrerie façade + halls", quantity: 4, unit: QuoteItemUnit.HOUR, unitPriceHt: 32, frequency: QuoteItemFrequency.ONE_TIME }],
    });
    await quotesService.submitQuoteForValidation(hrActor, quoteSent.id);
    await quotesService.validateQuote(hrActor, quoteSent.id);
    await quotesService.sendQuote(hrActor, quoteSent.id);
    await quotesService.recordQuoteFollowUp(hrActor, quoteSent.id, { method: QuoteFollowUpMethod.EMAIL, comment: "Relance envoyée, en attente de retour du syndic." });

    // Devis n°3 — refusé.
    const quoteRejected = await quotesService.createQuote(hrActor, {
      clientId: clientTilleuls.id, subject: "Remise en état parking sous-sol",
      contactName: "Patrick Morel", contactEmail: "p.morel@syndic-tilleuls.fr", billingAddress: "12 Rue des Tilleuls, 75015 Paris",
      items: [{ description: "Nettoyage haute pression parking", quantity: 1, unit: QuoteItemUnit.FLAT_RATE, unitPriceHt: 1450, frequency: QuoteItemFrequency.ONE_TIME }],
    });
    await quotesService.submitQuoteForValidation(hrActor, quoteRejected.id);
    await quotesService.validateQuote(hrActor, quoteRejected.id);
    await quotesService.sendQuote(hrActor, quoteRejected.id);
    await quotesService.markQuoteRejected(hrActor, quoteRejected.id, { comment: "Budget non retenu cette année par la copropriété." });

    // Devis n°4 — accepté, base du nouveau chantier "Coworking Le Phare"
    // (workflow officiel §19-21 : la création du chantier reste une action
    // humaine explicite, jamais automatique).
    const quoteAccepted = await quotesService.createQuote(hrActor, {
      clientId: clientPhare.id, subject: "Entretien quotidien espace coworking",
      contactName: "Camille Nguyen", contactEmail: "camille@lephare-coworking.fr", billingAddress: "27 Quai de Seine, 75019 Paris",
      items: [
        { description: "Entretien quotidien espace coworking", quantity: 2, unit: QuoteItemUnit.HOUR, unitPriceHt: 27, frequency: QuoteItemFrequency.DAILY, occurrencesPerMonth: 22 },
        { description: "Vitrerie mensuelle", quantity: 2, unit: QuoteItemUnit.HOUR, unitPriceHt: 30, frequency: QuoteItemFrequency.MONTHLY, occurrencesPerMonth: 1 },
      ],
    });
    await quotesService.submitQuoteForValidation(hrActor, quoteAccepted.id);
    await quotesService.validateQuote(hrActor, quoteAccepted.id);
    await quotesService.sendQuote(hrActor, quoteAccepted.id);
    await quotesService.markQuoteAccepted(hrActor, quoteAccepted.id, { method: QuoteFollowUpMethod.EMAIL, comment: "Accepté par retour d'email." });

    const sitePhare = await sitesService.createSite(rh.id, {
      name: "Coworking Le Phare", address: "27 Quai de Seine, 75019 Paris",
      description: "Espace de coworking, 400 m², entretien quotidien.",
      managerId: sophie.id, supervisorId: superviseur.id, clientId: clientPhare.id, quoteId: quoteAccepted.id,
    });
    await prisma.siteMember.createMany({ data: [{ siteId: sitePhare.id, userId: sophie.id }, { siteId: sitePhare.id, userId: thomas.id }, { siteId: sitePhare.id, userId: ines.id }] });

    const period = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
    // Libellé de ligne lisible par le client (« octobre 2026 »), pas la clé technique AAAA-MM.
    const monthLabel = (d: Date) => new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(d);
    const periodLabel = monthLabel(today);
    await sitesService.upsertSiteTarget(hrActor, sitePhare.id, { period, plannedVisits: 22, plannedHours: 44, billingMode: "FLAT_RATE" });

    // Quelques prestations déjà réalisées ce mois-ci sur le nouveau chantier,
    // pour que l'anneau d'avancement affiche un pourcentage réel (jamais 0%).
    const realizedDays = [-4, -3, -2, -1];
    for (const offset of realizedDays) {
      const dateStr = isoDate(addDays(today, offset));
      await prisma.mission.create({
        data: {
          siteId: sitePhare.id, title: "Entretien quotidien espace coworking",
          date: dayOnly(dateStr), startTime: combineDateTime(dateStr, "07:00"), endTime: combineDateTime(dateStr, "09:00"),
          instructions: "Accueil, open space, sanitaires, salles de réunion.", status: MissionStatus.COMPLETED, createdById: rh.id,
          assignments: { create: [{ userId: sophie.id, isLead: true }, { userId: thomas.id }] },
        },
      });
    }
    await prisma.mission.create({
      data: {
        siteId: sitePhare.id, title: "Entretien quotidien espace coworking",
        date: dayOnly(isoDate(today)), startTime: combineDateTime(isoDate(today), "07:00"), endTime: combineDateTime(isoDate(today), "09:00"),
        instructions: "Accueil, open space, sanitaires, salles de réunion.", status: MissionStatus.SCHEDULED, createdById: rh.id,
        assignments: { create: [{ userId: sophie.id, isLead: true }, { userId: ines.id }] },
      },
    });

    // ---------------------------------------------------------------- Facturation
    // Facture n°1 — à préparer (brouillon).
    await invoicesService.createInvoice(hrActor, {
      clientId: clientTilleuls.id, period,
      contactName: "Patrick Morel", contactEmail: "p.morel@syndic-tilleuls.fr", billingAddress: "12 Rue des Tilleuls, 75015 Paris",
      items: [{ description: "Nettoyage parties communes — " + periodLabel, quantity: 36, unit: QuoteItemUnit.HOUR, unitPriceHt: 28 }],
    });

    // Facture n°2 — envoyée (référencée au devis et au chantier acceptés).
    const invoiceSent = await invoicesService.createInvoice(hrActor, {
      clientId: clientPhare.id, quoteId: quoteAccepted.id, siteId: sitePhare.id, period,
      contactName: "Camille Nguyen", contactEmail: "camille@lephare-coworking.fr", billingAddress: "27 Quai de Seine, 75019 Paris",
      items: [{ description: "Entretien quotidien espace coworking — " + periodLabel, quantity: 44, unit: QuoteItemUnit.HOUR, unitPriceHt: 27 }],
    });
    await invoicesService.validateInvoice(hrActor, invoiceSent.id);
    await invoicesService.sendInvoice(hrActor, invoiceSent.id);

    // Facture n°3 — payée (mois précédent, même chantier).
    const lastPeriodDate = addDays(today, -30);
    const lastPeriod = `${lastPeriodDate.getFullYear()}-${String(lastPeriodDate.getMonth() + 1).padStart(2, "0")}`;
    const invoicePaid = await invoicesService.createInvoice(hrActor, {
      clientId: clientPhare.id, quoteId: quoteAccepted.id, siteId: sitePhare.id, period: lastPeriod,
      contactName: "Camille Nguyen", contactEmail: "camille@lephare-coworking.fr", billingAddress: "27 Quai de Seine, 75019 Paris",
      items: [{ description: "Entretien quotidien espace coworking — " + monthLabel(lastPeriodDate), quantity: 44, unit: QuoteItemUnit.HOUR, unitPriceHt: 27 }],
    });
    await invoicesService.validateInvoice(hrActor, invoicePaid.id);
    await invoicesService.sendInvoice(hrActor, invoicePaid.id);
    await invoicesService.markInvoicePaid(hrActor, invoicePaid.id);

    console.log("Module commercial démo prêt : 5 prospects, 3 clients, 4 devis, 3 factures, 1 chantier créé depuis un devis accepté.");
  } else {
    console.log("Des prospects existent déjà, création des données commerciales démo ignorée.");
  }


  // ================================================================ VIE QUOTIDIENNE
  // Tout ce qui rend la démo vivante écran par écran : messagerie, pointages
  // à valider, congés, standards, fiche de poste, suivi des signalements,
  // validations. Chaque bloc ne s'ajoute qu'une fois (jamais de doublon si le
  // script est relancé) et passe par les vrais services de l'application.
  const actor = (u: { id: string; role: Role }) => ({ userId: u.id, role: u.role });

  // Téléphones (le bouton d'appel de la messagerie a besoin d'un numéro).
  const phones: Array<[{ id: string }, string]> = [
    [rh, "+33 6 12 34 56 78"], [directeur, "+33 6 23 45 67 89"], [superviseur, "+33 6 34 56 78 90"], [karim, "+33 6 45 67 89 01"],
    [sophie, "+33 6 56 78 90 12"], [lucas, "+33 6 67 89 01 23"], [emma, "+33 6 78 90 12 34"], [nathan, "+33 6 89 01 23 45"],
    [chloe, "+33 6 90 12 34 56"], [ines, "+33 7 01 23 45 67"], [thomas, "+33 7 12 34 56 78"],
  ];
  for (const [u, phone] of phones) await prisma.user.update({ where: { id: u.id }, data: { phone } });

  // Messagerie : trois fils à deux et un groupe de chantier avec un PDF.
  if ((await prisma.conversation.count()) === 0) {
    const say = (u: { id: string; role: Role }, conversationId: string, body: string) =>
      messagesService.sendMessage(actor(u), { conversationId, body });
    const withKarim = await messagesService.getOrCreateDirectConversation(actor(karim), rh.id);
    await say(karim, withKarim.id, "Bonjour Marie, l'équipe est au complet ce matin au Phare.");
    await say(rh, withKarim.id, "Parfait, merci Karim ! Pensez à faire pointer tout le monde.");
    await say(karim, withKarim.id, "C'est fait 👍 On attaque le 2e étage à 10 h.");
    const withLucas = await messagesService.getOrCreateDirectConversation(actor(lucas), rh.id);
    await say(lucas, withLucas.id, "Bonjour, est-ce que je peux poser mon vendredi 17 ?");
    const withYasmine = await messagesService.getOrCreateDirectConversation(actor(superviseur), rh.id);
    await say(superviseur, withYasmine.id, "Planning de la semaine prochaine validé, je l'envoie à l'équipe.");

    const group = await messagesService.createGroupConversation(actor(rh), {
      title: "Chantier Le Phare",
      participantIds: [karim.id, superviseur.id, lucas.id, emma.id],
    });
    await say(rh, group.id, "Bonjour à tous 👋 Point d'équipe demain 8 h devant le Phare.");
    await say(karim, group.id, "Bien noté, je préviens l'équipe du matin.");
    await say(superviseur, group.id, "Je passe vers 9 h pour la validation des heures.");
    await messagesService.sendMessage(actor(rh), { conversationId: group.id, body: "Les consignes de sécurité mises à jour 👇" }, {
      document: { buffer: await buildSafetyPdf(), fileName: "Consignes-securite-Le-Phare.pdf" },
    });
    await say(emma, group.id, "Merci, c'est noté !");
    console.log("Messagerie démo prête (3 conversations + 1 groupe avec PDF).");
  }

  // Pointages différés en attente : de quoi remplir « Validation des heures ».
  if ((await prisma.timeEntry.count()) === 0) {
    const at = (daysAgo: number, time: string) => combineDateTime(isoDate(addDays(today, -daysAgo)), time).toISOString();
    const entries: Array<[{ id: string; role: Role }, number, string, string, string | undefined]> = [
      // Jamais plus de 7 jours en arrière (règle des pointages différés), et
      // toujours dans le passé même si la démo est préparée la veille.
      [lucas, 2, "07:02", "09:05", "Badgeuse en panne à l'arrivée"],
      [lucas, 3, "08:00", "11:10", undefined],
      [emma, 3, "07:55", "11:00", "Oubli de pointer"],
      [nathan, 3, "18:00", "20:30", undefined],
      [chloe, 3, "18:05", "20:40", "Téléphone déchargé"],
    ];
    for (const [u, daysAgo, start, end, comment] of entries) {
      await timesheetsService.createRetroactiveTimeEntry(actor(u), { clockIn: at(daysAgo, start), clockOut: at(daysAgo, end), comment });
    }
    console.log("Pointages démo prêts (5 en attente de validation).");
  }

  // Deux demandes de congé à approuver.
  if ((await prisma.absence.count()) === 0) {
    await absencesService.createAbsence(actor(emma), {
      type: "PAID_LEAVE", startDate: isoDate(addDays(today, 18)), endDate: isoDate(addDays(today, 22)), reason: "Vacances en famille",
    });
    await absencesService.createAbsence(actor(nathan), {
      type: "SICK_LEAVE", startDate: isoDate(addDays(today, 4)), endDate: isoDate(addDays(today, 5)),
    });
    console.log("Demandes de congé démo prêtes.");
  }

  // Standards de nettoyage de la Résidence Les Tilleuls.
  if ((await prisma.cleaningStandard.count()) === 0) {
    await standardsService.createStandard(actor(superviseur), {
      siteId: siteTilleuls.id,
      name: "Parties communes · passage hebdomadaire",
      tasks: ["Balayer et laver le hall d'entrée", "Nettoyer les vitres de la porte d'entrée", "Dépoussiérer les boîtes aux lettres", "Laver les escaliers du RDC au 5e étage", "Vider les poubelles du local vélos"],
      equipment: ["Autolaveuse compacte", "Seau et frange microfibre", "Produit vitres", "Gants nitrile"],
      safetyInstructions: "Poser le panneau « Sol glissant » pendant le lavage du hall. Ne jamais mélanger javel et détartrant.",
      notes: "Passage le mardi matin, avant 10 h.",
    });
    await standardsService.createStandard(actor(superviseur), {
      siteId: siteTilleuls.id,
      name: "Local poubelles · désinfection mensuelle",
      tasks: ["Sortir les conteneurs", "Laver le sol au jet", "Désinfecter les conteneurs"],
      equipment: ["Nettoyeur haute pression", "Désinfectant bactéricide"],
      safetyInstructions: "Porter lunettes et gants pendant la désinfection.",
    });
    console.log("Standards de nettoyage démo prêts.");
  }

  // Fiche de poste sur la prochaine désinfection de la clinique.
  if ((await prisma.jobSheet.count()) === 0) {
    const nextClinic = await prisma.mission.findFirst({
      where: { siteId: siteClinique.id, status: MissionStatus.SCHEDULED, date: { gte: dayOnly(isoDate(today)) } },
      orderBy: { startTime: "asc" },
    });
    if (nextClinic) {
      await missionsService.upsertJobSheet(actor(superviseur), nextClinic.id, {
        tasks: ["Aérer chaque salle 10 minutes avant de commencer", "Désinfecter tables d'examen, poignées et interrupteurs", "Nettoyer les lavabos et recharger savon et essuie-mains", "Laver le sol du couloir à la frange microfibre", "Vider les poubelles DASRI dans le local dédié"],
        equipment: ["Désinfectant virucide EN 14476", "Lingettes à usage unique", "Chariot de lavage double seau", "Gants nitrile et masque FFP2"],
        safetyInstructions: "Ne jamais toucher le contenu des boîtes à aiguilles. Respecter le circuit propre / sale indiqué par la clinique.",
        notes: "Badge d'accès à récupérer à l'accueil, porte B.",
      });
      console.log("Fiche de poste démo prête.");
    }
  }

  // Suivi d'un signalement (fil de commentaires).
  const leak = await prisma.problem.findFirst({ where: { description: { startsWith: "Infiltration d'eau" } } });
  if (leak && (await prisma.problemComment.count({ where: { problemId: leak.id } })) === 0) {
    await problemsService.addComment(actor(karim), leak.id, "J'ai prévenu le syndic, un plombier passe demain matin.");
    await problemsService.addComment(actor(directeur), leak.id, "Merci. Pensez à baliser la zone en attendant.");
    console.log("Suivi de signalement démo prêt.");
  }

  // Missions terminées validées par la superviseure (sauf les deux dernières,
  // laissées « à valider » pour la démonstration).
  if ((await prisma.validation.count()) === 0) {
    const completed = await prisma.mission.findMany({ where: { status: MissionStatus.COMPLETED }, orderBy: { endTime: "desc" } });
    for (const mission of completed.slice(2)) {
      await missionsService.validateMission(actor(superviseur), mission.id);
    }
    console.log(`${Math.max(0, completed.length - 2)} missions terminées validées.`);
  }

  console.log("\nTerminé. Comptes de démo (mot de passe commun : " + DEMO_PASSWORD + ") :");
  console.log(`  RH ................. ${rh.username}`);
  console.log(`  Direction .......... ${directeur.username}`);
  console.log(`  Superviseur ........ ${superviseur.username}`);
  console.log(`  Chef d'équipe ...... ${karim.username} / ${sophie.username}`);
  console.log(`  Employé ............ ${lucas.username} / ${emma.username} / ${nathan.username} / ${chloe.username}`);
}

main()
  .catch((err) => {
    console.error("Échec du seed de présentation :", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
