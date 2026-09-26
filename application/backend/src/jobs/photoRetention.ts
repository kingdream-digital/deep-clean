import { NotificationType, Role } from "@prisma/client";
import { prisma } from "../db/prisma";
import { logger } from "../config/logger";
import { createNotification } from "../modules/notifications/notifications.service";
import { deleteStoredImage } from "../utils/storage";
import { PHOTO_RETENTION_DAYS, PHOTO_WARNING_DAYS_BEFORE } from "../modules/problems/problems.service";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Politique de rétention des photos de signalement (décision explicite du
 * client) : le serveur applicatif n'est pas l'endroit où la RH archive
 * durablement — les photos sont supprimées automatiquement après
 * PHOTO_RETENTION_DAYS jours, avec un rappel PHOTO_WARNING_DAYS_BEFORE jours
 * avant pour que la RH ait le temps de les télécharger si elle veut les
 * garder. Appelée par un cron quotidien (voir server.ts) ET une fois au
 * démarrage du serveur, pour rattraper une éventuelle exécution manquée
 * pendant que le serveur était endormi (hébergement gratuit qui se met en
 * veille).
 */
export async function runPhotoRetentionJob(): Promise<void> {
  // Les deux étapes sont indépendantes : un échec de l'avertissement (ex.
  // notification push qui échoue) ne doit jamais empêcher la purge du jour
  // de s'exécuter — sinon une seule notification en erreur suffisait à
  // suspendre indéfiniment la suppression effective des photos expirées.
  try {
    await warnExpiringPhotos();
  } catch (err) {
    logger.error({ err }, "Échec de l'étape d'avertissement de rétention des photos");
  }
  await purgeExpiredPhotos();
}

async function warnExpiringPhotos(): Promise<void> {
  const warnThreshold = new Date(Date.now() - (PHOTO_RETENTION_DAYS - PHOTO_WARNING_DAYS_BEFORE) * MS_PER_DAY);
  // Borne basse : si le serveur est resté éteint plus de PHOTO_RETENTION_DAYS
  // jours (hébergement gratuit qui se met en veille), une photo peut franchir
  // le seuil d'avertissement ET le seuil de purge avant le premier réveil du
  // job — sans cette borne, elle recevrait un rappel "supprimée dans 3 jours"
  // puis serait effectivement supprimée par `purgeExpiredPhotos` dans le
  // MÊME passage, quelques instants plus tard : un rappel mensonger.
  const purgeThreshold = new Date(Date.now() - PHOTO_RETENTION_DAYS * MS_PER_DAY);

  const candidates = await prisma.photo.findMany({
    where: {
      isDeleted: false,
      purgeWarnedAt: null,
      createdAt: { lte: warnThreshold, gt: purgeThreshold },
      problemId: { not: null },
    },
    select: { id: true, problemId: true, problem: { select: { description: true } } },
  });
  if (candidates.length === 0) return;

  const byProblem = new Map<string, { count: number; description: string }>();
  for (const photo of candidates) {
    if (!photo.problemId) continue;
    const entry = byProblem.get(photo.problemId) ?? { count: 0, description: photo.problem?.description ?? "" };
    entry.count += 1;
    byProblem.set(photo.problemId, entry);
  }

  const hrUsers = await prisma.user.findMany({ where: { role: Role.HR, isActive: true }, select: { id: true } });

  for (const [problemId, info] of byProblem) {
    const shortDescription = info.description.length > 60 ? `${info.description.slice(0, 60)}…` : info.description;
    // `allSettled`, pas `all` : la notification RH qui échoue pour un
    // destinataire (push token invalide, etc.) ne doit pas empêcher les
    // autres HR de recevoir la leur, ni bloquer le marquage `purgeWarnedAt`
    // ci-dessous pour le reste du lot (bug corrigé : un seul rejet
    // interrompait toute la boucle et annulait aussi la purge du jour,
    // exécutée après cette fonction).
    const results = await Promise.allSettled(
      hrUsers.map((hr) =>
        createNotification({
          userId: hr.id,
          type: NotificationType.PHOTO_EXPIRING_SOON,
          title: "Photos bientôt supprimées",
          body: `${info.count} photo${info.count > 1 ? "s" : ""} du signalement « ${shortDescription} » seront supprimées dans ${PHOTO_WARNING_DAYS_BEFORE} jours. Téléchargez-les si vous voulez les conserver.`,
          relatedEntityType: "Problem",
          relatedEntityId: problemId,
        })
      )
    );
    const failed = results.filter((r) => r.status === "rejected");
    if (failed.length > 0) {
      logger.error({ problemId, failed: failed.length }, "Échec d'envoi du rappel de suppression de photos à un ou plusieurs RH");
    }
  }

  await prisma.photo.updateMany({
    where: { id: { in: candidates.map((c) => c.id) } },
    data: { purgeWarnedAt: new Date() },
  });

  logger.info({ photos: candidates.length, problems: byProblem.size }, "Rappel de suppression de photos envoyé à la RH");
}

async function purgeExpiredPhotos(): Promise<void> {
  const expiryThreshold = new Date(Date.now() - PHOTO_RETENTION_DAYS * MS_PER_DAY);

  // `problemId: { not: null }` : cette purge est spécifiquement la politique
  // "photos de signalement" documentée ci-dessus — si le modèle Photo est un
  // jour réutilisé pour autre chose (rapports de chantier, documents...), ce
  // job ne doit jamais y toucher sans qu'on l'ait explicitement décidé.
  const expired = await prisma.photo.findMany({
    where: { isDeleted: false, createdAt: { lte: expiryThreshold }, problemId: { not: null } },
    select: { id: true, storageKey: true },
  });
  if (expired.length === 0) return;

  await Promise.all(expired.map((photo) => deleteStoredImage(photo.storageKey)));
  await prisma.photo.updateMany({ where: { id: { in: expired.map((p) => p.id) } }, data: { isDeleted: true } });

  logger.info({ photos: expired.length }, "Photos supprimées automatiquement (durée de conservation dépassée)");
}
