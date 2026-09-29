import { NotificationType } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { ApiError } from "../../utils/ApiError";
import { logActivity } from "../../utils/activityLog";
import { deleteStoredImage, storeImage } from "../../utils/storage";
import { createNotification } from "../notifications/notifications.service";

interface Actor {
  userId: string;
}

const contactSelect = {
  id: true,
  firstName: true,
  lastName: true,
  phone: true,
  role: true,
} as const;

const messageSelect = {
  id: true,
  senderId: true,
  recipientId: true,
  body: true,
  photoKey: true,
  isRead: true,
  readAt: true,
  createdAt: true,
} as const;

// Retire `photoKey` (jamais exposé tel quel, même principe que
// `Announcement.coverPhotoKey`) au profit d'un simple booléen — le client
// récupère la photo via la route authentifiée dédiée (GET /messages/:id/photo).
function presentMessage<T extends { photoKey: string | null }>(message: T): Omit<T, "photoKey"> & { hasPhoto: boolean } {
  const { photoKey, ...rest } = message;
  return { ...rest, hasPhoto: Boolean(photoKey) };
}

// Annuaire interne : tout compte actif de l'entreprise peut être contacté —
// "communiquer avec tout le monde" (retour explicite du client), pas de
// notion de contacts restreints à une équipe ou un chantier.
export async function listContacts(actor: Actor) {
  return prisma.user.findMany({
    where: { isActive: true, id: { not: actor.userId } },
    select: contactSelect,
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
  });
}

export async function getContactById(id: string) {
  const contact = await prisma.user.findFirst({ where: { id, isActive: true }, select: contactSelect });
  if (!contact) throw ApiError.notFound("Contact introuvable.");
  return contact;
}

// Utilisé uniquement par getThread : un utilisateur doit pouvoir consulter
// l'historique d'une conversation déjà existante même si l'autre compte a
// depuis été désactivé (ex-collègue, compte suspendu par la RH) — sinon ses
// propres messages passés deviennent inaccessibles sans raison de sécurité
// (bug confirmé en test : getContactById, qui filtre isActive, faisait
// échouer /messages/with/:userId avec 404 dès que le contact était
// désactivé, alors que listConversations continuait de l'afficher). Seule
// la création de NOUVEAUX messages vers un compte inactif reste bloquée
// (sendMessage continue d'utiliser getContactById ci-dessus).
async function assertUserExists(id: string) {
  const exists = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw ApiError.notFound("Contact introuvable.");
}

// Pas d'entité "Conversation" en base : on déduit la liste des fils actifs à
// partir des identifiants des interlocuteurs déjà échangés, puis on récupère
// pour chacun le dernier message et le nombre de non-lus. Coût proportionnel
// au nombre de collègues avec qui l'utilisateur a déjà échangé (borné en
// pratique par la taille de l'entreprise), pas au nombre total de messages.
export async function listConversations(actor: Actor) {
  const [sent, received] = await Promise.all([
    prisma.message.findMany({ where: { senderId: actor.userId }, select: { recipientId: true }, distinct: ["recipientId"] }),
    prisma.message.findMany({ where: { recipientId: actor.userId }, select: { senderId: true }, distinct: ["senderId"] }),
  ]);
  const counterpartIds = Array.from(new Set([...sent.map((m) => m.recipientId), ...received.map((m) => m.senderId)]));

  const conversations = await Promise.all(
    counterpartIds.map(async (otherId) => {
      const [lastMessage, unreadCount, user] = await Promise.all([
        prisma.message.findFirst({
          where: {
            OR: [
              { senderId: actor.userId, recipientId: otherId },
              { senderId: otherId, recipientId: actor.userId },
            ],
          },
          orderBy: { createdAt: "desc" },
          select: messageSelect,
        }),
        prisma.message.count({ where: { senderId: otherId, recipientId: actor.userId, isRead: false } }),
        prisma.user.findUnique({ where: { id: otherId }, select: contactSelect }),
      ]);
      return { user, lastMessage: lastMessage ? presentMessage(lastMessage) : null, unreadCount };
    })
  );

  return conversations
    .filter((c) => c.user && c.lastMessage)
    .sort((a, b) => new Date(b.lastMessage!.createdAt).getTime() - new Date(a.lastMessage!.createdAt).getTime());
}

export async function getUnreadCount(actor: Actor) {
  return prisma.message.count({ where: { recipientId: actor.userId, isRead: false } });
}

interface ThreadFilters {
  page: number;
  pageSize: number;
}

export async function getThread(actor: Actor, otherUserId: string, filters: ThreadFilters) {
  if (otherUserId === actor.userId) throw ApiError.badRequest("Vous ne pouvez pas vous envoyer un message à vous-même.");
  await assertUserExists(otherUserId);

  const where = {
    OR: [
      { senderId: actor.userId, recipientId: otherUserId },
      { senderId: otherUserId, recipientId: actor.userId },
    ],
  };

  const [items, total] = await Promise.all([
    prisma.message.findMany({
      where,
      select: messageSelect,
      orderBy: { createdAt: "desc" },
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
    }),
    prisma.message.count({ where }),
  ]);

  // Ordre chronologique pour l'affichage (le plus récent en bas, comme une
  // conversation), alors que la pagination elle-même part du plus récent.
  return { items: items.reverse().map(presentMessage), total, page: filters.page, pageSize: filters.pageSize };
}

export async function sendMessage(
  actor: Actor,
  input: { recipientId: string; body?: string },
  photoBuffer?: Buffer
) {
  if (input.recipientId === actor.userId) {
    throw ApiError.badRequest("Vous ne pouvez pas vous envoyer un message à vous-même.");
  }
  // Retour explicite du client : joindre une photo au message — un message
  // peut donc être une photo seule, sans texte, mais jamais les deux absents
  // à la fois (ce que ne peut pas vérifier le schéma zod seul, qui ne connaît
  // pas req.file : voir messages.validation.ts).
  if (!input.body && !photoBuffer) {
    throw ApiError.badRequest("Le message ne peut pas être vide.");
  }
  await getContactById(input.recipientId);

  // Photo stockée HORS transaction comme toute autre photo de l'app — un
  // fichier orphelin est nettoyé si la création échoue.
  const stored = photoBuffer ? await storeImage(photoBuffer) : null;

  let message;
  try {
    message = await prisma.message.create({
      data: {
        senderId: actor.userId,
        recipientId: input.recipientId,
        body: input.body,
        photoKey: stored?.storageKey,
      },
      select: messageSelect,
    });
  } catch (err) {
    if (stored) await deleteStoredImage(stored.storageKey);
    throw err;
  }

  await logActivity({ userId: actor.userId, action: "MESSAGE_SENT", entityType: "Message", entityId: message.id });

  // Notification interne (cloche) + push, comme tout autre événement de
  // l'app (retour explicite du client — auparavant seule l'alerte push était
  // envoyée, sans jamais apparaître dans le centre de notifications).
  // `relatedEntityId` porte l'identifiant de L'EXPÉDITEUR (pas du message) :
  // c'est ce dont ConversationThreadScreen a besoin pour ouvrir directement
  // le bon fil au clic sur la notification.
  const sender = await prisma.user.findUnique({ where: { id: actor.userId }, select: { firstName: true, lastName: true } });
  if (sender) {
    await createNotification({
      userId: input.recipientId,
      type: NotificationType.MESSAGE_RECEIVED,
      title: `${sender.firstName} ${sender.lastName}`,
      body: input.body ?? "📷 Photo",
      relatedEntityType: "Conversation",
      relatedEntityId: actor.userId,
    });
  }

  return presentMessage(message);
}

// Sert la photo d'un message — jamais d'URL publique, réservée à l'expéditeur
// et au destinataire (même principe que le reste de la messagerie : un fil
// n'est visible que par ses deux participants).
export async function getMessagePhoto(actor: Actor, messageId: string) {
  const message = await prisma.message.findUnique({ where: { id: messageId }, select: { senderId: true, recipientId: true, photoKey: true } });
  if (!message || (message.senderId !== actor.userId && message.recipientId !== actor.userId)) {
    throw ApiError.notFound("Message introuvable.");
  }
  if (!message.photoKey) throw ApiError.notFound("Aucune photo pour ce message.");
  return { storageKey: message.photoKey };
}

export async function markThreadRead(actor: Actor, otherUserId: string) {
  await prisma.message.updateMany({
    where: { senderId: otherUserId, recipientId: actor.userId, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });
}
