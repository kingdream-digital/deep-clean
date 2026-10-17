import { MissionStatus, Role } from "@prisma/client";
import { prisma } from "../src/db/prisma";
import { prepareReviewDemoAccount } from "../src/jobs/reviewDemoAccount";
import { createTestSite, createTestUser, resetDatabase } from "./helpers";

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Compte employé de démo des vérificateurs Apple / Google", () => {
  it("ne fait rien tant que la démo n'est pas chargée", async () => {
    expect(await prepareReviewDemoAccount(prisma)).toBeNull();
  });

  it("supprime le vieux pointage ouvert, clôt la mission bloquée et planifie J à J+14 sans doublon", async () => {
    const lucas = await createTestUser({ role: Role.EMPLOYEE, email: "lucas.employe@deepclean.fr" });
    const tilleuls = await createTestSite({ name: "Résidence Les Tilleuls" });
    await createTestSite({ name: "Clinique Saint-Michel" });
    const now = new Date();
    const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);

    await prisma.timeEntry.create({ data: { userId: lucas.id, clockIn: hoursAgo(320) } });
    const stuck = await prisma.mission.create({
      data: {
        siteId: tilleuls.id,
        title: "Mission de la présentation",
        date: hoursAgo(320),
        startTime: hoursAgo(321),
        endTime: hoursAgo(318),
        status: MissionStatus.IN_PROGRESS,
        createdById: lucas.id,
        assignments: { create: [{ userId: lucas.id }] },
      },
    });

    expect(await prepareReviewDemoAccount(prisma, now)).toEqual({
      staleEntriesRemoved: 1,
      staleMissionsClosed: 1,
      missionsCreated: 45,
    });
    expect((await prisma.mission.findUniqueOrThrow({ where: { id: stuck.id } })).status).toBe(
      MissionStatus.COMPLETED
    );

    // Un vérificateur en poste depuis une heure garde son pointage, et rien n'est recréé.
    await prisma.timeEntry.create({ data: { userId: lucas.id, clockIn: hoursAgo(1) } });
    expect(await prepareReviewDemoAccount(prisma, now)).toEqual({
      staleEntriesRemoved: 0,
      staleMissionsClosed: 0,
      missionsCreated: 0,
    });
    expect(await prisma.timeEntry.count({ where: { userId: lucas.id, clockOut: null } })).toBe(1);
  });
});
