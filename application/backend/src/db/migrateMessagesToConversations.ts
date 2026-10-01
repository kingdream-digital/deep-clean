/**
 * Reprise des fils de discussion existants vers le modèle `Conversation`.
 *
 * Avant l'ajout des groupes, un fil à deux n'existait pas en base : il était
 * déduit à la volée des couples (senderId, recipientId). Ce script crée la
 * conversation correspondant à chaque couple ayant déjà échangé, y rattache
 * les messages, et reconstitue l'état de lecture de chacun à partir de
 * l'ancien `isRead`/`readAt` porté par les messages.
 *
 * Exécuté automatiquement au démarrage du serveur (voir server.ts), sous
 * verrou PostgreSQL pour qu'un redémarrage simultané de plusieurs instances
 * ne la lance qu'une fois. Idempotent : ne traite que les messages dont
 * `conversationId` est encore nul, donc relançable sans risque et sans effet
 * si tout a déjà été repris.
 */
import { PrismaClient } from "@prisma/client";
import { logger } from "../config/logger";

// Identifiant arbitraire mais stable du verrou applicatif (pg_advisory_lock) :
// n'importe quelle valeur convient tant qu'elle n'est utilisée que par cette
// migration.
const ADVISORY_LOCK_KEY = 4815162342;

export interface MigrationResult {
  conversationsCreated: number;
  messagesLinked: number;
  notificationsUpdated: number;
}

function pairKey(a: string, b: string): string {
  return [a, b].sort().join("|");
}

export async function migrateMessagesToConversations(prisma: PrismaClient): Promise<MigrationResult> {
  const result: MigrationResult = { conversationsCreated: 0, messagesLinked: 0, notificationsUpdated: 0 };

  // Messages de l'ancienne messagerie encore rattachés à aucun fil. Un message
  // sans `recipientId` ne peut pas venir de l'ancien modèle (il n'était pas
  // optionnel à l'époque) : on l'ignore par sécurité plutôt que de deviner.
  const orphans = await prisma.message.findMany({
    where: { conversationId: null, recipientId: { not: null } },
    select: { id: true, senderId: true, recipientId: true, isRead: true, readAt: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  if (orphans.length === 0) return result;

  logger.info({ messages: orphans.length }, "Reprise des fils de messagerie existants");

  // Regroupe par couple d'interlocuteurs : un seul fil par paire, quel que
  // soit le sens des messages.
  const byPair = new Map<string, { a: string; b: string; messageIds: string[]; lastAt: Date }>();
  for (const message of orphans) {
    const recipientId = message.recipientId as string;
    const key = pairKey(message.senderId, recipientId);
    const existing = byPair.get(key);
    if (existing) {
      existing.messageIds.push(message.id);
      if (message.createdAt > existing.lastAt) existing.lastAt = message.createdAt;
    } else {
      byPair.set(key, { a: message.senderId, b: recipientId, messageIds: [message.id], lastAt: message.createdAt });
    }
  }

  for (const [, pair] of byPair) {
    // Un fil à deux a pu être créé entre-temps par l'application elle-même
    // (reprise interrompue puis relancée, premier message envoyé avant la fin
    // de la migration) : on le réutilise plutôt que d'en créer un second, qui
    // scinderait l'historique en deux.
    const existing = await prisma.conversation.findFirst({
      where: {
        isGroup: false,
        AND: [{ participants: { some: { userId: pair.a } } }, { participants: { some: { userId: pair.b } } }],
      },
      select: { id: true, lastMessageAt: true },
    });

    let conversationId: string;
    if (existing) {
      conversationId = existing.id;
    } else {
      const created = await prisma.conversation.create({
        data: {
          isGroup: false,
          lastMessageAt: pair.lastAt,
          participants: { create: [{ userId: pair.a }, { userId: pair.b }] },
        },
        select: { id: true },
      });
      conversationId = created.id;
      result.conversationsCreated += 1;
    }

    const linked = await prisma.message.updateMany({
      where: { id: { in: pair.messageIds } },
      data: { conversationId },
    });
    result.messagesLinked += linked.count;

    if (existing && pair.lastAt > existing.lastMessageAt) {
      await prisma.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: pair.lastAt } });
    }

    // État de lecture : le curseur de chacun se place au dernier message qu'il
    // a REÇU et déjà lu. Les messages qu'une personne a elle-même écrits ne
    // comptent pas (ils ne lui étaient pas destinés), et un message reçu non
    // lu doit rester non lu après la reprise.
    for (const [userId, otherId] of [
      [pair.a, pair.b],
      [pair.b, pair.a],
    ]) {
      const lastRead = await prisma.message.findFirst({
        where: { conversationId, senderId: otherId, isRead: true },
        orderBy: { createdAt: "desc" },
        select: { readAt: true, createdAt: true },
      });
      // Le curseur doit couvrir le message lu lui-même : `readAt` seul ne
      // suffit pas, il peut précéder de quelques millisecondes le `createdAt`
      // du message (horodatage posé par l'application d'un côté, par la base
      // de l'autre) — le message déjà lu repasserait alors en non-lu.
      const cursor = lastRead
        ? lastRead.readAt && lastRead.readAt > lastRead.createdAt
          ? lastRead.readAt
          : lastRead.createdAt
        : null;
      if (cursor) {
        await prisma.conversationParticipant.updateMany({
          where: { conversationId, userId },
          data: { lastReadAt: cursor },
        });
      }
    }

    // Les notifications "nouveau message" déjà reçues pointaient vers
    // l'EXPÉDITEUR (c'est ce dont l'ancien écran avait besoin pour ouvrir le
    // bon fil). Elles pointent désormais vers le fil lui-même : sans cette
    // reprise, appuyer sur une ancienne notification n'ouvrirait plus rien.
    for (const [userId, otherId] of [
      [pair.a, pair.b],
      [pair.b, pair.a],
    ]) {
      const updated = await prisma.notification.updateMany({
        where: {
          userId,
          type: "MESSAGE_RECEIVED",
          relatedEntityType: "Conversation",
          relatedEntityId: otherId,
        },
        data: { relatedEntityId: conversationId },
      });
      result.notificationsUpdated += updated.count;
    }
  }

  logger.info(result, "Reprise des fils de messagerie terminée");
  return result;
}

/**
 * Enveloppe la migration dans un verrou consultatif PostgreSQL : si plusieurs
 * instances du serveur démarrent en même temps, une seule fait le travail, les
 * autres attendent puis repartent sans rien avoir à faire (la migration étant
 * idempotente). Ne fait jamais échouer le démarrage : une messagerie dont les
 * anciens fils ne sont pas encore repris reste préférable à une API qui refuse
 * de démarrer.
 */
export async function runMessagesMigration(prisma: PrismaClient): Promise<void> {
  try {
    await prisma.$executeRaw`SELECT pg_advisory_lock(CAST(${ADVISORY_LOCK_KEY} AS bigint))`;
    try {
      await migrateMessagesToConversations(prisma);
    } finally {
      await prisma.$executeRaw`SELECT pg_advisory_unlock(CAST(${ADVISORY_LOCK_KEY} AS bigint))`;
    }
  } catch (err) {
    logger.error({ err }, "Reprise des fils de messagerie impossible — à relancer manuellement");
  }
}

// Exécution directe (`npx tsx src/db/migrateMessagesToConversations.ts`) pour
// relancer la reprise à la main si besoin, sans redémarrer le serveur.
if (require.main === module) {
  const prisma = new PrismaClient();
  migrateMessagesToConversations(prisma)
    .then((res) => {
      // eslint-disable-next-line no-console
      console.log(res);
    })
    .finally(() => prisma.$disconnect());
}
