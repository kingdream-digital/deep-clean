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
import fs from "node:fs";
import path from "node:path";
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

// DEMO_RESET=1 : repart d'une base vide avant de charger la démo, en ne
// gardant QUE les comptes administrateur technique (retour explicite du
// client : supprimer ses essais, garder son accès admin). Toutes les autres
// données (comptes, chantiers, missions, pointages, devis, messages...) sont
// effacées. Réservé au serveur de démonstration, comme le reste du script.
async function wipeExceptAdmins(): Promise<void> {
  const admins = await prisma.user.findMany({ where: { role: Role.ADMIN }, select: { id: true } });
  const adminIds = admins.map((a) => a.id);
  await prisma.activityLog.deleteMany();
  await prisma.leaveTransaction.deleteMany();
  await prisma.absence.deleteMany();
  await prisma.timeEntry.deleteMany();
  await prisma.validation.deleteMany();
  await prisma.photo.deleteMany();
  await prisma.problemComment.deleteMany();
  await prisma.problem.deleteMany();
  await prisma.missionAssignment.deleteMany();
  await prisma.jobSheet.deleteMany();
  await prisma.mission.deleteMany();
  await prisma.cleaningStandard.deleteMany();
  await prisma.siteTarget.deleteMany();
  await prisma.siteMember.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.site.deleteMany();
  await prisma.quote.deleteMany();
  await prisma.client.deleteMany();
  await prisma.prospect.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.message.deleteMany();
  await prisma.conversationParticipant.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.announcement.deleteMany();
  await prisma.employeeDocument.deleteMany();
  await prisma.pushToken.deleteMany({ where: { userId: { notIn: adminIds } } });
  await prisma.session.deleteMany({ where: { userId: { notIn: adminIds } } });
  const removed = await prisma.user.deleteMany({ where: { role: { not: Role.ADMIN } } });
  console.log(`Remise à zéro : ${removed.count} compte(s) supprimé(s), ${adminIds.length} compte(s) admin conservé(s).`);
}

async function assertSafeTarget(): Promise<void> {
  if (env.isProduction && process.env.DEMO_MODE !== "1") {
    throw new Error(
      "Serveur en production : ce script crée des comptes au mot de passe public. Il ne se lance que sur un serveur de démonstration, avec DEMO_MODE=1 devant la commande."
    );
  }
  if (process.env.DEMO_RESET === "1") {
    await wipeExceptAdmins();
    return;
  }
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

  // Dates d'entrée réalistes : les soldes de congés de la démo ressemblent à
  // ceux d'une vraie équipe (sinon tout le monde démarre à 0 jour acquis).
  const hireDates: Array<[{ id: string }, string]> = [
    [rh, "2019-03-01"], [directeur, "2015-09-01"], [superviseur, "2021-01-04"], [karim, "2020-06-15"],
    [sophie, "2022-02-01"], [lucas, "2023-09-04"], [emma, "2024-01-08"], [nathan, "2022-11-14"],
    [chloe, "2025-03-03"], [ines, "2024-06-03"], [thomas, "2023-04-17"],
  ];
  for (const [u, date] of hireDates) await prisma.user.update({ where: { id: u.id }, data: { hireDate: dayOnly(date) } });

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

  // ---------------------------------------------------------------- Chantiers, tous issus d'un devis accepté
  // Retour explicite du client : en démo, chaque chantier vient d'un devis
  // (client → devis → validation → envoi → accepté → chantier), pour montrer
  // le suivi complet. Tout passe par les vrais services métier.
  const hrActor = { userId: rh.id, role: Role.HR };
  const supActor = { userId: superviseur.id, role: Role.SUPERVISOR };

  async function siteFromAcceptedQuote(spec: {
    client: { companyName: string; contactFirstName: string; contactLastName: string; jobTitle: string; phone: string; email: string; postalCode: string; city: string };
    site: { name: string; address: string; description: string; managerId: string };
    subject: string;
    items: Array<{ description: string; quantity: number; unit: QuoteItemUnit; unitPriceHt: number; frequency: QuoteItemFrequency; occurrencesPerMonth?: number }>;
    acceptedNote: string;
  }) {
    const existing = await prisma.site.findFirst({ where: { name: spec.site.name } });
    if (existing) return existing;
    const client =
      (await prisma.client.findFirst({ where: { companyName: spec.client.companyName } })) ??
      (await clientsService.createClient(hrActor, { ...spec.client, billingAddress: spec.site.address }));
    const contactName = `${spec.client.contactFirstName} ${spec.client.contactLastName}`;
    const quote = await quotesService.createQuote(hrActor, {
      clientId: client.id, subject: spec.subject, contactName, contactEmail: spec.client.email, billingAddress: spec.site.address, items: spec.items,
    });
    await quotesService.submitQuoteForValidation(hrActor, quote.id);
    await quotesService.validateQuote(hrActor, quote.id);
    await quotesService.sendQuote(hrActor, quote.id);
    await quotesService.markQuoteAccepted(hrActor, quote.id, { method: QuoteFollowUpMethod.EMAIL, comment: spec.acceptedNote });
    return sitesService.createSite(rh.id, {
      name: spec.site.name, address: spec.site.address, description: spec.site.description,
      managerId: spec.site.managerId, supervisorId: superviseur.id, clientId: client.id, quoteId: quote.id,
    });
  }

  const siteTilleuls = await siteFromAcceptedQuote({
    client: { companyName: "Syndic Résidence Les Tilleuls", contactFirstName: "Patrick", contactLastName: "Morel", jobTitle: "Syndic", phone: "0612345610", email: "p.morel@syndic-tilleuls.fr", postalCode: "75015", city: "Paris" },
    site: { name: "Résidence Les Tilleuls", address: "12 Rue des Tilleuls, 75015 Paris", description: "Copropriété résidentielle, 6 étages, parties communes et halls d'entrée.", managerId: karim.id },
    subject: "Entretien des parties communes",
    items: [{ description: "Nettoyage parties communes (halls, escaliers, vitres RDC)", quantity: 3, unit: QuoteItemUnit.HOUR, unitPriceHt: 28, frequency: QuoteItemFrequency.MULTIPLE_PER_WEEK, occurrencesPerMonth: 12 }],
    acceptedNote: "Accepté en assemblée générale de copropriété.",
  });
  const siteTechcorp = await siteFromAcceptedQuote({
    client: { companyName: "TechCorp SAS", contactFirstName: "Julie", contactLastName: "Armand", jobTitle: "Office Manager", phone: "0612345611", email: "j.armand@techcorp.fr", postalCode: "75011", city: "Paris" },
    site: { name: "Bureaux TechCorp", address: "45 Avenue de la République, 75011 Paris", description: "Open space et bureaux fermés sur 3 étages, entretien en soirée.", managerId: sophie.id },
    subject: "Entretien des bureaux en soirée",
    items: [
      { description: "Entretien bureaux et sanitaires", quantity: 2.5, unit: QuoteItemUnit.HOUR, unitPriceHt: 27, frequency: QuoteItemFrequency.MULTIPLE_PER_WEEK, occurrencesPerMonth: 8 },
      { description: "Shampoing moquette open space (remise en état à la prise du chantier)", quantity: 1, unit: QuoteItemUnit.FLAT_RATE, unitPriceHt: 380, frequency: QuoteItemFrequency.ONE_TIME },
    ],
    acceptedNote: "Bon pour accord signé par l'office manager.",
  });
  const siteClinique = await siteFromAcceptedQuote({
    client: { companyName: "Clinique Saint-Michel", contactFirstName: "Hélène", contactLastName: "Garnier", jobTitle: "Cadre de santé", phone: "0612345612", email: "h.garnier@clinique-saint-michel.fr", postalCode: "75005", city: "Paris" },
    site: { name: "Clinique Saint-Michel", address: "8 Boulevard Saint-Michel, 75005 Paris", description: "Nettoyage sanitaire renforcé, protocoles spécifiques.", managerId: karim.id },
    subject: "Désinfection hebdomadaire des salles de consultation",
    items: [{ description: "Désinfection salles de consultation (protocole virucide)", quantity: 2, unit: QuoteItemUnit.HOUR, unitPriceHt: 35, frequency: QuoteItemFrequency.WEEKLY, occurrencesPerMonth: 4 }],
    acceptedNote: "Accepté après visite du site avec la cadre de santé.",
  });

  const siteBoutique = await siteFromAcceptedQuote({
    client: { companyName: "Atelier Rivoli", contactFirstName: "Sarah", contactLastName: "Lenoir", jobTitle: "Gérante", phone: "0612345613", email: "s.lenoir@atelier-rivoli.fr", postalCode: "75001", city: "Paris" },
    site: { name: "Boutique Atelier Rivoli", address: "112 Rue de Rivoli, 75001 Paris", description: "Boutique de prêt-à-porter, entretien chaque matin avant l'ouverture : vitrine, sol, cabines, caisse.", managerId: sophie.id },
    subject: "Entretien quotidien avant ouverture",
    items: [{ description: "Entretien boutique avant ouverture (vitrine, sol, cabines)", quantity: 1, unit: QuoteItemUnit.HOUR, unitPriceHt: 29, frequency: QuoteItemFrequency.DAILY, occurrencesPerMonth: 24 }],
    acceptedNote: "Devis signé en boutique.",
  });

  // Position GPS fixe de chaque chantier (adresses de démonstration) : c'est
  // elle qui sert à calculer la distance du pointage au chantier.
  const SITE_POSITIONS: Array<[{ id: string }, number, number]> = [
    [siteTilleuls, 48.84121, 2.29372], [siteTechcorp, 48.86492, 2.37998],
    [siteClinique, 48.85301, 2.34392], [siteBoutique, 48.86013, 2.34461],
  ];
  for (const [site, latitude, longitude] of SITE_POSITIONS) {
    await prisma.site.update({ where: { id: site.id }, data: { latitude, longitude } });
  }

  const teamMembers: Array<{ siteId: string; userId: string }> = [
    { siteId: siteBoutique.id, userId: sophie.id }, { siteId: siteBoutique.id, userId: thomas.id }, { siteId: siteBoutique.id, userId: chloe.id },
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

  // DEMO_HEURE=HH:mm : heure de la présentation. Les missions du jour sont
  // alors placées autour de cette heure (une terminée avant, une en cours, les
  // suivantes après) au lieu des horaires du matin : une démo à 18 h montrait
  // sinon une mission « en cours » depuis 8 h et une autre de 14 h encore
  // planifiée.
  const demoHour = process.env.DEMO_HEURE;
  if (demoHour && !/^([01]\d|2[0-3]):[0-5]\d$/.test(demoHour)) throw new Error("DEMO_HEURE doit être au format HH:mm, par exemple 18:00.");
  const todaySlot = (defaultTime: string, hoursFromDemo: number): string => {
    if (!demoHour) return defaultTime;
    const [h = 0, m = 0] = demoHour.split(":").map(Number);
    const minutes = Math.min(Math.max(h * 60 + m + Math.round(hoursFromDemo * 60), 0), 23 * 60 + 59);
    return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  };

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
      { site: siteTechcorp, title: "Grand nettoyage open space", dayOffset: 0, start: todaySlot("06:30", -4), end: todaySlot("08:30", -2), instructions: "Vitres intérieures, moquette, cuisine partagée.", assignees: [nathan.id, chloe.id, sophie.id], leadId: sophie.id, status: MissionStatus.COMPLETED },
      { site: siteTilleuls, title: "Nettoyage parties communes", dayOffset: 0, start: todaySlot("08:00", -1), end: todaySlot("11:00", 2), instructions: "Hall d'entrée, cages d'escalier.", assignees: [lucas.id, emma.id, ines.id], leadId: karim.id, status: MissionStatus.IN_PROGRESS, key: "todayInProgress" },
      { site: siteClinique, title: "Désinfection salles de consultation", dayOffset: 0, start: todaySlot("14:00", 2.5), end: todaySlot("16:00", 4.5), instructions: "Protocole sanitaire renforcé, salles 7 à 12.", assignees: [lucas.id, karim.id], leadId: karim.id, status: MissionStatus.SCHEDULED },
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

  // Objectifs du mois sur chaque chantier (anneau d'avancement de la fiche).
  {
    const targetPeriod = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
    const targets: Array<[{ id: string }, number, number]> = [[siteTilleuls, 12, 36], [siteTechcorp, 8, 20], [siteClinique, 4, 8]];
    for (const [site, plannedVisits, plannedHours] of targets) {
      await sitesService.upsertSiteTarget(hrActor, site.id, { period: targetPeriod, plannedVisits, plannedHours, billingMode: "FLAT_RATE" });
    }
  }

  // ================================================================ MODULE COMMERCIAL

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
    // Clients déjà créés avec leur chantier (devis acceptés, plus haut).
    const clientTilleuls = await prisma.client.findFirstOrThrow({ where: { companyName: "Syndic Résidence Les Tilleuls" } });

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
    await prisma.site.update({ where: { id: sitePhare.id }, data: { latitude: 48.88652, longitude: 2.37271 } });
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
        date: dayOnly(isoDate(today)), startTime: combineDateTime(isoDate(today), todaySlot("09:30", 1)), endTime: combineDateTime(isoDate(today), todaySlot("11:30", 3)),
        instructions: "Accueil, open space, sanitaires, salles de réunion.", status: MissionStatus.SCHEDULED, createdById: rh.id,
        assignments: { create: [{ userId: sophie.id, isLead: true }, { userId: thomas.id }] },
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

    console.log("Module commercial démo prêt : 5 prospects, 4 clients, 7 devis, 3 factures, 5 chantiers créés depuis un devis accepté.");
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
      // Deux écarts volontaires avec la mission prévue, pour montrer l'alerte
      // « de moins / de plus que prévu » de la validation des heures.
      [lucas, 2, "07:02", "08:05", "Badgeuse en panne à l'arrivée"],
      [lucas, 3, "08:00", "11:10", undefined],
      [emma, 3, "07:55", "11:00", "Oubli de pointer"],
      [nathan, 3, "18:00", "21:45", "Réunion du client prolongée, ménage commencé plus tard"],
      [chloe, 3, "18:05", "20:40", "Téléphone déchargé"],
    ];
    for (const [u, daysAgo, start, end, comment] of entries) {
      await timesheetsService.createRetroactiveTimeEntry(actor(u), { clockIn: at(daysAgo, start), clockOut: at(daysAgo, end), comment });
    }
    console.log("Pointages démo prêts (5 en attente de validation).");
  }

  // Pointages « terrain » complets, comme en vrai (retour explicite du
  // client, c'est le but premier du pointage photo) : photo de la devanture
  // ou de l'entrée du chantier prise par l'employé à son arrivée ET à son
  // départ, position GPS capturée aux deux moments. Un pointage dont la
  // sortie est faite loin du chantier montre l'alerte de distance.
  if ((await prisma.timeEntry.count({ where: { clockInPhotoKey: { not: null } } })) === 0) {
    const photoDir = path.join(__dirname, "demo-photos");
    const storePhoto = async (file: string) => {
      try {
        return (await storeImage(fs.readFileSync(path.join(photoDir, file)))).storageKey;
      } catch {
        return null;
      }
    };
    // Décale une position de quelques mètres (nord / est) : un téléphone ne
    // donne jamais exactement le point du chantier.
    const near = (lat: number, lng: number, northM: number, eastM: number) => ({
      latitude: lat + northM / 111_320,
      longitude: lng + eastM / (111_320 * Math.cos((lat * Math.PI) / 180)),
    });
    const boutique = { lat: 48.86013, lng: 2.34461 };
    const tilleuls = { lat: 48.84121, lng: 2.29372 };

    // Missions de la boutique (ce matin et hier matin), avant ouverture.
    const boutiqueMission = async (dayOffset: number, userId: string, status: MissionStatus) => {
      const dateStr = isoDate(addDays(today, dayOffset));
      return prisma.mission.create({
        data: {
          siteId: siteBoutique.id, title: "Entretien avant ouverture", date: dayOnly(dateStr),
          startTime: combineDateTime(dateStr, "07:30"), endTime: combineDateTime(dateStr, "08:30"),
          instructions: "Vitrine intérieure, sol de la boutique, cabines d'essayage, comptoir de caisse.",
          status, createdById: superviseur.id, assignments: { create: [{ userId, isLead: false }] },
        },
      });
    };
    await boutiqueMission(0, thomas.id, MissionStatus.COMPLETED);
    await boutiqueMission(-1, chloe.id, MissionStatus.COMPLETED);

    const todayStr = isoDate(today);
    const yesterdayStr = isoDate(addDays(today, -1));
    const devanture = await storePhoto("boutique-devanture.jpg");
    const devantureSortie = await storePhoto("boutique-devanture-depart.jpg");
    const devantureHier = await storePhoto("boutique-devanture.jpg");
    const devantureHierSortie = await storePhoto("boutique-devanture-depart.jpg");
    const entreeResidence = await storePhoto("residence-entree.jpg");

    // Thomas, ce matin : arrivée et départ devant la boutique (quelques mètres).
    const thomasIn = near(boutique.lat, boutique.lng, 6, -4);
    const thomasOut = near(boutique.lat, boutique.lng, -3, 5);
    await prisma.timeEntry.create({
      data: {
        userId: thomas.id, clockIn: combineDateTime(todayStr, "07:27"), clockOut: combineDateTime(todayStr, "08:34"),
        clockInLatitude: thomasIn.latitude, clockInLongitude: thomasIn.longitude, clockInAccuracy: 8, clockInPhotoKey: devanture,
        clockOutLatitude: thomasOut.latitude, clockOutLongitude: thomasOut.longitude, clockOutAccuracy: 11, clockOutPhotoKey: devantureSortie,
      },
    });

    // Chloé, hier : arrivée devant la boutique, mais sortie pointée à 1,3 km
    // (dans le métro) — l'alerte de distance s'affiche à la validation.
    const chloeIn = near(boutique.lat, boutique.lng, 4, 7);
    const chloeOut = near(boutique.lat, boutique.lng, 1150, 620);
    await prisma.timeEntry.create({
      data: {
        userId: chloe.id, clockIn: combineDateTime(yesterdayStr, "07:31"), clockOut: combineDateTime(yesterdayStr, "08:29"),
        clockInLatitude: chloeIn.latitude, clockInLongitude: chloeIn.longitude, clockInAccuracy: 9, clockInPhotoKey: devantureHier,
        clockOutLatitude: chloeOut.latitude, clockOutLongitude: chloeOut.longitude, clockOutAccuracy: 24, clockOutPhotoKey: devantureHierSortie,
      },
    });

    // Lucas, en poste en ce moment sur la mission en cours de la résidence :
    // arrivée pointée avec la photo de l'entrée de l'immeuble.
    const inProgress = missionIds.todayInProgress
      ? await prisma.mission.findUnique({ where: { id: missionIds.todayInProgress } })
      : null;
    if (inProgress) {
      const arrival = new Date(inProgress.startTime.getTime() - 3 * 60_000);
      const lucasIn = near(tilleuls.lat, tilleuls.lng, -5, 3);
      await prisma.timeEntry.create({
        data: {
          userId: lucas.id, clockIn: arrival,
          clockInLatitude: lucasIn.latitude, clockInLongitude: lucasIn.longitude, clockInAccuracy: 7, clockInPhotoKey: entreeResidence,
        },
      });
    }
    console.log("Pointages terrain démo prêts (photos d'arrivée et de départ, positions GPS).");
  }

  // Deux demandes de congé à approuver.
  if ((await prisma.absence.count()) === 0) {
    await absencesService.createAbsence(actor(emma), {
      type: "PAID_LEAVE", startDate: isoDate(addDays(today, 18)), endDate: isoDate(addDays(today, 22)), reason: "Vacances en famille",
    });
    await absencesService.createAbsence(actor(nathan), {
      type: "SICK_LEAVE", startDate: isoDate(addDays(today, 4)), endDate: isoDate(addDays(today, 5)),
    });
    // Une demande déjà acceptée par la superviseure (statut « Approuvée »).
    const approved = await absencesService.createAbsence(actor(thomas), {
      type: "PAID_LEAVE", startDate: isoDate(addDays(today, 30)), endDate: isoDate(addDays(today, 34)), reason: "Mariage d'un proche",
    });
    await absencesService.decideAbsence(actor(superviseur), approved.id, { status: "APPROVED", decisionNote: "Bon congé !" });
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

  // Signalements dans chaque étape du suivi (Nouveau → En cours → Traité →
  // Validé), des deux types, avec photo et échanges : aucun écran vide.
  if ((await prisma.problem.count()) <= 2) {
    const lastMission = (siteId: string) =>
      prisma.mission.findFirstOrThrow({ where: { siteId, status: MissionStatus.COMPLETED }, orderBy: { endTime: "desc" } });
    const sitePhare = await prisma.site.findFirst({ where: { name: "Coworking Le Phare" } });
    const addPhoto = async (problemId: string, by: { id: string; role: Role }, seed: string) => {
      const photo = await fetchBuffer(`https://picsum.photos/seed/${seed}/900/1200`);
      if (photo) await problemsService.addPhoto(actor(by), problemId, photo);
    };

    const vacuum = await problemsService.createProblem(actor(nathan), {
      missionId: (await lastMission(siteTechcorp.id)).id, type: ProblemType.MISSING_MATERIAL,
      description: "L'aspirateur dorsal ne démarre plus, batterie à remplacer.",
    });
    await addPhoto(vacuum.id, nathan, "deepclean-aspirateur");
    await problemsService.setProblemStatus(actor(superviseur), vacuum.id, "IN_PROGRESS");
    await problemsService.addComment(actor(sophie), vacuum.id, "Batterie commandée, livraison prévue jeudi. On prend l'aspirateur de secours en attendant.");

    const door = await problemsService.createProblem(actor(lucas), {
      missionId: (await lastMission(siteClinique.id)).id, type: ProblemType.ISSUE,
      description: "La porte du local DASRI ne ferme plus à clé.",
    });
    await addPhoto(door.id, lucas, "deepclean-porte");
    await problemsService.setProblemStatus(actor(superviseur), door.id, "IN_PROGRESS");
    await problemsService.addComment(actor(karim), door.id, "Serrurier passé ce matin, la porte ferme de nouveau.");
    await problemsService.setProblemStatus(actor(superviseur), door.id, "RESOLVED");

    if (sitePhare) {
      const stain = await problemsService.createProblem(actor(thomas), {
        missionId: (await lastMission(sitePhare.id)).id, type: ProblemType.ISSUE,
        description: "Grosse tache de café sur la moquette de la salle de réunion « Océan ».",
      });
      await addPhoto(stain.id, thomas, "deepclean-moquette");
      await problemsService.setProblemStatus(actor(superviseur), stain.id, "IN_PROGRESS");
      await problemsService.addComment(actor(sophie), stain.id, "Détachage fait avec l'injecteur-extracteur, plus aucune trace.");
      await problemsService.setProblemStatus(actor(superviseur), stain.id, "RESOLVED");
      await problemsService.addComment(actor(directeur), stain.id, "Vérifié sur place avec la cliente, parfait.");
      await problemsService.setProblemStatus(actor(directeur), stain.id, "VALIDATED");
    }
    console.log("Signalements démo prêts (nouveau, en cours, traité, validé).");
  }

  // Quatre mois d'historique (retour explicite du client : chacun revoit ses
  // heures des mois passés). Missions récurrentes terminées et validées, avec
  // des pointages validés proches des horaires prévus. Créé directement en
  // base, sans notifications : ce passé ne doit pas inonder les écrans.
  const historyStart = dayOnly(isoDate(addDays(today, -10)));
  if ((await prisma.mission.count({ where: { date: { lt: historyStart } } })) === 0) {
    const patterns = [
      { site: siteTilleuls, title: "Nettoyage parties communes", weekdays: [1, 3, 5], start: "08:00", end: "11:00", team: [lucas, emma, ines], lead: karim },
      { site: siteTechcorp, title: "Entretien bureaux étage 2", weekdays: [2, 4], start: "18:00", end: "20:30", team: [nathan, chloe, thomas], lead: sophie },
      { site: siteClinique, title: "Désinfection salles de consultation", weekdays: [6], start: "09:00", end: "11:00", team: [lucas, nathan], lead: karim },
    ];
    let state = 7;
    const rand = (max: number) => {
      state = (state * 9301 + 49297) % 233280;
      return Math.floor((state / 233280) * max);
    };
    const entries: Array<{ userId: string; clockIn: Date; clockOut: Date; status: "VALIDATED"; validatedById: string; validatedAt: Date }> = [];
    let created = 0;
    for (let offset = -122; offset <= -11; offset++) {
      const day = addDays(today, offset);
      const dateStr = isoDate(day);
      for (const pattern of patterns) {
        if (!pattern.weekdays.includes(day.getDay())) continue;
        const people = [...pattern.team, pattern.lead];
        const start = combineDateTime(dateStr, pattern.start);
        const end = combineDateTime(dateStr, pattern.end);
        const mission = await prisma.mission.create({
          data: {
            siteId: pattern.site.id, title: pattern.title, date: dayOnly(dateStr), startTime: start, endTime: end,
            status: MissionStatus.COMPLETED, createdById: superviseur.id,
            assignments: { create: people.map((u) => ({ userId: u.id, isLead: u.id === pattern.lead.id })) },
          },
        });
        await prisma.validation.create({
          data: { type: "MISSION_COMPLETION", missionId: mission.id, validatedById: superviseur.id, createdAt: new Date(end.getTime() + 2 * 3600_000) },
        });
        for (const person of people) {
          entries.push({
            userId: person.id,
            clockIn: new Date(start.getTime() + (rand(11) - 8) * 60_000),
            clockOut: new Date(end.getTime() + (rand(13) - 3) * 60_000),
            status: "VALIDATED",
            validatedById: superviseur.id,
            validatedAt: new Date(end.getTime() + 20 * 3600_000),
          });
        }
        created += 1;
      }
    }
    await prisma.timeEntry.createMany({ data: entries });
    console.log(`Historique démo prêt : ${created} missions et ${entries.length} pointages validés sur 4 mois.`);
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
