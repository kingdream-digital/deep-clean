import { Platform } from "react-native";
import { apiClient, API_URL } from "./client";
import type { Role } from "./auth.api";
import type { LocalPhotoAsset } from "./problems.api";

export interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  role: Role;
  /** Jamais la clé de stockage : la photo passe par avatarUrl() + AuthenticatedImage. */
  hasAvatar: boolean;
}

export interface Participant extends Contact {
  /** Peut renommer le groupe, ajouter et retirer des participants. */
  isAdmin: boolean;
  /** A quitté le groupe ou en a été retiré : reste nommé dans l'historique. */
  hasLeft: boolean;
}

export interface MessageDocument {
  name: string;
  sizeBytes: number;
}

export interface ChatMessage {
  id: string;
  conversationId: string | null;
  senderId: string;
  sender: Contact;
  /** Optionnel : un message peut n'être qu'une photo ou qu'un document. */
  body: string | null;
  hasPhoto: boolean;
  document: MessageDocument | null;
  /** Événement de vie du groupe (création, arrivée, départ, renommage). */
  systemEvent: string | null;
  createdAt: string;
}

export interface Conversation {
  id: string;
  isGroup: boolean;
  /** Nom du groupe, ou nom complet de l'interlocuteur pour un fil à deux. */
  title: string;
  /** Toujours renseigné pour un fil à deux, toujours null pour un groupe. */
  otherUser: Participant | null;
  participants: Participant[];
  isAdmin: boolean;
  hasLeft: boolean;
  lastMessageAt: string;
}

export interface ConversationSummary extends Conversation {
  lastMessage: (ChatMessage & { senderName: string }) | null;
  unreadCount: number;
}

export async function listContacts(): Promise<Contact[]> {
  const { data } = await apiClient.get<{ items: Contact[] }>("/messages/contacts");
  return data.items;
}

export async function getContact(id: string): Promise<Contact> {
  const { data } = await apiClient.get<{ contact: Contact }>(`/messages/contacts/${id}`);
  return data.contact;
}

export async function listConversations(): Promise<ConversationSummary[]> {
  const { data } = await apiClient.get<{ items: ConversationSummary[] }>("/messages/conversations");
  return data.items;
}

export async function getConversation(id: string): Promise<Conversation> {
  const { data } = await apiClient.get<{ conversation: Conversation }>(`/messages/conversations/${id}`);
  return data.conversation;
}

/**
 * Ouvre (ou crée) le fil à deux avec quelqu'un. Utilisé partout où l'on ne
 * connaît qu'une personne et pas un fil : annuaire, fiche contact, équipe
 * d'une mission.
 */
export async function openDirectConversation(userId: string): Promise<Conversation> {
  const { data } = await apiClient.post<{ conversation: Conversation }>("/messages/conversations/direct", { userId });
  return data.conversation;
}

export async function createGroupConversation(title: string, participantIds: string[]): Promise<Conversation> {
  const { data } = await apiClient.post<{ conversation: Conversation }>("/messages/conversations/group", {
    title,
    participantIds,
  });
  return data.conversation;
}

export async function renameConversation(id: string, title: string): Promise<Conversation> {
  const { data } = await apiClient.patch<{ conversation: Conversation }>(`/messages/conversations/${id}`, { title });
  return data.conversation;
}

export async function addParticipants(id: string, userIds: string[]): Promise<Conversation> {
  const { data } = await apiClient.post<{ conversation: Conversation }>(`/messages/conversations/${id}/participants`, {
    userIds,
  });
  return data.conversation;
}

export async function removeParticipant(id: string, userId: string): Promise<Conversation> {
  const { data } = await apiClient.delete<{ conversation: Conversation }>(
    `/messages/conversations/${id}/participants/${userId}`
  );
  return data.conversation;
}

export async function leaveConversation(id: string): Promise<void> {
  await apiClient.post(`/messages/conversations/${id}/leave`);
}

export async function getUnreadMessagesCount(): Promise<number> {
  const { data } = await apiClient.get<{ unreadCount: number }>("/messages/unread-count");
  return data.unreadCount;
}

interface ThreadResponse {
  items: ChatMessage[];
  total: number;
  page: number;
  pageSize: number;
}

export async function getThread(conversationId: string, page = 1, pageSize = 50): Promise<ThreadResponse> {
  const { data } = await apiClient.get<ThreadResponse>(`/messages/conversations/${conversationId}/messages`, {
    params: { page, pageSize },
  });
  return data;
}

// Jamais d'URL publique permanente (voir CLAUDE.md section 11) : chaque
// affichage repasse par une requête authentifiée, voir components/AuthenticatedImage.tsx.
export function messagePhotoUrl(messageId: string): string {
  return `${API_URL}/messages/${messageId}/photo`;
}

/** Télécharge le document joint pour l'ouvrir/l'enregistrer (voir utils/shareFile.ts). */
export async function downloadMessageDocument(messageId: string): Promise<Uint8Array> {
  const { data } = await apiClient.get<ArrayBuffer>(`/messages/${messageId}/document`, {
    responseType: "arraybuffer",
  });
  return new Uint8Array(data);
}

export interface LocalDocumentAsset {
  uri: string;
  fileName: string;
  /** Web uniquement : le FormData d'un navigateur n'accepte qu'un Blob/File. */
  file?: File;
}

export async function sendMessage(
  conversationId: string,
  body?: string,
  attachment?: { photo?: LocalPhotoAsset; document?: LocalDocumentAsset }
): Promise<ChatMessage> {
  const formData = new FormData();
  formData.append("conversationId", conversationId);
  if (body) formData.append("body", body);

  const photo = attachment?.photo;
  if (photo) {
    if (Platform.OS === "web" && photo.file) {
      formData.append("photo", photo.file, photo.fileName ?? photo.file.name);
    } else {
      formData.append("photo", {
        uri: photo.uri,
        name: photo.fileName ?? `message-${Date.now()}.jpg`,
        type: photo.mimeType ?? "image/jpeg",
      } as unknown as Blob);
    }
  }

  const document = attachment?.document;
  if (document) {
    if (Platform.OS === "web" && document.file) {
      formData.append("document", document.file, document.fileName);
    } else {
      formData.append("document", {
        uri: document.uri,
        name: document.fileName,
        type: "application/pdf",
      } as unknown as Blob);
    }
  }

  const { data } = await apiClient.post<{ message: ChatMessage }>("/messages", formData);
  return data.message;
}

export async function markThreadRead(conversationId: string): Promise<void> {
  await apiClient.post(`/messages/conversations/${conversationId}/read`);
}
