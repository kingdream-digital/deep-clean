import { Role } from "@prisma/client";
import { prisma } from "../src/db/prisma";
import { createTestSite, createTestUser, resetDatabase } from "./helpers";
import { runPhotoRetentionJob } from "../src/jobs/photoRetention";

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

const DAY_MS = 24 * 60 * 60 * 1000;

async function createProblemWithPhoto(siteId: string, reportedById: string, ageDays: number) {
  const problem = await prisma.problem.create({
    data: { siteId, reportedById, description: `Signalement à ${ageDays} jours`, type: "ISSUE" },
  });
  const photo = await prisma.photo.create({
    data: {
      storageKey: `test-${problem.id}-${ageDays}.jpg`,
      mimeType: "image/jpeg",
      sizeBytes: 1000,
      uploadedById: reportedById,
      problemId: problem.id,
      createdAt: new Date(Date.now() - ageDays * DAY_MS),
    },
  });
  return { problem, photo };
}

describe("Rétention automatique des photos de signalement (14 jours, rappel à J-3)", () => {
  it("prévient la RH (et personne d'autre) quand des photos approchent de la suppression, puis purge celles qui ont dépassé 14 jours", async () => {
    const hr = await createTestUser({ role: Role.HR, email: "hr-retention@deepclean.test" });
    const director = await createTestUser({ role: Role.DIRECTOR, email: "dir-retention@deepclean.test" });
    const employee = await createTestUser({ role: Role.EMPLOYEE, email: "emp-retention@deepclean.test" });
    const site = await createTestSite();

    const soonToExpire = await createProblemWithPhoto(site.id, employee.id, 12); // dans la fenêtre de rappel (J-3), pas encore purgée
    const alreadyExpired = await createProblemWithPhoto(site.id, employee.id, 15); // au-delà de 14 jours : purgée directement, jamais avertie
    const fresh = await createProblemWithPhoto(site.id, employee.id, 5); // ni rappel ni purge

    await runPhotoRetentionJob();

    // La RH n'est prévenue QUE pour la photo encore dans la fenêtre de rappel —
    // celle déjà mûre pour la purge (15 j) ne reçoit jamais de rappel mensonger
    // "supprimée dans 3 jours" juste avant d'être effectivement supprimée.
    const hrNotifs = await prisma.notification.findMany({
      where: { userId: hr.id, type: "PHOTO_EXPIRING_SOON" },
      orderBy: { createdAt: "asc" },
    });
    expect(hrNotifs).toHaveLength(1);
    expect(hrNotifs[0]!.relatedEntityId).toBe(soonToExpire.problem.id);

    // Personne d'autre que la RH ne reçoit ce rappel.
    const directorNotifs = await prisma.notification.findMany({ where: { userId: director.id, type: "PHOTO_EXPIRING_SOON" } });
    expect(directorNotifs).toHaveLength(0);

    // Purge : seule la photo de 15 jours a réellement dépassé la limite de 14 jours.
    // Jamais avertie (purgeWarnedAt reste null) : elle est passée directement à la purge.
    const expiredPhoto = await prisma.photo.findUnique({ where: { id: alreadyExpired.photo.id } });
    expect(expiredPhoto?.isDeleted).toBe(true);
    expect(expiredPhoto?.purgeWarnedAt).toBeNull();

    const soonPhoto = await prisma.photo.findUnique({ where: { id: soonToExpire.photo.id } });
    expect(soonPhoto?.isDeleted).toBe(false);
    expect(soonPhoto?.purgeWarnedAt).not.toBeNull();

    const freshPhoto = await prisma.photo.findUnique({ where: { id: fresh.photo.id } });
    expect(freshPhoto?.isDeleted).toBe(false);
    expect(freshPhoto?.purgeWarnedAt).toBeNull();
  });

  it("ne renvoie pas le même rappel deux fois", async () => {
    const hr = await createTestUser({ role: Role.HR, email: "hr-retention2@deepclean.test" });
    const employee = await createTestUser({ role: Role.EMPLOYEE, email: "emp-retention2@deepclean.test" });
    const site = await createTestSite();

    await createProblemWithPhoto(site.id, employee.id, 12);

    await runPhotoRetentionJob();
    await runPhotoRetentionJob();

    const hrNotifs = await prisma.notification.findMany({ where: { userId: hr.id, type: "PHOTO_EXPIRING_SOON" } });
    expect(hrNotifs).toHaveLength(1);
  });
});
