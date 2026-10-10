/**
 * Jeu de DÉMONSTRATION : deux entreprises clientes de la plateforme.
 *
 * - « deep-clean » : Deep Clean (Lyon), première entreprise utilisatrice —
 *   équipe complète, clients, catalogue, devis, factures, planning ;
 * - « net-eclat » : une seconde entreprise, pour montrer que chacune ne voit
 *   que ses propres données.
 *
 * Garde-fous : refuse de tourner sans DEMO_MODE=1, et refuse si l'entreprise
 * de démonstration existe déjà. Mot de passe commun des comptes de démo :
 * DemoAussitot2026! (à ne JAMAIS utiliser sur une installation réelle).
 *
 *   DEMO_MODE=1 npm run db:seed
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";
import { addDays, startOfWeek, type Role } from "@aussitot/shared";
import { env } from "../src/config/env.ts";
import { findOrgBySlug, prisma, withTenant } from "../src/lib/db.ts";
import { hashPassword } from "../src/lib/auth/password.ts";
import { todayIn } from "../src/lib/time.ts";
import type { Ctx } from "../src/lib/context.ts";
import { createOrganization } from "../src/modules/platform/platform.service.ts";
import { updateOrganization, updateLogo } from "../src/modules/organization/organization.service.ts";
import * as clients from "../src/modules/clients/clients.service.ts";
import * as catalog from "../src/modules/catalog/catalog.service.ts";
import * as sites from "../src/modules/sites/sites.service.ts";
import * as quotes from "../src/modules/quotes/quotes.service.ts";
import * as invoices from "../src/modules/invoices/invoices.service.ts";
import * as missions from "../src/modules/missions/missions.service.ts";
import { redis } from "../src/lib/redis.ts";
import { closeQueues } from "../src/lib/queue.ts";

const DEMO_PASSWORD = "DemoAussitot2026!";
const here = path.dirname(fileURLToPath(import.meta.url));

if (!env.DEMO_MODE) {
  console.error("Refusé : ce script charge des données fictives. Relancez avec DEMO_MODE=1 sur une base de démonstration.");
  process.exit(1);
}

async function adminQuery(sql: string, params: unknown[] = []): Promise<void> {
  const url = process.env.DATABASE_ADMIN_URL;
  if (!url) throw new Error("DATABASE_ADMIN_URL requis pour dater le jeu de démonstration");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  await client.query(sql, params);
  await client.end();
}

interface Member {
  id: string;
  firstName: string;
  lastName: string;
  role: Role;
}

async function seedTeam(
  orgId: string,
  people: { firstName: string; lastName: string; username: string; role: Role; jobTitle: string; email?: string; phone?: string }[],
): Promise<Member[]> {
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  return withTenant(orgId, async (tx) => {
    const created: Member[] = [];
    for (const p of people) {
      const user = await tx.user.create({
        data: { ...p, email: p.email ?? null, phone: p.phone ?? null, passwordHash, mustChangePassword: false, lastLoginAt: new Date() },
      });
      created.push({ id: user.id, firstName: user.firstName, lastName: user.lastName, role: user.role });
    }
    return created;
  });
}

async function main(): Promise<void> {
  if (await findOrgBySlug("deep-clean")) {
    console.error("Refusé : l'entreprise de démonstration « deep-clean » existe déjà.");
    process.exit(1);
  }

  // -------------------------------------------------------------------------
  // Deep Clean
  // -------------------------------------------------------------------------
  const created = await createOrganization({
    slug: "deep-clean",
    name: "Deep Clean",
    plan: "PRO",
    seatLimit: 30,
    admin: { firstName: "Boris", lastName: "Corsiez", email: "direction@deepclean.example" },
  });
  const orgId = created.organization.id;
  const demoHash = await hashPassword(DEMO_PASSWORD);
  await withTenant(orgId, (tx) =>
    tx.user.update({
      where: { id: created.admin.user.id },
      data: { username: "bcorsiez", passwordHash: demoHash, mustChangePassword: false, jobTitle: "Gérant" },
    }),
  );
  const adminCtx: Ctx = { orgId, userId: created.admin.user.id, role: "ADMIN", sessionId: "seed", timezone: "Europe/Paris" };

  await updateOrganization(adminCtx, {
    name: "Deep Clean",
    legalName: "Deep Clean SAS",
    legalForm: "SAS",
    shareCapital: "5 000 €",
    siren: "732829320",
    siret: "73282932000074",
    vatNumber: "FR44732829320",
    rcs: "RCS Lyon 732 829 320",
    addressLine1: "12 rue de la République",
    postalCode: "69002",
    city: "Lyon",
    country: "FR",
    email: "contact@deepclean.example",
    phone: "04 78 00 00 00",
    website: "deepclean.fr",
    iban: "FR7630006000011234567890189",
    bic: "AGRIFRPP",
    vatRegime: "NORMAL",
    defaultVatRateBps: 2000,
    paymentTermsDays: 30,
    quoteValidityDays: 30,
    timezone: "Europe/Paris",
    quotePrefix: "D",
    invoicePrefix: "F",
    creditNotePrefix: "AV",
    brandColor: "#0E7490",
    emailSignature: "Deep Clean — Nettoyage · Conciergerie · Entretien\n04 78 00 00 00 · deepclean.fr",
  });
  await updateLogo(adminCtx, readFileSync(path.join(here, "demo", "deep-clean-logo.png")));

  const team = await seedTeam(orgId, [
    {
      firstName: "Mélanie",
      lastName: "Dupuis",
      username: "mdupuis",
      role: "HR",
      jobTitle: "Responsable RH et administratif",
      email: "rh@deepclean.example",
    },
    { firstName: "Julien", lastName: "Lefèvre", username: "jlefevre", role: "DIRECTOR", jobTitle: "Directeur des opérations" },
    {
      firstName: "Yasmine",
      lastName: "Traoré",
      username: "ytraore",
      role: "SUPERVISOR",
      jobTitle: "Superviseuse planning",
      phone: "06 12 34 56 78",
    },
    { firstName: "Karim", lastName: "Benali", username: "kbenali", role: "TEAM_LEAD", jobTitle: "Chef d'équipe" },
    { firstName: "Sophie", lastName: "Martin", username: "smartin", role: "TEAM_LEAD", jobTitle: "Cheffe d'équipe" },
    { firstName: "Lucas", lastName: "Petit", username: "lpetit", role: "EMPLOYEE", jobTitle: "Agent de propreté" },
    { firstName: "Emma", lastName: "Rousseau", username: "erousseau", role: "EMPLOYEE", jobTitle: "Agente de propreté" },
    { firstName: "Nathan", lastName: "Girard", username: "ngirard", role: "EMPLOYEE", jobTitle: "Laveur de vitres" },
    { firstName: "Chloé", lastName: "Simon", username: "csimon", role: "EMPLOYEE", jobTitle: "Agente de propreté" },
    { firstName: "Moussa", lastName: "Diallo", username: "mdiallo", role: "EMPLOYEE", jobTitle: "Agent de propreté" },
  ]);
  const byUsername = (first: string) => team.find((m) => m.firstName === first)!;
  const supervisorCtx: Ctx = { ...adminCtx, userId: byUsername("Yasmine").id, role: "SUPERVISOR" };

  // Catalogue de prestations
  const items = [
    { name: "Entretien de bureaux", unit: "HOUR", unitPriceCents: 2800, description: "Dépoussiérage, sols, sanitaires, corbeilles." },
    { name: "Nettoyage des vitres", unit: "HOUR", unitPriceCents: 3500, description: "Intérieur et extérieur, encadrements compris." },
    { name: "Vitrerie au m²", unit: "SQM", unitPriceCents: 350, description: "Surfaces vitrées accessibles sans nacelle." },
    { name: "Remise en état après travaux", unit: "HOUR", unitPriceCents: 3800, description: "Décapage, traces de peinture et plâtre." },
    { name: "Désinfection des sanitaires", unit: "FLAT", unitPriceCents: 9000, description: "Protocole virucide complet." },
    { name: "Nettoyage de moquette", unit: "SQM", unitPriceCents: 600, description: "Injection-extraction, séchage rapide." },
    {
      name: "Entretien des parties communes",
      unit: "VISIT",
      unitPriceCents: 6500,
      description: "Hall, escaliers, ascenseur, local poubelles.",
    },
    { name: "Ménage chez particulier", unit: "HOUR", unitPriceCents: 3200, vatRateBps: 1000, description: "Services à la personne." },
    { name: "Frais de déplacement", unit: "KM", unitPriceCents: 60, description: "Au-delà de 20 km de l'agence." },
  ] as const;
  const catalogIds: Record<string, string> = {};
  for (const item of items) {
    const ci = await catalog.createCatalogItem(adminCtx, { vatRateBps: 2000, ...item });
    catalogIds[item.name] = ci.id;
  }

  // Clients et lieux d'intervention
  const clientSpecs = [
    {
      name: "Boulangerie Dupont & Fils",
      contactFirstName: "Marie",
      contactLastName: "Dupont",
      email: "marie@boulangerie-dupont.example",
      phone: "04 78 11 22 33",
      addressLine1: "3 place du Marché",
      postalCode: "69001",
      city: "Lyon",
      siret: "55210055400013",
    },
    {
      name: "Cabinet Dentaire Bellecour",
      contactFirstName: "Dr Paul",
      contactLastName: "Lambert",
      email: "accueil@dentaire-bellecour.example",
      phone: "04 78 42 10 10",
      addressLine1: "18 place Bellecour",
      postalCode: "69002",
      city: "Lyon",
    },
    {
      name: "Agence Immobilière Lumière",
      contactFirstName: "Claire",
      contactLastName: "Morel",
      email: "claire.morel@agence-lumiere.example",
      addressLine1: "45 cours Lafayette",
      postalCode: "69003",
      city: "Lyon",
    },
    {
      name: "Syndic Résidence Les Tilleuls",
      contactFirstName: "Hervé",
      contactLastName: "Blanc",
      email: "gestion@tilleuls-syndic.example",
      addressLine1: "7 rue des Tilleuls",
      postalCode: "69006",
      city: "Lyon",
    },
    {
      name: "Coworking La Fabrique",
      contactFirstName: "Inès",
      contactLastName: "Roux",
      email: "ines@lafabrique.example",
      addressLine1: "120 rue de Marseille",
      postalCode: "69007",
      city: "Lyon",
    },
    {
      name: "Studio Yoga Croix-Rousse",
      contactFirstName: "Léa",
      contactLastName: "Fontaine",
      email: "bonjour@yogacroixrousse.example",
      addressLine1: "2 boulevard de la Croix-Rousse",
      postalCode: "69004",
      city: "Lyon",
    },
    {
      name: "Clinique Vétérinaire du Parc",
      contactFirstName: "Antoine",
      contactLastName: "Mercier",
      email: "contact@veto-parc.example",
      addressLine1: "88 boulevard des Belges",
      postalCode: "69006",
      city: "Lyon",
    },
    {
      kind: "INDIVIDUAL" as const,
      name: "Mme Hélène Garnier",
      email: "helene.garnier@example.com",
      addressLine1: "14 quai Saint-Antoine",
      postalCode: "69002",
      city: "Lyon",
    },
  ];
  const clientIds: string[] = [];
  const siteIds: string[] = [];
  for (const spec of clientSpecs) {
    const c = await clients.createClient(adminCtx, spec);
    clientIds.push(c.id);
    const site = await sites.createSite(adminCtx, {
      name:
        spec.kind === "INDIVIDUAL" ? `Domicile ${spec.name.replace("Mme ", "")}` : spec.name.replace(/^(Syndic |Agence Immobilière )/, ""),
      clientId: c.id,
      addressLine1: spec.addressLine1,
      postalCode: spec.postalCode,
      city: spec.city,
      accessNotes: spec.name.includes("Dentaire")
        ? "Code porte 4512B. Ne pas toucher au matériel de la salle de soins."
        : spec.name.includes("Tilleuls")
          ? "Clé au local technique, boîte à code 1987."
          : null,
    });
    siteIds.push(site.id);
  }

  const line = (
    name: keyof typeof catalogIds | string,
    quantity: number,
    override?: { unitPriceCents?: number; description?: string; vatRateBps?: number },
  ) => {
    const item = items.find((i) => i.name === name)!;
    return {
      description: override?.description ?? item.name,
      quantity,
      unit: item.unit,
      unitPriceCents: override?.unitPriceCents ?? item.unitPriceCents,
      vatRateBps: override?.vatRateBps ?? ("vatRateBps" in item ? item.vatRateBps : 2000),
      catalogItemId: catalogIds[name],
    };
  };

  // Devis
  const q1 = await quotes.createQuote(supervisorCtx, {
    clientId: clientIds[0]!,
    siteId: siteIds[0],
    title: "Entretien mensuel de la boutique",
    notes: "Interventions le lundi avant l'ouverture (6 h – 8 h).",
    lines: [
      line("Nettoyage des vitres", 2),
      line("Désinfection des sanitaires", 1),
      line("Entretien de bureaux", 4, { description: "Entretien des sols de la boutique et du fournil" }),
    ],
  });
  await quotes.sendQuote(supervisorCtx, q1.id, {});
  const q2 = await quotes.createQuote(supervisorCtx, {
    clientId: clientIds[1]!,
    siteId: siteIds[1],
    title: "Entretien quotidien du cabinet",
    lines: [line("Entretien de bureaux", 40), line("Désinfection des sanitaires", 4)],
  });
  await quotes.sendQuote(supervisorCtx, q2.id, {});
  await quotes.acceptQuote(supervisorCtx, q2.id);
  const q3 = await quotes.createQuote(adminCtx, {
    clientId: clientIds[4]!,
    siteId: siteIds[4],
    title: "Remise en état après travaux",
    lines: [line("Remise en état après travaux", 24), line("Nettoyage de moquette", 180), line("Frais de déplacement", 12)],
  });
  await quotes.sendQuote(adminCtx, q3.id, {});
  await quotes.createQuote(adminCtx, {
    clientId: clientIds[3]!,
    siteId: siteIds[3],
    title: "Parties communes — contrat annuel",
    lines: [line("Entretien des parties communes", 8)],
  });
  await quotes.createQuote(adminCtx, {
    clientId: clientIds[5]!,
    siteId: siteIds[5],
    title: "Vitrerie du studio",
    lines: [line("Vitrerie au m²", 64)],
  });
  const q6 = await quotes.createQuote(adminCtx, {
    clientId: clientIds[6]!,
    siteId: siteIds[6],
    title: "Désinfection complète",
    lines: [line("Désinfection des sanitaires", 3), line("Entretien de bureaux", 12)],
  });
  await quotes.sendQuote(adminCtx, q6.id, {});
  await quotes.declineQuote(adminCtx, q6.id);

  // Factures
  const i1 = await invoices.createInvoiceFromQuote(adminCtx, q2.id);
  await invoices.sendInvoice(adminCtx, i1.id, {});
  await invoices.recordPayment(adminCtx, i1.id, { amountCents: i1.totalCents, paidOn: todayIn("Europe/Paris"), method: "TRANSFER" });
  const i2 = await invoices.createInvoice(adminCtx, {
    clientId: clientIds[3]!,
    siteId: siteIds[3],
    title: "Parties communes — septembre",
    servicePeriod: "septembre 2026",
    lines: [line("Entretien des parties communes", 8)],
  });
  await invoices.sendInvoice(adminCtx, i2.id, {});
  const i3 = await invoices.createInvoice(adminCtx, {
    clientId: clientIds[2]!,
    siteId: siteIds[2],
    title: "Entretien de l'agence — septembre",
    servicePeriod: "septembre 2026",
    lines: [line("Entretien de bureaux", 16), line("Nettoyage des vitres", 2)],
  });
  await invoices.sendInvoice(adminCtx, i3.id, {});
  await invoices.recordPayment(adminCtx, i3.id, { amountCents: 30000, paidOn: todayIn("Europe/Paris"), method: "CHECK" });
  const i4 = await invoices.createInvoice(adminCtx, {
    clientId: clientIds[7]!,
    title: "Ménage — septembre",
    servicePeriod: "septembre 2026",
    lines: [line("Ménage chez particulier", 12)],
  });
  await invoices.sendInvoice(adminCtx, i4.id, {});
  await invoices.createInvoice(adminCtx, {
    clientId: clientIds[4]!,
    siteId: siteIds[4],
    title: "Entretien du coworking — octobre",
    servicePeriod: "octobre 2026",
    lines: [line("Entretien de bureaux", 30)],
  });

  // Dates réalistes (devis anciens, factures échues) : réservé au jeu de démonstration.
  await adminQuery(
    `UPDATE quotes SET "issueDate" = "issueDate" - 45, "validUntil" = "validUntil" - 45, "sentAt" = "sentAt" - interval '45 days' WHERE id = $1`,
    [q3.id],
  );
  await adminQuery(`UPDATE invoices SET "issueDate" = "issueDate" - 40, "dueDate" = "dueDate" - 40 WHERE id = $1`, [i2.id]);
  await adminQuery(`UPDATE invoices SET "issueDate" = "issueDate" - 35, "dueDate" = "dueDate" - 35 WHERE id = $1`, [i4.id]);
  await adminQuery(`UPDATE email_outbox SET status = 'SENT', "sentAt" = now(), attempts = 1 WHERE organization_id = $1`, [orgId]);

  // Planning : cette semaine et la suivante
  const today = todayIn("Europe/Paris");
  const monday = startOfWeek(today);
  const plan: {
    day: number;
    title: string;
    site: number;
    start: string;
    end: string;
    who: string[];
    lead?: string;
    instructions?: string;
  }[] = [
    {
      day: 0,
      title: "Entretien du cabinet",
      site: 1,
      start: "07:00",
      end: "09:00",
      who: ["Lucas", "Emma"],
      lead: "Karim",
      instructions: "Salle d'attente en priorité, le cabinet ouvre à 9 h.",
    },
    { day: 0, title: "Vitres de la boutique", site: 0, start: "06:00", end: "08:00", who: ["Nathan"] },
    { day: 1, title: "Parties communes", site: 3, start: "09:00", end: "11:00", who: ["Chloé", "Moussa"], lead: "Sophie" },
    { day: 2, title: "Entretien du coworking", site: 4, start: "18:30", end: "21:00", who: ["Lucas", "Moussa"], lead: "Karim" },
    { day: 3, title: "Entretien du cabinet", site: 1, start: "07:00", end: "09:00", who: ["Lucas", "Emma"], lead: "Karim" },
    { day: 3, title: "Ménage — Mme Garnier", site: 7, start: "14:00", end: "17:00", who: ["Chloé"] },
    { day: 4, title: "Désinfection clinique", site: 6, start: "12:30", end: "14:00", who: ["Emma", "Nathan"], lead: "Sophie" },
    { day: 5, title: "Vitrerie du studio", site: 5, start: "08:00", end: "10:00", who: ["Nathan"] },
    { day: 7, title: "Entretien du cabinet", site: 1, start: "07:00", end: "09:00", who: ["Lucas", "Emma"], lead: "Karim" },
    { day: 8, title: "Parties communes", site: 3, start: "09:00", end: "11:00", who: ["Chloé", "Moussa"], lead: "Sophie" },
    {
      day: 9,
      title: "Remise en état après travaux",
      site: 4,
      start: "08:00",
      end: "16:00",
      who: ["Lucas", "Moussa", "Nathan"],
      lead: "Karim",
      instructions: "Prévoir l'autolaveuse et les disques de décapage.",
    },
  ];
  // Missions du jour pour la démonstration (quel que soit le jour où le jeu est chargé)
  plan.push(
    {
      day: -1,
      title: "Entretien de l'agence",
      site: 2,
      start: "07:30",
      end: "09:30",
      who: ["Emma", "Lucas"],
      lead: "Karim",
      instructions: "Badge à récupérer à l'accueil.",
    },
    { day: -1, title: "Vitres du cabinet", site: 1, start: "13:00", end: "15:00", who: ["Nathan", "Lucas"] },
    { day: -1, title: "Coworking — fin de journée", site: 4, start: "18:30", end: "20:30", who: ["Moussa", "Chloé"], lead: "Sophie" },
  );
  for (const m of plan) {
    const date = m.day === -1 ? today : addDays(monday, m.day);
    await missions.createMission(supervisorCtx, {
      title: m.title,
      siteId: siteIds[m.site],
      date,
      startTime: m.start,
      endTime: m.end,
      assigneeIds: m.who.map((f) => byUsername(f).id),
      teamLeadId: m.lead ? byUsername(m.lead).id : undefined,
      instructions: m.instructions,
    });
  }

  // -------------------------------------------------------------------------
  // Seconde entreprise (cloisonnement)
  // -------------------------------------------------------------------------
  const second = await createOrganization({
    slug: "net-eclat",
    name: "Net'Éclat",
    plan: "STARTER",
    seatLimit: 5,
    admin: { firstName: "Camille", lastName: "Ardent" },
  });
  await withTenant(second.organization.id, async (tx) =>
    tx.user.update({
      where: { id: second.admin.user.id },
      data: { username: "cardent", passwordHash: await hashPassword(DEMO_PASSWORD), mustChangePassword: false },
    }),
  );
  const secondCtx: Ctx = {
    orgId: second.organization.id,
    userId: second.admin.user.id,
    role: "ADMIN",
    sessionId: "seed",
    timezone: "Europe/Paris",
  };
  await clients.createClient(secondCtx, {
    name: "Hôtel des Quais",
    email: "direction@hoteldesquais.example",
    addressLine1: "5 quai des Chartrons",
    postalCode: "33000",
    city: "Bordeaux",
  });

  console.log(`
Jeu de démonstration chargé. Mot de passe de tous les comptes : ${DEMO_PASSWORD}

  Code entreprise « deep-clean »
    bcorsiez   Administrateur (gérant)
    mdupuis    RH
    jlefevre   Direction
    ytraore    Superviseuse
    kbenali    Chef d'équipe
    lpetit     Employé
  Code entreprise « net-eclat »
    cardent    Administratrice
`);
}

try {
  await main();
} finally {
  await prisma.$disconnect();
  await closeQueues();
  await redis.quit();
}
