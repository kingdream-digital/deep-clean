import { Role, TimeEntryStatus } from "@prisma/client";
import { prisma } from "../src/db/prisma";
import {
  runEveReminders,
  runFieldReminders,
  runMonthlyBillingReminder,
  runMorningDigest,
  runQuoteReminders,
} from "../src/modules/automations/automations.service";
import { createTestUser, resetDatabase } from "./helpers";

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

const MIN = 60_000;
const HOUR = 60 * MIN;

async function team() {
  const supervisor = await createTestUser({ role: Role.SUPERVISOR, email: "sup-auto@deepclean.test" });
  const manager = await createTestUser({ role: Role.SITE_MANAGER, email: "chef-auto@deepclean.test" });
  const emma = await createTestUser({ email: "emma-auto@deepclean.test" });
  const lucas = await createTestUser({ email: "lucas-auto@deepclean.test" });
  const site = await prisma.site.create({ data: { name: "Résidence Les Tilleuls", address: "1 rue X, 75001 Paris", managerId: manager.id } });
  return { supervisor, manager, emma, lucas, site };
}

async function mission(siteId: string, createdById: string, start: Date, minutes: number, userIds: string[]) {
  return prisma.mission.create({
    data: {
      siteId,
      title: "Nettoyage parties communes",
      date: new Date(`${start.toISOString().slice(0, 10)}T00:00:00Z`),
      startTime: start,
      endTime: new Date(start.getTime() + minutes * MIN),
      createdById,
      assignments: { create: userIds.map((userId) => ({ userId })) },
    },
  });
}

const titlesFor = async (userId: string) => (await prisma.notification.findMany({ where: { userId }, select: { title: true } })).map((n) => n.title);

describe("Automatisations — pointages", () => {
  it("rappelle le pointage oublié 15 min après le début, une seule fois, et pas à celui qui a pointé", async () => {
    const { supervisor, emma, lucas, site } = await team();
    const now = new Date("2026-10-05T07:20:00Z");
    const m = await mission(site.id, supervisor.id, new Date("2026-10-05T07:00:00Z"), 180, [emma.id, lucas.id]);
    await prisma.timeEntry.create({ data: { userId: lucas.id, clockIn: new Date("2026-10-05T06:58:00Z"), status: TimeEntryStatus.PENDING } });

    await runFieldReminders(now);
    await runFieldReminders(new Date(now.getTime() + 5 * MIN));
    expect(await titlesFor(emma.id)).toEqual(["Pointage d'arrivée oublié ?"]);
    expect(await titlesFor(lucas.id)).toEqual([]);
    const notif = await prisma.notification.findFirstOrThrow({ where: { userId: emma.id } });
    expect(notif).toMatchObject({ type: "REMINDER", relatedEntityType: "Mission", relatedEntityId: m.id });
    // Quelqu'un a pointé : pas d'alerte « personne n'a pointé ».
    expect(await titlesFor(supervisor.id)).toEqual([]);
  });

  it("prévient le superviseur et le chef d'équipe quand personne n'a pointé après 30 min, mais pas pour une personne en congé", async () => {
    const { supervisor, manager, emma, lucas, site } = await team();
    await mission(site.id, supervisor.id, new Date("2026-10-05T07:00:00Z"), 180, [emma.id, lucas.id]);
    await prisma.absence.create({ data: { userId: lucas.id, type: "PAID_LEAVE", status: "APPROVED", startDate: new Date("2026-10-05T00:00:00Z"), endDate: new Date("2026-10-05T00:00:00Z") } });

    await runFieldReminders(new Date("2026-10-05T07:35:00Z"));
    expect(await titlesFor(emma.id)).toEqual(["Pointage d'arrivée oublié ?"]);
    expect(await titlesFor(lucas.id)).toEqual([]);
    expect(await titlesFor(supervisor.id)).toEqual(["Personne n'a pointé"]);
    expect(await titlesFor(manager.id)).toEqual(["Personne n'a pointé"]);
  });

  it("rappelle la sortie oubliée 30 min après la fin de la mission", async () => {
    const { supervisor, emma, site } = await team();
    await mission(site.id, supervisor.id, new Date("2026-10-05T07:00:00Z"), 120, [emma.id]);
    const entry = await prisma.timeEntry.create({ data: { userId: emma.id, clockIn: new Date("2026-10-05T06:59:00Z"), status: TimeEntryStatus.PENDING } });

    await runFieldReminders(new Date("2026-10-05T09:10:00Z"));
    expect(await titlesFor(emma.id)).toEqual([]);
    await runFieldReminders(new Date("2026-10-05T09:31:00Z"));
    const notifs = await prisma.notification.findMany({ where: { userId: emma.id } });
    expect(notifs.map((n) => [n.title, n.relatedEntityId])).toEqual([["Sortie oubliée ?", entry.id]]);
  });
});

describe("Automatisations — veille et récapitulatif", () => {
  it("annonce les missions du lendemain à chaque personne affectée", async () => {
    const { supervisor, emma, lucas, site } = await team();
    await mission(site.id, supervisor.id, new Date("2026-10-06T05:00:00Z"), 120, [emma.id]);
    await mission(site.id, supervisor.id, new Date("2026-10-06T12:00:00Z"), 120, [emma.id]);
    await runEveReminders(new Date("2026-10-05T16:00:00Z"));
    await runEveReminders(new Date("2026-10-05T16:30:00Z"));
    const notifs = await prisma.notification.findMany({ where: { userId: emma.id } });
    expect(notifs).toHaveLength(1);
    expect(notifs[0]!.title).toBe("Demain : 2 missions");
    expect(notifs[0]!.body).toContain("première à 07:00");
    expect(await titlesFor(lucas.id)).toEqual([]);
  });

  it("envoie un récapitulatif des validations en attente et relance une absence sans réponse depuis 48 h", async () => {
    const { supervisor, emma } = await team();
    const hr = await createTestUser({ role: Role.HR, email: "rh-auto@deepclean.test" });
    await prisma.timeEntry.create({ data: { userId: emma.id, clockIn: new Date("2026-10-04T07:00:00Z"), clockOut: new Date("2026-10-04T10:00:00Z"), status: TimeEntryStatus.PENDING } });
    await prisma.absence.create({ data: { userId: emma.id, type: "PAID_LEAVE", status: "PENDING", startDate: new Date("2026-10-20T00:00:00Z"), endDate: new Date("2026-10-21T00:00:00Z"), createdAt: new Date("2026-10-02T06:00:00Z") } });

    await runMorningDigest(new Date("2026-10-05T06:00:00Z"));
    const sup = await prisma.notification.findMany({ where: { userId: supervisor.id }, orderBy: { title: "asc" } });
    expect(sup.map((n) => n.title)).toEqual(["Demande d'absence en attente", "À traiter aujourd'hui"]);
    expect(sup.find((n) => n.title === "À traiter aujourd'hui")!.body).toBe("1 pointage à valider et 1 demande d'absence à décider.");
    expect(await titlesFor(hr.id)).toHaveLength(2);
    expect(await titlesFor(emma.id)).toEqual([]);
  });
});

describe("Automatisations — devis et facturation", () => {
  async function quote(createdById: string, status: "DRAFT" | "VALIDATED" | "SENT") {
    const client = await prisma.client.create({ data: { companyName: "Hôtel Belle Vue", createdById } });
    return prisma.quote.create({ data: { quoteNumber: `DEV-2026-${Math.floor(Math.random() * 9000 + 1000)}`, clientId: client.id, createdById, status } });
  }

  it("rappelle au créateur un devis non terminé, tous les 2 jours, 3 fois au maximum", async () => {
    const sup = await createTestUser({ role: Role.SUPERVISOR, email: "sup-devis@deepclean.test" });
    const q = await quote(sup.id, "DRAFT");
    const t0 = q.updatedAt.getTime();
    await runQuoteReminders(new Date(t0 + 12 * HOUR));
    expect(await titlesFor(sup.id)).toEqual([]);
    for (const days of [1.1, 1.5, 3.2, 5.2, 7.2, 9.2]) await runQuoteReminders(new Date(t0 + days * 24 * HOUR));
    const notifs = await prisma.notification.findMany({ where: { userId: sup.id } });
    expect(notifs).toHaveLength(3);
    expect(notifs[0]!.body).toContain("soumettez-le à validation");
    expect(notifs[0]!.relatedEntityType).toBe("Quote");
  });

  it("rappelle d'envoyer un devis validé, puis de relancer un devis envoyé sans réponse depuis 7 jours", async () => {
    const dir = await createTestUser({ role: Role.DIRECTOR, email: "dir-devis@deepclean.test" });
    const validated = await quote(dir.id, "VALIDATED");
    const sent = await quote(dir.id, "SENT");
    const t0 = Math.max(validated.updatedAt.getTime(), sent.updatedAt.getTime());
    await runQuoteReminders(new Date(t0 + 2 * 24 * HOUR));
    expect((await titlesFor(dir.id)).sort()).toEqual(["Devis à envoyer"]);
    await runQuoteReminders(new Date(t0 + 7.5 * 24 * HOUR));
    expect(await titlesFor(dir.id)).toContain("Devis sans réponse");
  });

  it("le 1er du mois, signale les chantiers du mois écoulé pas encore facturés", async () => {
    const { supervisor, site } = await team();
    const hr = await createTestUser({ role: Role.HR, email: "rh-fact@deepclean.test" });
    await prisma.siteTarget.create({ data: { siteId: site.id, period: "2026-09", plannedVisits: 10, createdById: supervisor.id } });
    await runMonthlyBillingReminder(new Date("2026-10-01T06:10:00Z"));
    const notifs = await prisma.notification.findMany({ where: { userId: hr.id } });
    expect(notifs.map((n) => [n.title, n.body, n.relatedEntityType])).toEqual([["Factures du mois à préparer", "1 chantier à facturer pour septembre 2026.", "InvoicesList"]]);
  });
});
