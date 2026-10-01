import { NotificationType, Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { ApiError } from "../../utils/ApiError";
import { logActivity } from "../../utils/activityLog";
import { deleteStoredFile, deleteStoredImage, storeImage, storePdfDocument } from "../../utils/storage";
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
  avatarKey: true,
} as const;

type RawContact = Prisma.UserGetPayload<{ select: typeof contactSelect }>;

const messageSelect = {
  id: true,
  conversationId: true,
  senderId: true,
  body: true,
  photoKey: true,
  documentKey: true,
  documentName: true,
  documentSize: true,
  systemEvent: true,
  createdAt: true,
} as const;

type RawMessage = Prisma.MessageGetPayload<{ select: typeof messageSelect }>;

// `avatarKey` n'est jamais exposé tel quel (même principe que `photoKey`) : le
// client récupère la photo de profil via la route authentifiée dédiée de
// users.routes.ts, il a seulement besoin de savoir s'il y en a une.
function presentContact(contact: RawContact) {
  const { avatarKey, ...rest } = contact;
  return { ...rest, hasAvatar: Boolean(avatarKey) };
}

export type PresentedContact = ReturnType<typeof presentContact>;

// Retire les clés de stockage (jamais exposées, même principe que
// `Announcement.coverPhotoKey`) au profit de booléens et métadonnées
// d'affichage — le fichier lui-même passe par une route authentifiée dédiée.
function presentMessage(message: RawMessage) {
  const { photoKey, documentKey, ...rest } = message;
  return {
    ...rest,
    hasPhoto: Boolean(photoKey),
    document: documentKey
      ? { name: message.documentName ?? "Document.pdf", sizeBytes: message.documentSize ?? 0 }
      : null,
  };
}

// ---------------------------------------------------------------------------
// Annuaire
// ---------------------------------------------------------------------------

// Annuaire interne : tout compte actif de l'entreprise peut être contacté —
// "communiquer avec tout le monde" (retour explicite du client), pas de
// notion de contacts restreints à une équipe ou un chantier.
export async function listContacts(actor: Actor) {
  const contacts = await prisma.user.findMany({
    where: { isActive: true, id: { not: actor.userId } },
    select: contactSelect,
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
  });
  return contacts.map(presentContact);
}

export async function getContactById(id: string) {
  const contact = await prisma.user.findFirst({ where: { id, isActive: true }, select: contactSelect });
  if (!contact) throw ApiError.notFound("Contact introuvable.");
  return presentContact(contact);
}

// Utilisé pour l'affichage d'un fil : une personne doit pouvoir consulter
// l'historique d'une conversation même si l'autre compte a depuis été
// désactivé (ex-collègue, compte suspendu par la RH) — sinon ses propres
// messages passés deviennent inaccessibles sans raison de sécurité. Seule la
// création de NOUVEAUX fils vers un compte inactif reste bloquée
// (`assertActiveUsers` ci-dessous).
async function getAnyUserById(id: string) {
  const user = await prisma.user.findUnique({ where: { id }, select: contactSelect });
  if (!user) throw ApiError.notFound("Contact introuvable.");
  return presentContact(user);
}

async function assertActiveUsers(ids: string[]) {
  const found = await prisma.user.count({ where: { id: { in: ids }, isActive: true } });
  if (found !== ids.length) {
    throw ApiError.badRequest("Un des comptes sélectionnés est introuvable ou désactivé.");
  }
}

// ---------------------------------------------------------------------------
// Accès à un fil
// ---------------------------------------------------------------------------

/**
 * Vérifie que l'utilisateur fait bien partie du fil demandé — la seule et
 * unique porte d'entrée vers une conversation. Répond 404 (jamais 403) pour
 * ne pas révéler l'existence d'un fil auquel on n'appartient pas. Une
 * personne qui a quitté le groupe garde la lecture de l'historique mais ne
 * peut plus rien y écrire (`canWrite`).
 */
async function requireParticipant(actor: Actor, conversationId: string) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { participants: { select: { userId: true, isAdmin: true, lastReadAt: true, leftAt: true } } },
  });
  if (!conversation) throw ApiError.notFound("Conversation introuvable.");

  const me = conversation.participants.find((p) => p.userId === actor.userId);
  if (!me) throw ApiError.notFound("Conversation introuvable.");

  return { conversation, me, canWrite: me.leftAt === null };
}

async function loadParticipantUsers(conversationId: string) {
  const participants = await prisma.conversationParticipant.findMany({
    where: { conversationId },
    select: { userId: true, isAdmin: true, leftAt: true, user: { select: contactSelect } },
    orderBy: { joinedAt: "asc" },
  });
  return participants.map((p) => ({
    ...presentContact(p.user),
    isAdmin: p.isAdmin,
    hasLeft: p.leftAt !== null,
  }));
}

export type PresentedParticipant = Awaited<ReturnType<typeof loadParticipantUsers>>[number];

/**
 * Forme commune d'un fil côté client : un groupe porte son nom et ses
 * participants, un fil à deux porte l'autre personne. Le client n'a ainsi
 * jamais à recomposer un titre lui-même.
 */
function presentConversation(args: {
  id: string;
  isGroup: boolean;
  title: string | null;
  lastMessageAt: Date;
  participants: PresentedParticipant[];
  meId: string;
  isAdmin: boolean;
  hasLeft: boolean;
}) {
  const others = args.participants.filter((p) => p.id !== args.meId);
  const otherUser = args.isGroup ? null : (others[0] ?? null);
  return {
    id: args.id,
    isGroup: args.isGroup,
    title: args.isGroup ? (args.title ?? "Groupe") : `${otherUser?.firstName ?? ""} ${otherUser?.lastName ?? ""}`.trim(),
    // Jamais null pour un fil à deux côté client : l'écran de conversation y
    // lit le téléphone (bouton d'appel) et la fiche contact.
    otherUser,
    participants: args.participants,
    isAdmin: args.isAdmin,
    hasLeft: args.hasLeft,
    lastMessageAt: args.lastMessageAt,
  };
}

export async function getConversation(actor: Actor, conversationId: string) {
  const { conversation, me } = await requireParticipant(actor, conversationId);
  const participants = await loadParticipantUsers(conversationId);
  return presentConversation({
    id: conversation.id,
    isGroup: conversation.isGroup,
    title: conversation.title,
    lastMessageAt: conversation.lastMessageAt,
    participants,
    meId: actor.userId,
    isAdmin: me.isAdmin,
    hasLeft: me.leftAt !== null,
  });
}

// ---------------------------------------------------------------------------
// Liste des fils et compteurs de non-lus
// ---------------------------------------------------------------------------

/**
 * Clause SQL des messages non lus par `userId`, tous fils confondus : pour
 * chaque fil dont il est membre, les messages postés par quelqu'un d'autre
 * après son curseur de lecture. Les événements de groupe (`systemEvent`) n'en
 * font jamais partie — "Marie a ajouté Karim" n'est pas un message à lire.
 */
function unreadWhere(
  userId: string,
  memberships: { conversationId: string; lastReadAt: Date | null }[]
): Prisma.MessageWhereInput {
  if (memberships.length === 0) {
    // Clause volontairement impossible : évite un `OR: []`, que Prisma
    // interprète comme "aucun filtre" (il compterait alors TOUS les messages
    // de l'entreprise).
    return { id: { in: [] } };
  }
  return {
    senderId: { not: userId },
    systemEvent: null,
    OR: memberships.map((m) => ({
      conversationId: m.conversationId,
      ...(m.lastReadAt ? { createdAt: { gt: m.lastReadAt } } : {}),
    })),
  };
}

async function listMemberships(userId: string) {
  return prisma.conversationParticipant.findMany({
    where: { userId, leftAt: null },
    select: { conversationId: true, lastReadAt: true },
  });
}

export async function listConversations(actor: Actor) {
  const memberships = await prisma.conversationParticipant.findMany({
    where: { userId: actor.userId, leftAt: null },
    select: {
      conversationId: true,
      lastReadAt: true,
      isAdmin: true,
      conversation: {
        select: {
          id: true,
          isGroup: true,
          title: true,
          lastMessageAt: true,
          participants: {
            select: { userId: true, isAdmin: true, leftAt: true, user: { select: contactSelect } },
            orderBy: { joinedAt: "asc" },
          },
          // Dernier message du fil, pour l'aperçu de la liste : demandé dans
          // la même requête que les fils eux-mêmes plutôt qu'un appel par fil.
          messages: {
            select: { ...messageSelect, sender: { select: { id: true, firstName: true, lastName: true } } },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      },
    },
    orderBy: { conversation: { lastMessageAt: "desc" } },
  });

  if (memberships.length === 0) return [];

  // Un seul passage en base pour tous les compteurs de non-lus, plutôt qu'un
  // `count` par fil (la liste est rechargée à chaque retour sur l'onglet).
  const unreadGroups = await prisma.message.groupBy({
    by: ["conversationId"],
    where: unreadWhere(
      actor.userId,
      memberships.map((m) => ({ conversationId: m.conversationId, lastReadAt: m.lastReadAt }))
    ),
    _count: { _all: true },
  });

  const unreadByConversation = new Map(
    unreadGroups.map((g) => [g.conversationId as string, g._count._all])
  );

  return memberships
    .map((membership) => {
      const conversation = membership.conversation;
      const participants = conversation.participants.map((p) => ({
        ...presentContact(p.user),
        isAdmin: p.isAdmin,
        hasLeft: p.leftAt !== null,
      }));
      const last = conversation.messages[0] ?? null;
      return {
        ...presentConversation({
          id: conversation.id,
          isGroup: conversation.isGroup,
          title: conversation.title,
          lastMessageAt: conversation.lastMessageAt,
          participants,
          meId: actor.userId,
          isAdmin: membership.isAdmin,
          hasLeft: false,
        }),
        lastMessage: last
          ? { ...presentMessage(last), senderName: `${last.sender.firstName} ${last.sender.lastName}` }
          : null,
        unreadCount: unreadByConversation.get(conversation.id) ?? 0,
      };
    })
    // Un fil à deux sans aucun message n'a pas à encombrer la liste (il a pu
    // être ouvert sans qu'un message soit finalement envoyé) ; un groupe, lui,
    // existe en tant que tel dès sa création même si personne n'a encore écrit.
    .filter((c) => c.isGroup || c.lastMessage !== null);
}

export async function getUnreadCount(actor: Actor) {
  const memberships = await listMemberships(actor.userId);
  return prisma.message.count({ where: unreadWhere(actor.userId, memberships) });
}

// ---------------------------------------------------------------------------
// Création de fils
// ---------------------------------------------------------------------------

/**
 * Retourne le fil à deux avec `otherUserId`, en le créant au besoin. Appelé
 * quand on ouvre une conversation depuis l'annuaire ou une fiche contact :
 * l'application n'a alors qu'un identifiant d'utilisateur, jamais de fil.
 */
export async function getOrCreateDirectConversation(actor: Actor, otherUserId: string) {
  if (otherUserId === actor.userId) {
    throw ApiError.badRequest("Vous ne pouvez pas vous envoyer un message à vous-même.");
  }
  await getContactById(otherUserId);

  const existing = await prisma.conversation.findFirst({
    where: {
      isGroup: false,
      AND: [
        { participants: { some: { userId: actor.userId } } },
        { participants: { some: { userId: otherUserId } } },
      ],
    },
    select: { id: true },
  });

  const conversationId =
    existing?.id ??
    (
      await prisma.conversation.create({
        data: {
          isGroup: false,
          createdById: actor.userId,
          participants: { create: [{ userId: actor.userId }, { userId: otherUserId }] },
        },
        select: { id: true },
      })
    ).id;

  return getConversation(actor, conversationId);
}

/**
 * Crée un groupe (retour explicite du client : "parler à plusieurs
 * personnes"). Son créateur en est administrateur ; tout compte actif peut en
 * créer un, comme tout compte actif peut déjà écrire à n'importe qui.
 */
export async function createGroupConversation(actor: Actor, input: { title: string; participantIds: string[] }) {
  const participantIds = Array.from(new Set(input.participantIds.filter((id) => id !== actor.userId)));
  if (participantIds.length < 2) {
    // Un "groupe" de deux personnes est un fil à deux : on refuse plutôt que
    // de créer deux fils différents pour les deux mêmes personnes.
    throw ApiError.badRequest("Un groupe doit compter au moins trois personnes (vous et deux collègues).");
  }
  await assertActiveUsers(participantIds);

  const conversation = await prisma.conversation.create({
    data: {
      isGroup: true,
      title: input.title,
      createdById: actor.userId,
      participants: {
        create: [
          { userId: actor.userId, isAdmin: true, lastReadAt: new Date() },
          ...participantIds.map((userId) => ({ userId })),
        ],
      },
    },
    select: { id: true },
  });

  await postSystemMessage(conversation.id, actor.userId, "GROUP_CREATED", `a créé le groupe « ${input.title} »`);
  await logActivity({
    userId: actor.userId,
    action: "CONVERSATION_GROUP_CREATED",
    entityType: "Conversation",
    entityId: conversation.id,
    metadata: { title: input.title, participants: participantIds.length + 1 },
  });

  await notifyParticipants({
    conversationId: conversation.id,
    actorId: actor.userId,
    title: input.title,
    body: "Vous avez été ajouté à un groupe.",
  });

  return getConversation(actor, conversation.id);
}

// ---------------------------------------------------------------------------
// Vie du groupe
// ---------------------------------------------------------------------------

async function postSystemMessage(conversationId: string, actorId: string, event: string, text: string) {
  const actor = await prisma.user.findUnique({ where: { id: actorId }, select: { firstName: true, lastName: true } });
  const who = actor ? `${actor.firstName} ${actor.lastName}` : "Quelqu'un";
  await prisma.message.create({
    data: { conversationId, senderId: actorId, systemEvent: event, body: `${who} ${text}` },
  });
  await prisma.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: new Date() } });
}

function requireGroupAdmin(conversation: { isGroup: boolean }, me: { isAdmin: boolean; leftAt: Date | null }) {
  if (!conversation.isGroup) throw ApiError.badRequest("Cette conversation n'est pas un groupe.");
  if (me.leftAt !== null || !me.isAdmin) {
    throw ApiError.forbidden("Seul un administrateur du groupe peut effectuer cette action.");
  }
}

export async function addParticipants(actor: Actor, conversationId: string, userIds: string[]) {
  const { conversation, me } = await requireParticipant(actor, conversationId);
  requireGroupAdmin(conversation, me);

  const current = new Set(conversation.participants.filter((p) => p.leftAt === null).map((p) => p.userId));
  const toAdd = Array.from(new Set(userIds)).filter((id) => !current.has(id));
  if (toAdd.length === 0) throw ApiError.badRequest("Ces personnes font déjà partie du groupe.");
  await assertActiveUsers(toAdd);

  for (const userId of toAdd) {
    // Quelqu'un qui avait quitté le groupe peut y être réintégré : on relève
    // son `leftAt` au lieu de créer une seconde ligne (contrainte d'unicité).
    await prisma.conversationParticipant.upsert({
      where: { conversationId_userId: { conversationId, userId } },
      create: { conversationId, userId },
      update: { leftAt: null, joinedAt: new Date(), lastReadAt: null },
    });
  }

  const added = await prisma.user.findMany({ where: { id: { in: toAdd } }, select: { firstName: true, lastName: true } });
  const names = added.map((u) => `${u.firstName} ${u.lastName}`).join(", ");
  await postSystemMessage(conversationId, actor.userId, "PARTICIPANTS_ADDED", `a ajouté ${names}`);
  await logActivity({
    userId: actor.userId,
    action: "CONVERSATION_PARTICIPANTS_ADDED",
    entityType: "Conversation",
    entityId: conversationId,
    metadata: { added: toAdd },
  });

  await notifyUsers(toAdd, {
    title: conversation.title ?? "Groupe",
    body: "Vous avez été ajouté à un groupe.",
    conversationId,
  });

  return getConversation(actor, conversationId);
}

export async function removeParticipant(actor: Actor, conversationId: string, userId: string) {
  const { conversation, me } = await requireParticipant(actor, conversationId);
  requireGroupAdmin(conversation, me);
  if (userId === actor.userId) {
    throw ApiError.badRequest("Pour sortir du groupe, utilisez « Quitter le groupe ».");
  }

  const target = conversation.participants.find((p) => p.userId === userId && p.leftAt === null);
  if (!target) throw ApiError.notFound("Cette personne ne fait pas partie du groupe.");

  await prisma.conversationParticipant.update({
    where: { conversationId_userId: { conversationId, userId } },
    data: { leftAt: new Date(), isAdmin: false },
  });

  const removed = await prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true } });
  await postSystemMessage(
    conversationId,
    actor.userId,
    "PARTICIPANT_REMOVED",
    `a retiré ${removed ? `${removed.firstName} ${removed.lastName}` : "un participant"}`
  );
  await logActivity({
    userId: actor.userId,
    action: "CONVERSATION_PARTICIPANT_REMOVED",
    entityType: "Conversation",
    entityId: conversationId,
    metadata: { removed: userId },
  });

  return getConversation(actor, conversationId);
}

export async function leaveConversation(actor: Actor, conversationId: string) {
  const { conversation, me } = await requireParticipant(actor, conversationId);
  if (!conversation.isGroup) throw ApiError.badRequest("Une conversation à deux ne peut pas être quittée.");
  if (me.leftAt !== null) throw ApiError.badRequest("Vous ne faites plus partie de ce groupe.");

  const remaining = conversation.participants.filter((p) => p.leftAt === null && p.userId !== actor.userId);
  await prisma.conversationParticipant.update({
    where: { conversationId_userId: { conversationId, userId: actor.userId } },
    data: { leftAt: new Date(), isAdmin: false },
  });

  // Le groupe ne doit jamais se retrouver sans administrateur : le plus
  // ancien membre restant le devient automatiquement.
  const stillAdmin = remaining.some((p) => p.isAdmin);
  if (!stillAdmin && remaining.length > 0) {
    const next = await prisma.conversationParticipant.findFirst({
      where: { conversationId, leftAt: null, userId: { not: actor.userId } },
      orderBy: { joinedAt: "asc" },
      select: { userId: true },
    });
    if (next) {
      await prisma.conversationParticipant.update({
        where: { conversationId_userId: { conversationId, userId: next.userId } },
        data: { isAdmin: true },
      });
    }
  }

  await postSystemMessage(conversationId, actor.userId, "PARTICIPANT_LEFT", "a quitté le groupe");
  await logActivity({
    userId: actor.userId,
    action: "CONVERSATION_LEFT",
    entityType: "Conversation",
    entityId: conversationId,
  });
}

export async function renameConversation(actor: Actor, conversationId: string, title: string) {
  const { conversation, me } = await requireParticipant(actor, conversationId);
  requireGroupAdmin(conversation, me);

  await prisma.conversation.update({ where: { id: conversationId }, data: { title } });
  await postSystemMessage(conversationId, actor.userId, "GROUP_RENAMED", `a renommé le groupe en « ${title} »`);
  await logActivity({
    userId: actor.userId,
    action: "CONVERSATION_RENAMED",
    entityType: "Conversation",
    entityId: conversationId,
    metadata: { title },
  });

  return getConversation(actor, conversationId);
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

interface ThreadFilters {
  page: number;
  pageSize: number;
}

export async function getThread(actor: Actor, conversationId: string, filters: ThreadFilters) {
  await requireParticipant(actor, conversationId);

  const where = { conversationId };
  const [items, total] = await Promise.all([
    prisma.message.findMany({
      where,
      select: { ...messageSelect, sender: { select: contactSelect } },
      orderBy: { createdAt: "desc" },
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
    }),
    prisma.message.count({ where }),
  ]);

  // Ordre chronologique pour l'affichage (le plus récent en bas, comme une
  // conversation), alors que la pagination elle-même part du plus récent.
  return {
    items: items.reverse().map((m) => ({ ...presentMessage(m), sender: presentContact(m.sender) })),
    total,
    page: filters.page,
    pageSize: filters.pageSize,
  };
}

async function notifyUsers(
  userIds: string[],
  args: { title: string; body: string; conversationId: string }
) {
  for (const userId of userIds) {
    await createNotification({
      userId,
      type: NotificationType.MESSAGE_RECEIVED,
      title: args.title,
      body: args.body,
      relatedEntityType: "Conversation",
      // L'identifiant du FIL (et non plus de l'expéditeur comme avant les
      // groupes) : c'est ce dont l'écran de conversation a besoin pour ouvrir
      // directement le bon fil au clic sur la notification.
      relatedEntityId: args.conversationId,
    });
  }
}

/**
 * Notifie tous les membres actifs du fil sauf l'auteur de l'action. Les
 * destinataires ne dépendent jamais du rôle de qui écrit, uniquement de
 * l'appartenance réelle au fil (voir CLAUDE.md §8 : une personne concernée est
 * toujours notifiée, et personne d'autre ne l'est).
 */
async function notifyParticipants(args: {
  conversationId: string;
  actorId: string;
  title: string;
  body: string;
}) {
  const participants = await prisma.conversationParticipant.findMany({
    where: { conversationId: args.conversationId, leftAt: null, userId: { not: args.actorId } },
    select: { userId: true },
  });
  await notifyUsers(
    participants.map((p) => p.userId),
    { title: args.title, body: args.body, conversationId: args.conversationId }
  );
}

export async function sendMessage(
  actor: Actor,
  input: { conversationId: string; body?: string },
  attachment?: { photo?: Buffer; document?: { buffer: Buffer; fileName: string } }
) {
  const { conversation, canWrite } = await requireParticipant(actor, input.conversationId);
  if (!canWrite) throw ApiError.forbidden("Vous ne faites plus partie de ce groupe.");

  const photoBuffer = attachment?.photo;
  const documentFile = attachment?.document;
  if (photoBuffer && documentFile) {
    throw ApiError.badRequest("Joignez soit une photo, soit un document, pas les deux.");
  }
  // Retour explicite du client : joindre une photo ou un document au message —
  // un message peut donc n'être qu'une pièce jointe, sans texte, mais jamais
  // entièrement vide (ce que ne peut pas vérifier le schéma zod seul, qui ne
  // connaît pas req.file : voir messages.validation.ts).
  if (!input.body && !photoBuffer && !documentFile) {
    throw ApiError.badRequest("Le message ne peut pas être vide.");
  }

  // Pour un fil à deux, un message vers un compte désactivé n'a plus de
  // destinataire capable de le lire : on le refuse, comme avant les groupes.
  if (!conversation.isGroup) {
    const otherId = conversation.participants.find((p) => p.userId !== actor.userId)?.userId;
    if (otherId) await getContactById(otherId);
  }

  // Fichiers stockés HORS transaction comme partout ailleurs dans l'app — un
  // fichier orphelin est nettoyé si la création du message échoue.
  const storedPhoto = photoBuffer ? await storeImage(photoBuffer) : null;
  const storedDocument = documentFile ? await storePdfDocument(documentFile.buffer) : null;

  let message;
  try {
    message = await prisma.message.create({
      data: {
        conversationId: input.conversationId,
        senderId: actor.userId,
        body: input.body,
        photoKey: storedPhoto?.storageKey,
        documentKey: storedDocument?.storageKey,
        documentName: documentFile?.fileName,
        documentSize: storedDocument?.sizeBytes,
      },
      select: { ...messageSelect, sender: { select: contactSelect } },
    });
  } catch (err) {
    if (storedPhoto) await deleteStoredImage(storedPhoto.storageKey);
    if (storedDocument) await deleteStoredFile(storedDocument.storageKey);
    throw err;
  }

  await prisma.$transaction([
    prisma.conversation.update({
      where: { id: input.conversationId },
      data: { lastMessageAt: message.createdAt },
    }),
    // L'expéditeur a forcément lu son propre message : son curseur avance avec
    // lui, sinon son propre envoi ferait clignoter son compteur de non-lus.
    prisma.conversationParticipant.update({
      where: { conversationId_userId: { conversationId: input.conversationId, userId: actor.userId } },
      data: { lastReadAt: message.createdAt },
    }),
  ]);

  await logActivity({ userId: actor.userId, action: "MESSAGE_SENT", entityType: "Message", entityId: message.id });

  // Notification interne (cloche) + push, comme tout autre événement de l'app.
  const senderName = `${message.sender.firstName} ${message.sender.lastName}`;
  const preview = input.body ?? (storedDocument ? `📄 ${documentFile?.fileName ?? "Document"}` : "📷 Photo");
  await notifyParticipants({
    conversationId: input.conversationId,
    actorId: actor.userId,
    // Dans un groupe, le titre porte le nom du groupe et le corps rappelle qui
    // parle : sans cela, une notification de groupe est indistinguable d'un
    // message privé de la même personne.
    title: conversation.isGroup ? (conversation.title ?? "Groupe") : senderName,
    body: conversation.isGroup ? `${message.sender.firstName} : ${preview}` : preview,
  });

  return { ...presentMessage(message), sender: presentContact(message.sender) };
}

// Sert la photo d'un message — jamais d'URL publique, réservée aux
// participants du fil (même principe que le reste de la messagerie).
export async function getMessagePhoto(actor: Actor, messageId: string) {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: { conversationId: true, photoKey: true },
  });
  if (!message?.conversationId || !message.photoKey) throw ApiError.notFound("Photo introuvable.");
  await requireParticipant(actor, message.conversationId);
  return { storageKey: message.photoKey };
}

// Même principe pour le document joint (retour explicite du client : "un
// partage de document") — le PDF n'est jamais accessible par une URL publique.
export async function getMessageDocument(actor: Actor, messageId: string) {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: { conversationId: true, documentKey: true, documentName: true },
  });
  if (!message?.conversationId || !message.documentKey) throw ApiError.notFound("Document introuvable.");
  await requireParticipant(actor, message.conversationId);
  return { storageKey: message.documentKey, fileName: message.documentName ?? "document.pdf" };
}

export async function markThreadRead(actor: Actor, conversationId: string) {
  await requireParticipant(actor, conversationId);
  await prisma.conversationParticipant.updateMany({
    where: { conversationId, userId: actor.userId },
    data: { lastReadAt: new Date() },
  });
}
